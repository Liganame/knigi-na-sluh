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

export const DEFAULT_SETTINGS = Object.freeze({ minutes: 90, newWords: 30, newPhrases: 10, level: 'A1', speech: true, startLevel: 'A1' });
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
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v && typeof v === 'object' && v.c && !Number.isNaN(new Date(v.c.due).getTime())));
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
  const fastDays = new Set(prev?.fd || []);
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

/* ---------- дневник ---------- */
export function dayLog(d = today()) {
  return { sec: 0, newWords: 0, newPhrases: 0, reviews: 0, ...(get('days', {})[d] || {}) };
}
export function addToDay(patch) {
  const all = get('days', {});
  const d = today();
  const cur = { sec: 0, newWords: 0, newPhrases: 0, reviews: 0, ...(all[d] || {}) };
  for (const [k, v] of Object.entries(patch)) cur[k] = (cur[k] || 0) + v;
  set('days', { ...all, [d]: cur });
}
/** Секунды книги за сегодня — плеер книги пишет их в knl.listen по той же местной дате. */
export function bookSecondsToday() {
  try {
    const v = JSON.parse(localStorage.getItem('knl.listen') || '{}')[today()];
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
/** Местная дата i дней назад (через календарь, а не минус 24 часа — переход на летнее время не сбивает). */
function daysAgo(i) {
  const x = new Date();
  x.setDate(x.getDate() - i);
  return x.toLocaleDateString('sv-SE');
}
export function history(days = 7) {
  const all = get('days', {});
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    out.push({ d, sec: (all[d]?.sec || 0) });
  }
  return out;
}
export function streak() {
  const all = get('days', {});
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = daysAgo(i);
    if ((all[d]?.sec || 0) >= 600) n++;
    else if (i > 0) break;
  }
  return n;
}
export const totalHours = () => Object.values(get('days', {})).reduce((s, x) => s + (Number(x?.sec) || 0), 0) / 3600;

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
    if (k.startsWith('knl.')) out[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ app: 'knigi-na-sluh', v: 1, data: out });
}
export function importAll(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('текст повреждён — скопируйте выгрузку целиком');
  }
  if (d?.app !== 'knigi-na-sluh' || !d.data || typeof d.data !== 'object') throw new Error('это не выгрузка «Книг на слух»');
  const items = Object.entries(d.data).filter(([k, v]) => k.startsWith('knl.') && typeof v === 'string');
  for (const [, v] of items) JSON.parse(v);   // каждое значение — JSON, иначе ничего не записываем
  const before = items.map(([k]) => [k, localStorage.getItem(k)]);
  try {
    for (const [k, v] of items) localStorage.setItem(k, v);
  } catch {
    // память переполнилась посреди записи — возвращаем всё как было, без смеси старого и нового
    for (const [k, v] of before) {
      try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* уже нечего сделать */ }
    }
    throw new Error('не хватило памяти устройства — прогресс не изменён');
  }
  cards = loadCards();
}
