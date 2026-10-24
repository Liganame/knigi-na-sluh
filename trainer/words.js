// Слова: пачка из 10 — знакомство, выбор перевода в обе стороны, на слух, буквы, набор, сказать вслух;
// потом история-цепочка. Ответы ставят карточки в расписание повторений FSRS.
import { show, tab } from './main.js';
import { el, esc, shuffle, choice, tiles, mic, toast, playBtn } from './ui.js';
import { ic } from './icons.js';
import * as audio from './audio.js';
import { audioUrl, packs, LEVELS } from './data.js';
import { settings, review, Rating, isNew, done, dayLog, addToDay, myAssoc, myStory, cardOf, dueKeys } from './progress.js';
import { run, summary } from './session.js';
import * as game from './game.js';

const say = w => audio.play(audioUrl(w.audio), w.a);
const sayEx = w => audio.play(audioUrl(w.audio), w.x);
const LAW_TITLE = { cognate: 'Близнец', compound: 'Закон слова', falsefriend: 'Ложный друг' };

export async function words() {
  show('Слова', async m => {
    const S = settings.get();
    const all = await packs(S.level);
    const fin = done.packs();
    const learned = all.filter(p => fin.has(p.id)).length;
    const left = Math.max(0, S.newWords - dayLog().newWords);
    const lv = el(`<div class="card lvl"><div class="row"><h2>Уровень ${S.level}</h2><b style="color:var(--blue)">${learned} / ${all.length} пачек</b></div>
      <div class="lb"><i style="width:${Math.max(2, learned / all.length * 100).toFixed(1)}%"></i></div><div class="lvls"></div></div>`);
    [...LEVELS, 'B1', 'B2'].forEach(x => {
      const soon = !LEVELS.includes(x);
      const c = el(`<button aria-pressed="${x === S.level}" ${soon ? 'disabled' : ''}>${x}${soon ? ' скоро' : ''}</button>`);
      c.onclick = () => { settings.set({ ...S, level: x }); words(); };
      lv.querySelector('.lvls').append(c);
    });
    m.append(lv);
    const next = all.find(p => !fin.has(p.id));
    if (next) {
      const rest = next.words.slice(1, 4).map(w => w.w).join(' · ');
      const deck = el(`<button class="deck" style="border:0;background:none;padding:0;width:100%;cursor:pointer" aria-label="Учить пачку">
        <span class="d1"></span><span class="d2"></span><span class="d3"><small>ПАЧКА ${all.indexOf(next) + 1} · ${next.words.length} СЛОВ</small><b>${esc(next.words[0].w)}</b><span class="muted">${esc(rest)} · +${next.words.length - 4}</span></span></button>`);
      const go = el(`<button class="btn">Учить пачку · +${game.PTS.pack}${ic('zap')}</button>`);
      deck.onclick = go.onclick = () => learnPack(next);
      m.append(deck, go);
    } else m.append(el('<div class="fb ok">Все пачки уровня пройдены! Выберите следующий уровень.</div>'));
    const due = dueKeys().filter(k => k.startsWith('w:')).length;
    const row = el(`<div class="grid2"><button class="card tap" style="grid-template-columns:auto 1fr;align-items:center;gap:8px;padding:10px">${ic('repeat')}<span><b>${due}</b> <span class="muted">к повтору</span></span></button>
      <button class="card tap" style="grid-template-columns:auto 1fr;align-items:center;gap:8px;padding:10px">${ic('cards')}<span><b>${learned}</b> <span class="muted">пройдено</span></span></button></div>`);
    const [rep, past] = row.querySelectorAll('button');
    rep.onclick = () => (due ? reviewWords() : toast(left ? `Повторять пока нечего — сегодня ещё ${left} новых слов` : 'Повторять пока нечего'));
    past.onclick = () => packsScreen(all.filter(p => fin.has(p.id)));
    m.append(row);
  });
}

/** Пройденные пачки уровня: истории-цепочки. */
function packsScreen(list) {
  show('Пройденные пачки', m => {
    if (!list.length) {
      m.append(el('<div class="muted">Пока ни одной — выучите первую пачку, и здесь появится её история-цепочка.</div>'));
      return;
    }
    const card = el('<div class="card"><div class="list"></div></div>');
    list.slice().reverse().forEach(p => {
      const r = el(`<button class="row" style="border:0;background:none;width:100%;text-align:left;cursor:pointer;font:inherit"><span>${esc(p.words.map(w => w.w).join(', '))}</span><span class="pill">история</span></button>`);
      r.onclick = () => storyScreen(p, () => words());
      card.querySelector('.list').append(r);
    });
    m.append(card);
  }, true);
}

