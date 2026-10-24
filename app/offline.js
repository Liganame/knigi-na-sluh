// Работа без интернета: регистрация фоновой службы (sw.js), скачивание голоса, установка на экран.
export const AUDIO_CACHE = 'knl-audio-v1';

// В приложении для Android все файлы внутри — фоновая служба и скачивание голосов там не нужны.
export const NATIVE = !!window.Capacitor?.isNativePlatform?.();

/** Снять фоновую службу и стереть её кэши. true — страница была под службой (значит, могла показать старые файлы). */
async function dropServiceWorker() {
  const had = !!navigator.serviceWorker.controller;
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    // чистить нечего или хранилище недоступно
  }
  return had;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (NATIVE) {
    dropServiceWorker().then(had => {
      if (had && !sessionStorage.getItem('knl.swgone')) {   // один раз: перезагрузка уже без службы — с новыми файлами
        sessionStorage.setItem('knl.swgone', '1');
        location.reload();
      }
    });
    return;
  }
  // Сайт: вышла новая версия — служба сменилась; если страницу только что открыли, сразу перезагружаем,
  // чтобы новая версия была видна с первого раза, а не со второго.
  const updating = !!navigator.serviceWorker.controller;
  const openedAt = Date.now();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating && Date.now() - openedAt < 15000) location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {
    // без фоновой службы сайт просто работает только с интернетом
  });
}

/** Файлы голоса: текст книги, тайминги и звук всех глав (текст — чтобы книга открылась без сети). */
export function voiceFiles(book, voiceId) {
  const base = `books/${book.slug}`;
  return [`${base}/book.json`, 'books/index.json', 'books/function_words.json', `${base}/timings/${voiceId}.json`,
    ...book.chapters.map(c => `${base}/audio/${voiceId}/ch${c.n}.mp3`)];
}

/** Какие голоса уже скачаны целиком: {voiceId: true}. */
export async function offlineVoices(book) {
  const out = {};
  if (NATIVE) {
    for (const v of book.voices) out[v.id] = true;   // в приложении звук книги уже внутри
    return out;
  }
  if (!('caches' in window)) return out;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    for (const v of book.voices) {
      const hits = await Promise.all(voiceFiles(book, v.id).map(u => cache.match(new URL(u, location.href).href)));
      out[v.id] = hits.every(Boolean);
    }
  } catch {
    // хранилище недоступно — считаем, что ничего не скачано
  }
  return out;
}

/** Скачать голос; onProgress(доля 0..1). Бросает ошибку с понятным текстом. */
export async function downloadVoice(book, voiceId, onProgress) {
  if (!('caches' in window)) throw new Error('этот браузер не умеет хранить файлы для офлайна');
  const cache = await caches.open(AUDIO_CACHE);
  const files = voiceFiles(book, voiceId);
  let done = 0;
  for (const f of files) {
    const url = new URL(f, location.href).href;
    if (!(await cache.match(url))) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`не скачался ${f} (ответ ${r.status})`);
      await cache.put(url, r);
    }
    done++;
    onProgress(done / files.length);
  }
}

export async function removeVoice(book, voiceId) {
  const cache = await caches.open(AUDIO_CACHE);
  await Promise.all(voiceFiles(book, voiceId).map(f => cache.delete(new URL(f, location.href).href)));
}

/** Кнопка «Установить на главный экран» (Android Chrome присылает событие beforeinstallprompt). */
export function initInstall(row, button) {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    row.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    row.hidden = true;
  });
  window.addEventListener('appinstalled', () => { row.hidden = true; });
}
