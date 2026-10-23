// Распознавание речи: в APK — встроенное распознавание Android (модуль Capgo),
// в браузере — Web Speech API (Chrome, Safari). Если ничего нет — null, и упражнение
// предлагает самооценку «сказал верно / не вышло».
const native = () => window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.SpeechRecognition;

export function available() {
  return !!(native() || window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Слушать одну фразу. onPartial(text) — промежуточный текст. Возвращает
 * {text, firstSec} — что расслышано и через сколько секунд от нажатия начали говорить.
 * Ошибки: Error с полем code: 'unavailable' | 'denied' | 'network' | 'nomatch'.
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
    rec.onerror = e => reject(fail(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'network' ? 'network' : 'nomatch', e.error));
    rec.onend = () => (text ? resolve({ text, firstSec: first }) : reject(fail('nomatch', 'ничего не расслышано')));
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
  try { current?.abort?.(); } catch { /* уже остановлено */ }
  current = null;
  const plugin = native();
  if (plugin) plugin.stop?.().catch?.(() => {});
}

async function listenNative(plugin, lang, onPartial, t0, fail) {
  const perm = await plugin.requestPermissions?.().catch(() => null);
  if (perm && (perm.speechRecognition === 'denied' || perm.microphone === 'denied')) throw fail('denied', 'нет доступа к микрофону');
  // Модуль Capgo 8.4: при partialResults:false start() ждёт конца фразы и отдаёт итог;
  // начало речи (для «на автомате») — по первому заметному уровню громкости audioLevel (0..1).
  let first = null;
  let text = '';
  const subs = await Promise.all([
    plugin.addListener?.('audioLevel', e => {
      if (first == null && e.level > 0.15) first = (performance.now() - t0) / 1000;
    }),
    plugin.addListener?.('partialResults', e => {
      if (e.matches && e.matches[0]) {
        text = e.matches[0];
        onPartial(text);
      }
    }),
  ]);
  try {
    const r = await plugin.start({ language: lang, maxResults: 1, partialResults: false, popup: false });
    const fin = (r && r.matches && r.matches[0]) || text;
    if (!fin) throw fail('nomatch', 'ничего не расслышано');
    return { text: fin, firstSec: first ?? (performance.now() - t0) / 1000 };
  } catch (e) {
    if (e.code) throw e;
    const msg = String(e.message || e);
    throw fail(/permission/i.test(msg) ? 'denied' : /network/i.test(msg) ? 'network' : 'nomatch', msg);
  } finally {
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
