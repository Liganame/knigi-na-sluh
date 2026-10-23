// Звук тренажёра: файлы-«склейки» (sprite) — в одном MP3 много коротких кусков, у каждого [начало, конец].
// Играем через Web Audio: точные границы куска, работает без интернета из кэша фоновой службы.
let ctx = null;
const buffers = new Map();   // url → Promise<AudioBuffer>
let current = null;
let token = 0;   // номер последнего запроса play: ожидающий старый запрос после загрузки не зазвучит

function context() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function load(url) {
  if (!buffers.has(url)) {
    const p = fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`звук не загрузился (${r.status})`);
        return r.arrayBuffer();
      })
      .then(b => context().decodeAudioData(b));
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
    if (buffers.size > 40) buffers.delete(buffers.keys().next().value);  // не держим в памяти всё
  }
  return buffers.get(url);
}

export function preload(url) {
  load(url).catch(() => {});
}

export function stop() {
  token++;
  if (current) {
    try { current.stop(); } catch { /* уже остановлен */ }
    current = null;
  }
}

/**
 * Сыграть кусок [s, e] файла url. Обещание выполняется, когда кусок дозвучал, его прервали
 * или звук не загрузился (нет сети и кэша) — никогда не отклоняется, чтобы упражнение шло дальше.
 */
export async function play(url, seg) {
  if (!url || !seg) return false;
  stop();
  const my = token;
  let buf;
  const c = context();
  try {
    if (c.state === 'suspended') await c.resume().catch(() => {});
    buf = await load(url);
  } catch {
    return false;
  }
  if (my !== token) return false;   // пока грузилось, начался другой звук или ушли с экрана
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  const [s, e] = seg;
  current = src;
  return new Promise(resolve => {
    src.onended = () => {
      if (current === src) current = null;
      resolve(true);
    };
    src.start(0, Math.max(0, s), Math.max(0.05, e - s));
  });
}
