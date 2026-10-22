// Фоновая служба сайта: оболочка приложения и тексты — из кэша с обновлением в фоне;
// звук — только из явно скачанного кэша (кнопка «↓» у голоса), с поддержкой перемотки (Range).
const VERSION = 'v2';   // меняется при каждой выкладке кода — иначе открывшие сайт получат старую оболочку
const SHELL = `knl-shell-${VERSION}`;
const AUDIO = 'knl-audio-v1';
const SHELL_FILES = [
  './', 'index.html', 'reader.html', 'manifest.webmanifest',
  'app/style.css', 'app/main.js', 'app/engine.js', 'app/fx.js', 'app/text.js', 'app/view.js',
  'app/panels.js', 'app/store.js', 'app/offline.js', 'app/shelf.js',
  'vendor/SignalsmithStretch.js', 'fonts/fonts.css', 'books/index.json', 'books/function_words.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('knl-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function audioResponse(request) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(request.url);
  if (!hit) return fetch(request);
  const range = request.headers.get('range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0;
  let end = size - 1;
  if (m && m[1]) {
    start = parseInt(m[1], 10);
    if (m[2]) end = Math.min(parseInt(m[2], 10), size - 1);
  } else if (m && m[2]) {
    start = Math.max(0, size - parseInt(m[2], 10));   // bytes=-N — последние N байт
  }
  if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
  const net = fetch(event.request).then(r => {
    if (r.ok && r.type === 'basic') cache.put(event.request, r.clone());
    return r;
  }).catch(async () => hit || (await caches.match(event.request.url)) || Response.error());
  if (hit) {
    event.waitUntil(net.catch(() => null));
    return hit;
  }
  return net;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.url.endsWith('.mp3')) {
    event.respondWith(audioResponse(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(event));
});
