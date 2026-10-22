// Полка книг: карточки с прогрессом и ссылкой в плеер.
import { store, position } from './store.js';
import { registerServiceWorker } from './offline.js';

const box = document.querySelector('#books');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** «1 глава», «2 главы», «5 глав». */
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function progress(b) {
  let done = 0;
  for (let n = 1; n <= b.chapters; n++) done += store.get(`heard.${b.slug}.${n}`, []).length;
  return Math.min(1, done / b.phrases);
}

async function main() {
  const theme = store.get('settings', {}).theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  registerServiceWorker();
  try {
    const r = await fetch('books/index.json');
    if (!r.ok) throw new Error('ответ ' + r.status);
    const { books } = await r.json();
    box.replaceChildren();
    books.forEach(b => {
      const a = el('a', 'bcard');
      a.href = `reader.html?b=${encodeURIComponent(b.slug)}`;
      const cover = el('div', 'cover', b.title.slice(0, 1));
      cover.setAttribute('aria-hidden', 'true');
      const tx = el('div');
      const p = progress(b);
      const pos = position.get(b.slug);
      const bar = el('div', 'prog');
      const fill = el('i');
      fill.style.width = (p * 100).toFixed(1) + '%';
      bar.append(fill);
      const st = p > 0
        ? `Прослушано ${Math.round(p * 100)}% · остановились в главе ${pos.ch}`
        : `${plural(b.chapters, 'глава', 'главы', 'глав')} · ${plural(b.phrases, 'фраза', 'фразы', 'фраз')} · голоса: ${b.voices.join(', ')}`;
      tx.append(el('b', '', b.title), el('div', 'by', `${b.author}${b.year ? ', ' + b.year : ''} · английский ${b.level}`), bar, el('div', 'st', st));
      a.append(cover, tx);
      box.append(a);
    });
  } catch (e) {
    box.replaceChildren(el('p', 'lead', `Не удалось загрузить список книг (${e.message}). Проверьте интернет и обновите страницу.`));
  }
}

main();
