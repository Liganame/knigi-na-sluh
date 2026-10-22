// Панели: настройки, голоса, подсказка по слову, словарь, меню глав, вопросы, подсказки первого запуска.
import { hintSpan, lookup } from './text.js';
import { vocab, heard, store } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ---------- тосты и шторки ---------- */
let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

const wide = () => matchMedia('(min-width: 1100px)').matches;
export function openSheet(id) {
  closePop();
  if (id === 'settings' && wide()) return;
  $$('.sheet.open').forEach(s => s.classList.remove('open'));
  $('#' + id).classList.add('open');
  $('#scrim').hidden = false;
}
export function closeSheets() {
  $$('.sheet.open').forEach(s => s.classList.remove('open'));
  $('#scrim').hidden = true;
  $('#menu').hidden = true;
}

/* ---------- настройки ---------- */
export function renderSeg(sel, val) {
  $$(sel + ' button').forEach(b => b.setAttribute('aria-pressed', String(String(val) === b.dataset.v)));
}

export function bindSettings(app, act) {
  const S = app.S;
  const bindSeg = (sel, key, cast, after) => {
    $$(sel + ' button').forEach(b => b.addEventListener('click', () => {
      S[key] = cast(b.dataset.v);
      act.save();
      renderSeg(sel, S[key]);
      if (after) after();
    }));
    renderSeg(sel, S[key]);
  };
  const sp = $('#in-speed');
  sp.value = S.speed;
  sp.oninput = () => { S.speed = +sp.value; act.save(); act.speed(); };
  const pi = $('#in-pitch');
  pi.value = S.pitch;
  pi.oninput = () => { S.pitch = +pi.value; act.save(); renderOutputs(S); act.fx(); };
  const fo = $('#in-formant');
  fo.value = S.formant;
  fo.oninput = () => { S.formant = +fo.value; act.save(); renderOutputs(S); act.fx(); };
  $('#fx-reset').onclick = () => {
    S.pitch = 0;
    S.formant = 0;
    pi.value = 0;
    fo.value = 0;
    act.save();
    renderOutputs(S);
    act.fx();
  };
  const toggleBox = (id, key, after) => {
    const c = $(id);
    c.checked = !!S[key];
    c.onchange = () => { S[key] = c.checked; act.save(); if (after) after(); };
  };
  toggleBox('#in-echo', 'echo', () => toast(S.echo ? 'Эхо включено: после фразы — пауза, чтобы повторить' : 'Эхо выключено'));
  toggleBox('#in-karaoke', 'karaoke');
  toggleBox('#in-autonext', 'autoNext');
  bindSeg('#seg-echoK', 'echoK', Number);
  bindSeg('#seg-repeat', 'repeat', Number);
  bindSeg('#seg-gap', 'gap', Number);
  bindSeg('#seg-en', 'en', String, act.enMode);
  bindSeg('#seg-font', 'font', Number, act.font);
  bindSeg('#seg-theme', 'theme', String, act.theme);
  bindSeg('#seg-sleep', 'sleep', v => (v === 'ch' ? 'ch' : Number(v)), act.sleep);
  renderOutputs(S);
}

export function renderOutputs(S) {
  const num = v => String(v).replace('.', ',');
  $('#o-speed').textContent = S.speed.toFixed(2).replace('.', ',') + '×';
  $('#o-pitch').textContent = (S.pitch > 0 ? '+' : '') + num(S.pitch) + ' пт';
  $('#o-formant').textContent = (S.formant > 0 ? '+' : '') + num(S.formant);
  $('#btn-speed').textContent = num(Math.round(S.speed * 100) / 100) + '×';
  $('#btn-speed').setAttribute('aria-label', 'Скорость ' + S.speed);
}

/* ---------- голоса ---------- */
export function renderVoices(app, act) {
  const box = $('#voices');
  box.replaceChildren();
  app.book.voices.forEach(v => {
    const it = el('div', 'voice');
    it.setAttribute('role', 'radio');
    it.tabIndex = 0;
    it.setAttribute('aria-checked', String(v.id === app.S.voice));
    const tx = el('div');
    tx.append(el('div', 'nm', v.name), el('div', 'ds', `${v.kind} · ${v.note}`));
    const acts = el('div', 'acts');
    const tr = el('button', 'pill', '▶ проба');
    tr.onclick = ev => { ev.stopPropagation(); act.tryVoice(v, tr); };
    const dl = el('button', 'pill', app.offline[v.id] ? '✓ офлайн' : '↓');
    dl.title = 'Скачать для работы без интернета';
    dl.setAttribute('aria-label', `Скачать голос ${v.name} для работы без интернета`);
    if (app.offline[v.id]) dl.classList.add('on');
    dl.onclick = ev => { ev.stopPropagation(); act.download(v, dl); };
    acts.append(tr, dl);
    it.append(el('div', 'grade', v.grade), tx, acts);
    const pick = () => act.voice(v.id);
    it.onclick = pick;
    it.onkeydown = ev => {
      if (ev.target !== it) return;   // Enter/пробел на кнопках «проба» и «↓» — их собственное действие
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        pick();
      }
    };
    box.append(it);
  });
}

