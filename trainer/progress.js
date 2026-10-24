// Прогресс ученика: карточки повторения (FSRS), дневник по дням, настройки, свои ассоциации,
// дворец памяти. Всё в памяти браузера/приложения этого устройства; выгрузка — текстом.
import { createEmptyCard, fsrs, Rating } from '../vendor/ts-fsrs.js';

const P = 'knl.t.';
const scheduler = fsrs({ enable_fuzz: true });
export { Rating };

/** Значение из памяти; если там не того вида, что умолчание (объект, список), — умолчание. */
function get(k, d) {
  try {
    const v = localStorage.getItem(P + k);
    if (v == null) return d;
    const x = JSON.parse(v);
    const shape = y => (y === null ? 'null' : Array.isArray(y) ? 'array' : typeof y);
    return shape(x) === shape(d) ? x : d;
  } catch {
    return d;
  }
}
function set(k, v) {
  try {
    localStorage.setItem(P + k, JSON.stringify(v));
  } catch {
    // память переполнена или недоступна — продолжаем без сохранения
  }
}

export const DEFAULT_SETTINGS = Object.freeze({ minutes: 90, newWords: 30, newPhrases: 10, level: 'A1', speech: true, sounds: true, startLevel: 'A1' });
const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
/** Настройки всегда проходят проверку: в них могло прийти что угодно из чужой выгрузки. */
function clean(s) {
  const D = DEFAULT_SETTINGS;
  return {
    minutes: clamp(s.minutes, 15, 240, D.minutes),
    newWords: clamp(s.newWords, 10, 60, D.newWords),
    newPhrases: clamp(s.newPhrases, 5, 30, D.newPhrases),
    level: oneOf(s.level, ['A1', 'A2'], D.level),
    speech: s.speech !== false,
    sounds: s.sounds !== false,
    startLevel: oneOf(s.startLevel, ['A1', 'A2', 'B1'], D.startLevel),
  };
}
export const settings = {
  get: () => clean({ ...DEFAULT_SETTINGS, ...get('settings', {}) }),
  set: s => set('settings', clean(s)),
};

/* ---------- карточки повторения ---------- */
/** Карточки без расписания (повреждённые или чужие) отбрасываются — иначе упадут повторения. */
function loadCards() {
  const all = get('cards', {});
  const num = x => typeof x === 'number' && Number.isFinite(x);
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v && typeof v === 'object' && v.c && !Number.isNaN(new Date(v.c.due).getTime())
    && ['stability', 'difficulty', 'reps', 'lapses', 'state'].every(f => num(v.c[f])) && v.c.state >= 0 && v.c.state <= 3
    && (v.fd == null || Array.isArray(v.fd))));
}
let cards = loadCards();
let saveTimer = null;
function saveCards() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => set('cards', cards), 300);
}
window.addEventListener('pagehide', () => set('cards', cards));

export const today = () => new Date().toLocaleDateString('sv-SE');   // ГГГГ-ММ-ДД по местному времени

/** Записать ответ: key — «w:слово» или «p:фраза», rating — Rating.Again/Hard/Good/Easy, fast — ответ «на автомате». */
export function review(key, rating, fast = false) {
  const now = new Date();
  const prev = cards[key];
  const base = prev ? { ...prev.c } : createEmptyCard(now);
  const { card } = scheduler.next(base, now, rating);
  const fastDays = new Set(Array.isArray(prev?.fd) ? prev.fd : []);
  if (fast) fastDays.add(today());
  cards = { ...cards, [key]: { c: card, fd: [...fastDays].slice(-10), seen: prev?.seen || today() } };
  saveCards();
  return card;
}
export const cardOf = key => cards[key];
export const isNew = key => !cards[key];
export const isAuto = key => (cards[key]?.fd || []).length >= 3;   // три разных дня быстро и верно
export function dueKeys(limit = 999) {
  const now = Date.now();
  return Object.entries(cards)
    .filter(([, v]) => new Date(v.c.due).getTime() <= now)
    .sort((a, b) => new Date(a[1].c.due) - new Date(b[1].c.due))
    .slice(0, limit)
    .map(([k]) => k);
}
export const learnedCount = prefix => Object.keys(cards).filter(k => k.startsWith(prefix)).length;
export const cardKeys = () => Object.keys(cards);

