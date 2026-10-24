// Распознавание речи: в APK — встроенное распознавание Android (модуль Capgo),
// в браузере — Web Speech API (Chrome, Safari). Если ничего нет — null, и упражнение
// предлагает самооценку «сказал верно / не вышло».
const native = () => window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.SpeechRecognition;
// если за это время не пришло ни слова — считаем, что распознавание не работает (бывает на iPhone в режиме значка)
const SILENCE_MS = 8000;
const MAX_MS = 24000;   // предел на одну фразу: дольше — останавливаем и берём, что расслышали
let attempt = 0;        // номер попытки: abort() увеличивает — отменённая попытка не включит микрофон позже

export function available() {
  return !!(native() || window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Слушать одну фразу. onPartial(text) — промежуточный текст. Возвращает
 * {text, firstSec} — что расслышано и через сколько секунд от нажатия начали говорить.
 * Ошибки: Error с полем code: 'unavailable' | 'denied' | 'network' | 'silent' | 'nomatch'.
 */
export function listen({ lang = 'en-US', onPartial = () => {} } = {}) {
  const fail = (code, msg) => Object.assign(new Error(msg), { code });
  const t0 = performance.now();
  const plugin = native();
  if (plugin) return listenNative(plugin, lang, onPartial, t0, fail);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return Promise.reject(fail('unavailable', 'распознавание речи недоступно'));
  return new Promise((resolve, reject) => {
    const rec = new SR();
    const guard = setTimeout(() => {
      if (!text) {
        try { rec.abort(); } catch { /* уже остановлено */ }
        reject(fail('silent', 'распознавание не отвечает'));
      }
    }, SILENCE_MS);
    const cap = setTimeout(() => {
      try { rec.stop(); } catch { /* уже остановлено */ }   // onend отдаст расслышанное
    }, MAX_MS);
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let first = null;
    let text = '';
    rec.onresult = ev => {
      if (first == null) first = (performance.now() - t0) / 1000;
      text = Array.from(ev.results).map(r => r[0].transcript).join(' ');
      onPartial(text);
    };
    rec.onerror = e => clearTimeout(guard) || clearTimeout(cap) || reject(fail(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'network' ? 'network' : 'nomatch', e.error));
    rec.onend = () => {
      clearTimeout(guard);
      clearTimeout(cap);
      if (text) resolve({ text, firstSec: first });
      else reject(fail('nomatch', 'ничего не расслышано'));
    };
    current = rec;
    try {
      rec.start();
    } catch {
      reject(fail('unavailable', 'микрофон занят'));
    }
  });
}

let current = null;
export function abort() {
  attempt++;
  try { current?.abort?.(); } catch { /* уже остановлено */ }
  current = null;
  const plugin = native();
  if (plugin) plugin.stop?.().catch?.(() => {});
}

async function listenNative(plugin, lang, onPartial, t0, fail) {
  const mine = ++attempt;
  const perm = await plugin.requestPermissions?.().catch(() => null);
  if (mine !== attempt) throw fail('nomatch', 'попытка отменена');   // пока спрашивали разрешение, ушли с экрана
  if (perm && (perm.speechRecognition === 'denied' || perm.microphone === 'denied')) throw fail('denied', 'нет доступа к микрофону');
  // Модуль Capgo 8.4: при partialResults:false start() ждёт конца фразы и отдаёт итог;
  // начало речи (для «на автомате») — по первому заметному уровню громкости audioLevel (0..1).
  let first = null;
  let text = '';
  const subs = (await Promise.allSettled([
    plugin.addListener?.('audioLevel', e => {
      if (first == null && e.level > 0.15) first = (performance.now() - t0) / 1000;
    }),
    plugin.addListener?.('partialResults', e => {
      if (e.matches && e.matches[0]) {
        text = e.matches[0];
        onPartial(text);
      }
    }),
  ])).map(r => r.value);
  // тайм-ауты, как в браузере: 8 с тишины — распознавание не работает; 24 с — предел на одну фразу
  let timer;
  const watchdog = new Promise((_, reject) => {
    const check = () => {
      const t = performance.now() - t0;
      if ((first == null && t > SILENCE_MS) || t > MAX_MS) {
        plugin.stop?.().catch?.(() => {});
        reject(fail('silent', 'распознавание не отвечает'));
      } else timer = setTimeout(check, 500);
    };
    timer = setTimeout(check, 500);
  });
  try {
    const started = plugin.start({ language: lang, maxResults: 1, partialResults: false, popup: false });
    started.catch(() => {});   // если победил тайм-аут, поздний отказ плагина уже никому не нужен
    const r = await Promise.race([started, watchdog]);
    const fin = (r && r.matches && r.matches[0]) || text;
    if (!fin) throw fail('nomatch', 'ничего не расслышано');
    return { text: fin, firstSec: first ?? (performance.now() - t0) / 1000 };
  } catch (e) {
    if (e.code) throw e;
    const msg = String(e.message || e);
    throw fail(/permission/i.test(msg) ? 'denied' : /network/i.test(msg) ? 'network' : 'nomatch', msg);
  } finally {
    clearTimeout(timer);
    subs.forEach(s => s?.remove?.());
  }
}

/** Доля слов цели, которые есть в расслышанном (порядок не важен, регистр и знаки — тоже). */
export function match(target, heard) {
  const norm = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const want = norm(target);
  const got = new Set(norm(heard));
  const words = want.map(w => ({ w, ok: got.has(w) }));
  return { share: want.length ? words.filter(x => x.ok).length / want.length : 0, words };
}