/* ---------- подсказка по слову ---------- */
export function showHint(app, act, i, k) {
  const ph = app.items[i];
  const parsed = app.parsed[i];
  const [a, b] = hintSpan(parsed, k);
  const info = lookup(ph, parsed, k);
  $$('.w.sel').forEach(n => n.classList.remove('sel'));
  for (let j = a; j <= b; j++) $$(`.w[data-i="${i}"][data-k="${j}"]`).forEach(n => n.classList.add('sel'));
  const key = info.shown.toLowerCase();
  const pop = $('#pop');
  pop.replaceChildren();
  const close = el('button', 'txt-btn x', '✕');
  close.setAttribute('aria-label', 'Закрыть');
  close.onclick = closePop;
  pop.append(close, el('div', 'w1', info.shown));
  if (info.base) pop.append(el('div', 'base', 'Начальная форма: ' + info.base));
  const ru = info.kind === 'none' ? 'Подсказки к этому слову нет — смысл во фразе целиком.' : info.ru;
  pop.append(el('div', 'ru', ru));
  if (info.kind === 'function') pop.append(el('div', 'base', 'Служебное слово'));
  pop.append(el('div', 'base', 'Фраза: ' + ph.ru));
  const acts = el('div', 'acts');
  const bl = el('button', 'txt-btn', '▶ Послушать слово');
  bl.onclick = () => act.playWord(i, a, b);
  const bp = el('button', 'txt-btn', '↺ Вся фраза');
  bp.onclick = () => { closePop(); act.playFrom(i); };
  const bs = el('button', 'txt-btn', vocab.has(key) ? '★ В словаре' : '☆ В словарь');
  bs.onclick = () => {
    const on = vocab.toggle({ key, w: info.shown, ru: info.ru, base: info.base, slug: app.slug,
      ch: app.chapter.n, i, a, b, en: ph.en });
    bs.textContent = on ? '★ В словаре' : '☆ В словарь';
    renderVocabCount();
  };
  acts.append(bl, bp, bs);
  pop.append(acts);
  pop.hidden = false;
  const capTop = ($('#cap').hidden ? $('.player') : $('#cap')).getBoundingClientRect().top;
  pop.style.bottom = (window.innerHeight - capTop + 8) + 'px';
}

export function closePop() {
  $('#pop').hidden = true;
  $$('.w.sel').forEach(n => n.classList.remove('sel'));
}

/* ---------- словарь ---------- */
export function renderVocabCount() {
  const n = vocab.all().length;
  $('#vocab-count').textContent = n ? String(n) : '';
}

export function renderVocab(app, act) {
  const list = vocab.all();
  renderVocabCount();
  const box = $('#vocab');
  box.replaceChildren();
  if (!list.length) {
    box.append(el('div', 'empty', 'Пока пусто. Нажмите на английское слово и выберите «В словарь» — '
      + 'слово сохранится вместе с фразой и произношением.'));
    return;
  }
  list.forEach(v => {
    const it = el('div', 'vitem');
    const tx = el('div');
    tx.append(el('b', '', v.w), el('div', '', v.ru || '—'), el('div', 'ctx', v.en || ''));
    const pl = el('button', 'txt-btn', '▶');
    pl.setAttribute('aria-label', 'Послушать ' + v.w);
    pl.onclick = () => act.playSaved(v);
    const rm = el('button', 'txt-btn', '✕');
    rm.setAttribute('aria-label', 'Удалить ' + v.w);
    rm.onclick = () => { vocab.remove(v.key); renderVocab(app, act); };
    it.append(tx, pl, rm);
    box.append(it);
  });
}

