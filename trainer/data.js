// Данные тренажёра (собирает pipeline/build_trainer.py): слова по уровням, фразы с рамками и сценками, законы.
const base = 'trainer/data/';
const cache = new Map();

async function json(name) {
  if (!cache.has(name)) {
    const p = fetch(base + name).then(r => {
      if (!r.ok) throw new Error(`${name}: ответ ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return cache.get(name);
}

export const LEVELS = ['A1', 'A2'];
/** Версия приложения — видна на экране «Мой путь»; совпадает с versionName в Android-сборке. */
export const APP_VERSION = '1.2';
export const audioUrl = file => 'trainer/' + file;

/** Пачки уровня: [{id, audio, story, words: [{id, w, ru, ex, exru, assoc, law, ipa, a, x}]}]. */
export async function packs(level) {
  return (await json(`words-${level}.json`)).packs;
}

/** Все слова всех уровней по id (для повторений). */
export async function wordIndex() {
  const out = new Map();
  for (const lv of LEVELS) {
    for (const p of await packs(lv)) for (const w of p.words) out.set(w.id, { ...w, pack: p.id, audio: p.audio, level: lv });
  }
  return out;
}

export const phrasesData = () => json('phrases.json');

/** Все фразы по id: {…фраза, sit, audio}. */
export async function phraseIndex() {
  const d = await phrasesData();
  const out = new Map();
  for (const s of d.situations) for (const p of s.phrases) out.set(p.id, { ...p, sit: s.id, sitTitle: s.title, audio: s.audio });
  return out;
}

export const lawsData = () => json('laws.json');