/** Повторение только слов (из раздела «Слова»). */
async function reviewWords() {
  const { reviewSession } = await import('./today.js');
  reviewSession(dueKeys().filter(k => k.startsWith('w:')).slice(0, 40));
}

/** Карточка знакомства со словом. */
function introCard(m, w) {
  const mine = myAssoc.get(w.id);
  const kind = LAW_TITLE[w.law] || (w.law ? 'Закон слова' : 'Ассоциация');
  const cls = w.law === 'falsefriend' ? 'ff' : w.law ? 'law' : '';
  const c = el(`<div class="card"><div class="row"><div style="min-width:0"><div class="word">${esc(w.w)}</div><div class="ipa">${w.ipa ? `[${esc(w.ipa)}] · ` : ''}${esc(w.level || '')}</div></div>${playBtn()}</div>
    <div class="ru">${esc(w.ru)}</div>
    <div class="row"><div><div>${esc(w.ex)}</div><div class="muted">${esc(w.exru)}</div></div>${playBtn('Послушать пример', true)}</div>
    <div class="assoc ${cls}"><b>${mine ? 'Ваша ассоциация' : kind}</b>${esc(mine || w.assoc)}</div>
    <details><summary class="muted">${mine ? 'Изменить свою ассоциацию' : 'Придумать свою ассоциацию'}</summary>
      <textarea placeholder="Свой образ запоминается не хуже готового — пишите как удобно">${esc(mine)}</textarea>
      <button class="btn ghost" style="margin-top:6px">Сохранить</button></details></div>`);
  const [p1, p2] = c.querySelectorAll('.play');
  p1.onclick = () => say(w);
  p2.onclick = () => sayEx(w);
  c.querySelector('details .btn').onclick = () => {
    myAssoc.set(w.id, c.querySelector('textarea').value.trim());
    toast('Ассоциация сохранена');
  };
  m.append(c);
  say(w);
}

/** Одно упражнение со словом. kind: enru | ruen | audio | letters | type | say. pool — слова для неверных вариантов. */
export function wordTask(m, kind, w, pool, answer) {
  const others = shuffle(pool.filter(x => x.id !== w.id && x.ru !== w.ru && x.w !== w.w)).slice(0, 3);
  const names = { enru: 'Выберите перевод', ruen: 'Выберите английское слово', audio: 'Узнайте на слух', letters: 'Соберите из букв', type: 'Напишите по-английски', say: 'Скажите вслух' };
  m.append(el(`<div class="step">${names[kind]}</div>`));
  if (kind === 'enru') {
    m.append(el(`<div class="card" style="text-align:center"><div class="word">${esc(w.w)}</div></div>`));
    say(w);
    choice(m, w.ru, others.map(x => x.ru), answer);
  } else if (kind === 'ruen') {
    m.append(el(`<div class="card" style="text-align:center"><div class="ru" style="font-size:1.5rem">${esc(w.ru)}</div></div>`));
    choice(m, w.w, others.map(x => x.w), answer, () => say(w));
  } else if (kind === 'audio') {
    const c = el(`<div class="card" style="justify-items:center">${playBtn()}<div class="muted">Какое слово прозвучало?</div></div>`);
    c.querySelector('.play').onclick = () => say(w);
    m.append(c);
    say(w);
    choice(m, w.w, others.map(x => x.w), answer);
  } else if (kind === 'letters') {
    const c = el(`<div class="card" style="justify-items:center">${playBtn()}<div class="ru">${esc(w.ru)}</div></div>`);
    c.querySelector('.play').onclick = () => say(w);
    m.append(c);
    say(w);
    tiles(m, [...w.w], '', w.w, answer, { letters: true });
  } else if (kind === 'type') {
    m.append(el(`<div class="card"><div class="ru" style="font-size:1.3rem">${esc(w.ru)}</div><div class="muted">${esc(w.w.length)} букв${w.w.includes(' ') ? ', с пробелом' : ''}</div></div>`));
    const inp = el('<input class="typed" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="по-английски">');
    const b = el('<button class="btn">Проверить</button>');
    const fb = el('<div></div>');
    const t0 = performance.now();
    b.onclick = () => {
      const ok = inp.value.trim().toLowerCase().replace(/’/g, "'") === w.w.toLowerCase();
      game.answer(ok, ok ? null : inp);
      fb.className = `fb ${ok ? 'ok' : 'bad'}`;
      fb.textContent = ok ? 'Верно!' : `Правильно: ${w.w}`;
      b.disabled = true;
      say(w);
      const sec = (performance.now() - t0) / 1000;
      setTimeout(() => answer(ok, sec), ok ? 900 : 2000);
    };
    inp.onkeydown = e => { if (e.key === 'Enter') b.click(); };
    m.append(inp, b, fb);
    setTimeout(() => inp.focus(), 60);
  } else if (kind === 'say') {
    m.append(el(`<div class="card" style="text-align:center"><div class="ru" style="font-size:1.3rem">${esc(w.ru)}</div></div>`));
    mic(m, w.w, 'Скажите слово по-английски', (ok, sec) => {
      say(w);
      m.append(el(`<div class="fb ${ok ? 'ok' : 'bad'}">${esc(w.w)} — ${esc(w.ru)}</div>`));
      setTimeout(() => answer(ok, sec), 1300);
    }, settings.get().speech);
  }
}