/* ---------- меню глав и переход ---------- */
export function openChapterMenu(app, act) {
  const m = $('#menu');
  m.replaceChildren();
  app.book.chapters.forEach(c => {
    const b = el('button');
    b.setAttribute('role', 'menuitem');
    if (c.n === app.chapter.n) b.setAttribute('aria-current', 'true');
    const done = heard.get(app.slug, c.n).size;
    b.append(el('span', '', `Глава ${c.roman}`), el('small', '', `${done}/${c.phrases.length + 1}`));
    b.onclick = () => { closeSheets(); act.chapter(c.n); };
    m.append(b);
  });
  const r = $('#btn-chapter').getBoundingClientRect();
  m.style.top = (r.bottom + 6) + 'px';
  m.style.left = Math.max(16, Math.min(r.left, window.innerWidth - 240)) + 'px';
  m.hidden = false;
  $('#scrim').hidden = false;
}

export function renderChapterNav(app, act) {
  const nav = $('#next-ch');
  nav.replaceChildren();
  const n = app.chapter.n;
  const total = app.book.chapters.length;
  if (n > 1) {
    const b = el('button', 'txt-btn', `← Глава ${app.book.chapters[n - 2].roman}`);
    b.onclick = () => act.chapter(n - 1);
    nav.append(b);
  }
  if (n < total) {
    const b = el('button', 'txt-btn primary', `Глава ${app.book.chapters[n].roman} →`);
    b.onclick = () => act.chapter(n + 1, true);
    nav.append(b);
  }
}

/* ---------- вопросы ---------- */
export function renderQuiz(app) {
  const q = $('#quiz');
  q.replaceChildren();
  const quiz = app.chapter.quiz || [];
  q.hidden = !quiz.length;
  if (!quiz.length) return;
  const key = `quiz.${app.slug}.${app.chapter.n}`;
  const sc = el('div', 'score', `${quiz.length} вопроса по главе. Непонятен вопрос — нажмите «перевод».`);
  q.append(el('h2', '', 'Проверь себя'), sc);
  let right = 0;
  let answered = 0;
  quiz.forEach(item => {
    const box = el('div', 'q');
    const qr = el('button', 'qr', 'перевод');
    qr.onclick = () => { qr.textContent = item.ru; };
    const opts = el('div', 'opts');
    item.options.forEach((o, oi) => {
      const b = el('button', '', o);
      b.onclick = () => {
        if (box.dataset.done) return;
        box.dataset.done = '1';
        answered++;
        if (oi === item.answer) {
          b.classList.add('right');
          right++;
        } else {
          b.classList.add('wrong');
          opts.children[item.answer].classList.add('right');
        }
        if (answered === quiz.length) {
          sc.textContent = `Верно ${right} из ${quiz.length}.`
            + (right === quiz.length ? ' Отлично!' : ' Неверные места можно переслушать: нажмите на фразу в тексте.');
          store.set(key, { right, total: quiz.length });
        }
      };
      opts.append(b);
    });
    box.append(el('div', 'qq', item.q), qr, opts);
    q.append(box);
  });
}

/* ---------- подсказки первого запуска ---------- */
const COACH = [
  { sel: '#text .ph', text: 'Нажмите на любую фразу — диктор прочитает её по-английски, а фраза подсветится.' },
  { sel: '#cap', text: 'Здесь английский текст. Нажмите на слово — увидите перевод, начальную форму и услышите слово этим же голосом.' },
  { sel: '#btn-settings', alt: '#settings', text: 'Голос, скорость, тональность и тембр, «эхо» для повторения вслух, таймер сна и работа без интернета — в настройках.' },
];

export function coach(step = 0) {
  $$('.coach-target').forEach(n => n.classList.remove('coach-target'));
  const c = $('#coach');
  if (step >= COACH.length) {
    c.hidden = true;
    store.set('coachDone', true);
    return;
  }
  const s = COACH[step];
  let target = $(s.sel);
  if ((!target || !target.offsetParent) && s.alt) target = $(s.alt);
  if (!target || target.hidden || !target.getClientRects().length) {
    coach(step + 1);
    return;
  }
  target.classList.add('coach-target');
  c.replaceChildren();
  const acts = el('div', 'acts');
  const skip = el('button', 'skip', 'Пропустить');
  skip.onclick = () => coach(COACH.length);
  const next = el('button', '', step === COACH.length - 1 ? 'Понятно' : `Дальше ${step + 1}/${COACH.length}`);
  next.onclick = () => coach(step + 1);
  acts.append(skip, next);
  c.append(el('div', '', s.text), acts);
  c.hidden = false;
  const r = target.getBoundingClientRect();
  const below = r.bottom + 12 + c.offsetHeight < window.innerHeight;
  c.style.top = (below ? r.bottom + 12 : Math.max(12, r.top - c.offsetHeight - 12)) + 'px';
  c.style.left = Math.max(16, Math.min(r.left, window.innerWidth - c.offsetWidth - 16)) + 'px';
  next.focus();
}
