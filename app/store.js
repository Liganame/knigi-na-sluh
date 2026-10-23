// Память браузера: настройки, место чтения, словарь, прогресс.
// Хранилище может быть недоступно (приватный режим) — тогда всё работает без памяти.
const PREFIX = 'knl.';

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // хранилище недоступно или переполнено — работаем без памяти
    }
  },
};

export const DEFAULTS = Object.freeze({
  voice: '', speed: 1, pitch: 0, formant: 0, en: 'cap', karaoke: true,
  gap: 0, repeat: 1, echo: false, echoK: 1, autoNext: true, font: 1, theme: 'system', sleep: 0,
});

/** Общие настройки плеера (одни на все книги). */
export function loadSettings() {
  return { ...DEFAULTS, ...store.get('settings', {}) };
}
export function saveSettings(s) {
  store.set('settings', s);
}

/** Место чтения в книге: {ch, idx}. */
export const position = {
  get: slug => store.get(`pos.${slug}`, { ch: 1, idx: 0 }),
  set: (slug, ch, idx) => store.set(`pos.${slug}`, { ch, idx }),
};

/** Прослушанные фразы: по главам, множества номеров. */
export const heard = {
  get(slug, ch) {
    return new Set(store.get(`heard.${slug}.${ch}`, []));
  },
  add(slug, ch, idx) {
    const s = heard.get(slug, ch);
    if (s.has(idx)) return false;
    s.add(idx);
    store.set(`heard.${slug}.${ch}`, [...s]);
    return true;
  },
};

/** Минуты прослушивания по дням (для счётчика «сегодня»). */
export const listened = {
  today: () => new Date().toLocaleDateString('sv-SE'),   // местная дата ГГГГ-ММ-ДД — так же считает тренажёр
  seconds() {
    return store.get('listen', {})[listened.today()] || 0;
  },
  add(sec) {
    const all = store.get('listen', {});
    const d = listened.today();
    store.set('listen', { ...all, [d]: (all[d] || 0) + sec });
  },
};

/** Мой словарь: [{key, w, ru, base, slug, ch, i, a, b, en}] — новые сверху. */
export const vocab = {
  all: () => store.get('vocab', []),
  has: key => vocab.all().some(v => v.key === key),
  toggle(item) {
    const list = vocab.all();
    const next = list.some(v => v.key === item.key) ? list.filter(v => v.key !== item.key) : [item, ...list];
    store.set('vocab', next);
    return next.some(v => v.key === item.key);
  },
  remove(key) {
    store.set('vocab', vocab.all().filter(v => v.key !== key));
  },
};