/** Пачка: две половины по 5 — знакомство и упражнения вперемешку, в конце «сказать» и история. */
export function learnPack(p) {
  const ws = p.words.map(w => ({ ...w, audio: p.audio, level: p.id.slice(0, 2).toUpperCase() }));
  const halves = [ws.slice(0, 5), ws.slice(5)].filter(h => h.length);
  const tasks = [];
  for (const h of halves) {
    h.forEach(w => tasks.push({ kind: 'intro', w }));
    for (const kind of ['enru', 'ruen', 'audio', 'letters', 'type']) shuffle(h).forEach(w => tasks.push({ kind, w }));
  }
  shuffle(ws).slice(0, 3).forEach(w => tasks.push({ kind: 'say', w }));
  run(`Пачка · ${ws.length} слов`, tasks, (m, t, answer) => {
    if (t.kind === 'intro') {
      m.append(el('<div class="step">Знакомство</div>'));
      introCard(m, t.w);
      const b = el('<button class="btn">Запомнил</button>');
      b.onclick = () => answer(true);
      m.append(b);
    } else wordTask(m, t.kind, t.w, ws, answer);
  }, results => {
    const errors = new Map(ws.map(w => [w.id, 0]));
    results.filter(r => r.task.kind !== 'intro' && !r.ok).forEach(r => errors.set(r.task.w.id, errors.get(r.task.w.id) + 1));
    let fresh = 0;
    ws.forEach(w => {
      const key = `w:${w.id}`;
      if (isNew(key)) fresh++;
      const e = errors.get(w.id);
      review(key, e === 0 ? Rating.Good : e === 1 ? Rating.Hard : Rating.Again);
    });
    const first = !done.packs().has(p.id);
    done.addPack(p.id);
    addToDay({ newWords: fresh });
    if (first) game.bonus(game.PTS.pack, 'Пачка выучена!');
    storyScreen(p, () => words(), true);
  });
}

/** История-цепочка пачки + проверка «восстанови порядок». */
export function storyScreen(p, onNext, afterLearning = false) {
  show('История-цепочка', m => {
    const own = myStory.get(p.id);
    const html = esc(own || p.story).replace(/\b([A-Z][A-Z' -]*[A-Z]|[A-Z])\b/g, '<b>$1</b>');
    m.append(el(`<div class="card"><div class="muted">${afterLearning ? 'Пачка выучена. ' : ''}Слова связаны в одну нелепую историю — прокрутите её в голове, и слова вытащатся по порядку (метод цепочки).</div><div class="story">${html}</div></div>`));
    const ed = el(`<details class="card"><summary class="muted">${own ? 'Изменить свою историю' : 'Написать свою историю'}</summary><textarea>${esc(own)}</textarea><button class="btn ghost" style="margin-top:6px">Сохранить</button></details>`);
    ed.querySelector('.btn').onclick = () => { myStory.set(p.id, ed.querySelector('textarea').value.trim()); toast('История сохранена'); };
    m.append(ed);
    m.append(el('<div class="step">Проверка: расставьте слова в порядке истории</div>'));
    const order = p.words.map(w => w.w);
    const box = el('<div style="display:grid;gap:8px"></div>');
    const chain = () => {
      box.replaceChildren();
      tiles(box, order, ' | ', order.join(' | '), ok => {
        toast(ok ? 'Цепочка держится!' : 'Перечитайте историю — и соберите ещё раз');
        if (!ok && box.isConnected) chain();   // плитки после сборки замирают — даём новую попытку
      });
    };
    chain();
    m.append(box);
    const b = el('<button class="btn ghost">Дальше</button>');
    b.onclick = onNext;
    m.append(b);
  }, true);
}

export { cardOf, summary, tab };
