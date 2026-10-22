// Работа без интернета: регистрация фоновой службы (sw.js), скачивание голоса, установка на экран.
export const AUDIO_CACHE = 'knl-audio-v1';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
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