/* ---------- дневник ---------- */
export function dayLog(d = today()) {
  return { sec: 0, newWords: 0, newPhrases: 0, reviews: 0, points: 0, laws: 0, ...(get('days', {})[d] || {}) };
}
export function addToDay(patch) {
  const all = get('days', {});
  const d = today();
  const cur = { sec: 0, newWords: 0, newPhrases: 0, reviews: 0, ...(all[d] || {}) };
  for (const [k, v] of Object.entries(patch)) cur[k] = (cur[k] || 0) + v;
  set('days', { ...all, [d]: cur });
}
/** Секунды книги по датам — плеер книги пишет их в knl.listen по той же местной дате. */
export function bookByDate() {
  try {
    const all = JSON.parse(localStorage.getItem('knl.listen') || '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}
const bookSec = (book, d) => (Number.isFinite(book[d]) ? book[d] : 0);
export const bookSecondsToday = () => bookSec(bookByDate(), today());
/** Сколько минут книги уже оплачено очками: {дата: минуты}. */
export const bookPaid = {
  get: () => get('bookPaid', {}),
  set: m => set('bookPaid', m),
};
/** Местная дата i дней назад (через календарь, а не минус 24 часа — переход на летнее время не сбивает). */
function daysAgo(i) {
  const x = new Date();
  x.setDate(x.getDate() - i);
  return x.toLocaleDateString('sv-SE');
}
/** Время занятий за день: тренажёр + книга (слушать — тоже учиться). */
function daySec(all, book, d) {
  return (Number(all[d]?.sec) || 0) + bookSec(book, d);
}
export function history(days = 7) {
  const all = get('days', {});
  const book = bookByDate();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    out.push({ d, sec: daySec(all, book, d) });
  }
  return out;
}
/** Серия: дни подряд от 10 минут; сегодняшний день ещё идёт — он не обрывает серию, пока не кончился. */
export function streak() {
  const all = get('days', {});
  const book = bookByDate();
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (daySec(all, book, daysAgo(i)) >= 600) n++;
    else if (i > 0) break;
  }
  return n;
}
export const totalHours = () => {
  const trainer = Object.values(get('days', {})).reduce((s, x) => s + (Number(x?.sec) || 0), 0);
  const book = Object.values(bookByDate()).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  return (trainer + book) / 3600;
};

/* ---------- очки, счётчики, награды ---------- */
/** Очки: всего и за сегодня (дневник). */
export const points = {
  total: () => {
    const v = get('points', 0);
    return Number.isFinite(v) ? v : 0;
  },
  add(n) {
    const t = points.total() + n;
    set('points', t);
    addToDay({ points: n });
    return t;
  },
};
/** Счётчики событий для наград: scenes — пройденные сценки. */
export const stats = {
  get: () => get('stats', {}),
  add(key, n = 1) {
    const all = get('stats', {});
    set('stats', { ...all, [key]: (Number(all[key]) || 0) + n });
  },
};
/** Заработанные награды: {id: дата}. */
export const earned = {
  get: () => get('badges', {}),
  add: id => set('badges', { ...get('badges', {}), [id]: today() }),
};
/** Отметка «бонус за весь план дня уже выдан». */
export const dayFlag = {
  has: name => !!dayLog()[name],
  set: name => addToDay({ [name]: 1 }),
};

/* ---------- прочее ---------- */
export const done = {
  packs: () => new Set(get('packs', [])),
  addPack: id => set('packs', [...new Set([...get('packs', []), id])]),
  laws: () => new Set(get('laws', [])),
  addLaw: id => set('laws', [...new Set([...get('laws', []), id])]),
};
export const myAssoc = {
  get: id => get('assoc', {})[id] || '',
  set: (id, text) => set('assoc', { ...get('assoc', {}), [id]: text }),
};
export const myStory = {
  get: id => get('story', {})[id] || '',
  set: (id, text) => set('story', { ...get('story', {}), [id]: text }),
};
export const palace = {
  get: () => get('palace', ['Входная дверь', 'Вешалка', 'Зеркало', 'Ванная', 'Кухонный стол', 'Холодильник', 'Окно', 'Диван', 'Телевизор', 'Кровать']),
  set: list => set('palace', list),
};

/** Выгрузка и загрузка всего прогресса тренажёра одной строкой (перенос на другое устройство). */
export function exportAll() {
  set('cards', cards);
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('knl.')) out[k] = localStorage.getItem(k);
  }
  out[`${P}cards`] = JSON.stringify(cards);   // карточки — из памяти: запись в хранилище могла не пройти
  return JSON.stringify({ app: 'knigi-na-sluh', v: 1, data: out });
}
export function importAll(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('текст повреждён — скопируйте выгрузку целиком');
  }
  if (d?.app !== 'knigi-na-sluh' || !d.data || typeof d.data !== 'object' || Array.isArray(d.data)) throw new Error('это не выгрузка «Книг на слух»');
  const items = Object.entries(d.data).filter(([k, v]) => k.startsWith('knl.') && typeof v === 'string');
  if (!items.length) throw new Error('в выгрузке нет прогресса — прежний оставлен как был');
  for (const [, v] of items) JSON.parse(v);   // каждое значение — JSON, иначе ничего не записываем
  // загрузка — полная замена: прогресс этого устройства становится таким же, как в выгрузке
  const ours = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(k => k && k.startsWith('knl.'));
  const before = ours().map(k => [k, localStorage.getItem(k)]);
  try {
    ours().forEach(k => localStorage.removeItem(k));
    for (const [k, v] of items) localStorage.setItem(k, v);
  } catch {
    // память переполнилась посреди записи — сначала убираем недописанное (освобождает место), потом возвращаем прежнее
    ours().forEach(k => localStorage.removeItem(k));
    let lost = false;
    for (const [k, v] of before) {
      try { localStorage.setItem(k, v); } catch { lost = true; }
    }
    throw new Error(lost ? 'не хватило памяти устройства — часть прежнего прогресса не вернулась' : 'не хватило памяти устройства — прогресс не изменён');
  }
  cards = loadCards();
}
