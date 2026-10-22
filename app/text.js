// Разбор английской фразы на слова и поиск подсказки к слову.
// Правила нормализации совпадают с pipeline/validate_translation.py и pipeline/tts.py:
// слово плеера = кусок фразы между пробелами, в котором есть буква или цифра.

let FUNCTION = {};

export function setFunctionWords(dict) {
  FUNCTION = dict || {};
}

export function norm(w) {
  let s = w.toLowerCase().replace(/’/g, "'");
  s = s.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '');
  if (s.endsWith("'s") && !(s in FUNCTION)) s = s.slice(0, -2);
  return s;
}

/** Разбор фразы: tokens — все куски для отрисовки, words — только слова (с номерами), hintOf — номер подсказки у слова. */
export function parsePhrase(ph) {
  const tokens = ph.en.split(/\s+/).filter(Boolean).map(tok => {
    if (!/[A-Za-z0-9]/.test(tok)) return { tok, word: false };
    const m = tok.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9']*)$/);
    return { tok, word: true, pre: m[1], core: m[2], post: m[3], n: norm(tok) };
  });
  const words = tokens.filter(t => t.word);
  const hintOf = new Array(words.length).fill(-1);
  (ph.gl || []).forEach((g, gi) => {
    const parts = g[0].split(/\s+/).map(norm).filter(Boolean);
    for (let k = 0; k + parts.length <= words.length; k++) {
      if (parts.every((p, j) => words[k + j].n === p) && hintOf.slice(k, k + parts.length).every(h => h < 0)) {
        for (let j = 0; j < parts.length; j++) hintOf[k + j] = gi;
      }
    }
  });
  return { tokens, words, hintOf };
}

/** Границы сочетания, к которому относится слово k (для «got ready» — оба слова). */
export function hintSpan(parsed, k) {
  const h = parsed.hintOf[k];
  if (h < 0) return [k, k];
  let a = k;
  let b = k;
  while (a > 0 && parsed.hintOf[a - 1] === h) a--;
  while (b < parsed.hintOf.length - 1 && parsed.hintOf[b + 1] === h) b++;
  return [a, b];
}

/** Что показать по слову: {shown, ru, base, kind: 'gloss' | 'function' | 'none'}. */
export function lookup(ph, parsed, k) {
  const gi = parsed.hintOf[k];
  if (gi >= 0) {
    const [w, ru, base] = ph.gl[gi];
    return { shown: w, ru, base: base || '', kind: 'gloss' };
  }
  const word = parsed.words[k];
  const fw = FUNCTION[word.n];
  if (fw) return { shown: word.core, ru: fw, base: '', kind: 'function' };
  return { shown: word.core, ru: '', base: '', kind: 'none' };
}

/** DOM-фрагмент английской фразы со словами-кнопками. */
export function enNodes(parsed, i) {
  const frag = document.createDocumentFragment();
  let k = 0;
  parsed.tokens.forEach((t, j) => {
    if (j) frag.append(' ');
    if (!t.word) {
      frag.append(t.tok);
      return;
    }
    if (t.pre) frag.append(t.pre);
    const s = document.createElement('span');
    s.className = 'w';
    s.dataset.i = i;
    s.dataset.k = k;
    s.textContent = t.core;
    if (parsed.hintOf[k] >= 0) s.dataset.h = parsed.hintOf[k];
    frag.append(s);
    if (t.post) frag.append(t.post);
    k++;
  });
  return frag;
}
