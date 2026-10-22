// Отрисовка: текст главы, субтитр, дорожка по фразам, подсветка, автопрокрутка, счётчик.
import { enNodes } from './text.js';
import { heard, listened } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const fmt = s => {
  const v = Math.max(0, s || 0);
  return Math.floor(v / 60) + ':' + String(Math.floor(v % 60)).padStart(2, '0');
};

const EN_HINT = {
  cap: 'Английская фраза идёт полосой над плеером, текст книги остаётся чистым.',
  under: 'Английский перевод стоит под каждой русской фразой.',
  check: 'Английский размыт: сначала попробуйте понять на слух, потом нажмите на полосу.',
  off: 'Только русский текст и английский голос — чистое аудирование.',
};

const scroll = { userAt: -Infinity, programmatic: false };

export function initScroll() {
  $('#reader').addEventListener('scroll', () => {
    if (!scroll.programmatic) scroll.userAt = performance.now();
  }, { passive: true });
}

/** Текст главы. app.items[0] — заголовок, дальше фразы с номером абзаца p. */
export function renderChapter(app) {
  const ch = app.chapter;
  $('#ch-roman').textContent = ch.roman;
  const h1 = $('#ch-title');
  h1.replaceChildren(phraseEl(app, 0));
  const box = $('#text');
  box.replaceChildren();
  box.className = 'text mode-' + app.S.en;
  let p = null;
  let lastP = null;
  app.items.forEach((it, i) => {
    if (i === 0) return;
    if (it.p !== lastP) {
      p = document.createElement('p');
      box.append(p);
      lastP = it.p;
    }
    p.append(phraseEl(app, i));
    if (app.S.en !== 'under') p.append(' ');
  });
  const done = heard.get(app.slug, ch.n);
  done.forEach(i => $(`.ph[data-i="${i}"]`)?.classList.add('heard'));
  $('#en-hint').textContent = EN_HINT[app.S.en];
  $('#cap').hidden = app.S.en === 'off' || app.S.en === 'under';
}

function phraseEl(app, i) {
  const it = app.items[i];
  const el = document.createElement('span');
  el.className = 'ph';
  el.dataset.i = i;
  if (app.S.en === 'under') {
    const ru = document.createElement('span');
    ru.className = 'ru';
    ru.textContent = it.ru;
    const en = document.createElement('span');
    en.className = 'en';
    en.append(enNodes(app.parsed[i], i));
    el.append(ru, en);
  } else {
    el.textContent = it.ru;
  }
  return el;
}

export function renderTrack(app, total) {
  const tr = $('#track');
  $$('.seg', tr).forEach(n => n.remove());
  const T = app.engine.timings();
  if (!T) return;
  const done = heard.get(app.slug, app.chapter.n);
  const frag = document.createDocumentFragment();
  T.forEach((t, i) => {
    const s = document.createElement('div');
    s.className = 'seg' + (done.has(i) ? ' heard' : '');
    s.dataset.i = i;
    s.style.left = (t.start / total * 100) + '%';
    s.style.width = Math.max(0.3, (t.end - t.start) / total * 100 - 0.25) + '%';
    frag.append(s);
  });
  tr.prepend(frag);
  $('#t-all').textContent = fmt(total);
}

export function markPhrase(app, i) {
  $$('.ph.on, .seg.on').forEach(n => n.classList.remove('on'));
  $(`.ph[data-i="${i}"]`)?.classList.add('on');
  $(`.seg[data-i="${i}"]`)?.classList.add('on');
  $('#cap-en').replaceChildren(enNodes(app.parsed[i], i));
  $('#cap').classList.toggle('blur', app.S.en === 'check');
  $('#t-phrase').textContent = i === 0 ? 'заголовок' : `фраза ${i} из ${app.items.length - 1}`;
}

export function markHeard(app, i) {
  if (!heard.add(app.slug, app.chapter.n, i)) return;
  $(`.ph[data-i="${i}"]`)?.classList.add('heard');
  $(`.seg[data-i="${i}"]`)?.classList.add('heard');
}

let lastWord = -2;
export function karaoke(app, cur, k) {
  const key = app.S.karaoke ? cur * 10000 + k : -1;
  if (key === lastWord) return;
  lastWord = key;
  $$('.w.now').forEach(n => n.classList.remove('now'));
  if (app.S.karaoke && k >= 0) $$(`.w[data-i="${cur}"][data-k="${k}"]`).forEach(n => n.classList.add('now'));
}
export const resetKaraoke = () => { lastWord = -2; };

/** Прокрутить к текущей фразе, если человек не листал сам последние 5 секунд. */
export function follow(cur, force = false) {
  const el = $(`.ph[data-i="${cur}"]`);
  if (!el) return;
  if (!force && performance.now() - scroll.userAt < 5000) {
    $('#follow').hidden = false;
    return;
  }
  if (force) scroll.userAt = -Infinity;
  $('#follow').hidden = true;
  scroll.programmatic = true;
  const r = $('#reader');
  const er = el.getBoundingClientRect();
  const rr = r.getBoundingClientRect();
  r.scrollTop += (er.top - rr.top) - rr.height * 0.35;
  setTimeout(() => { scroll.programmatic = false; }, 700);
}

export function scrollToEl(el) {
  scroll.programmatic = true;
  el.scrollIntoView({ block: 'start' });
  setTimeout(() => { scroll.programmatic = false; }, 700);
}

export function renderStats(app) {
  const n = heard.get(app.slug, app.chapter.n).size;
  const mins = Math.floor(listened.seconds() / 60);
  $('#stats').textContent = `Прослушано ${n} из ${app.items.length} · сегодня ${mins} мин`;
}

export function renderTime(raw, total) {
  $('#head').style.left = (Math.min(raw, total) / total * 100) + '%';
  $('#t-now').textContent = fmt(raw);
}

export function renderWait(w) {
  const st = $('#cap-state');
  if (!w) {
    st.hidden = true;
    return;
  }
  st.hidden = false;
  st.innerHTML = '<svg class="ring" viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/>'
    + '<circle class="fg" cx="12" cy="12" r="9" stroke-dasharray="56.5" stroke-dashoffset="0"/></svg><span></span>';
  st.querySelector('span').textContent = w.label;
}

export function renderWaitProgress(w, now) {
  if (!w) return;
  const left = Math.max(0, w.until - now) / w.total;
  $('#cap-state .fg')?.setAttribute('stroke-dashoffset', String(56.5 * (1 - left)));
}

export function renderPlayIcon(playing) {
  $('#ico-play').innerHTML = playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  $('#btn-play').setAttribute('aria-label', playing ? 'Пауза' : 'Слушать');
}
