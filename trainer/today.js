// «Сегодня»: квест дня (кольцо минут → «Мой путь») и путь дня из пяти шагов. «Мой путь»: серия, очки,
// прогноз уровней, неделя, награды. Настройки и перенос прогресса; сессия повторений.
import { show, tab, currentScreen } from './main.js';
import { el, esc, shuffle, toast } from './ui.js';
import { ic } from './icons.js';
import { wordIndex, phraseIndex, packs, lawsData } from './data.js';
import * as P from './progress.js';
import * as game from './game.js';
import { wordTask, learnPack } from './words.js';
import { phraseTask } from './phrases.js';
import { lesson, shortOf } from './laws.js';
import { run, summary } from './session.js';

const HOURS_PER_LEVEL = 200;   // Cambridge: ~200 часов занятий на уровень CEFR
const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];
const BOOK_GOAL_SEC = 600;     // шаг «Книга» засчитан после 10 минут прослушивания за день
const RING = 163;              // длина окружности кольца квеста (r = 26)
// места шагов на площадке пути: x, y в процентах; true — подпись слева от кружка
const SPOTS = [[50, 10, false], [73, 30, true], [50, 50, false], [27, 70, false], [50, 90, false]];

function daySteps(S, day, due, lawsAll) {
  const leftW = Math.max(0, S.newWords - day.newWords);
  const leftP = Math.max(0, S.newPhrases - day.newPhrases);
  const nextLaw = lawsAll.laws.find(x => !P.done.laws().has(x.id));
  return [
    { icon: 'repeat', c: 'c-teal', t: 'Повторить', s: due.length ? `${due.length} карточек` : 'всё повторено', done: !due.length,
      go: () => (due.length ? reviewSession(due.slice(0, 40)) : toast('Повторять пока нечего — новое придёт по расписанию')) },
    { icon: 'cards', c: 'c-violet', t: 'Новые слова', s: leftW ? `ещё ${leftW} из ${S.newWords}` : 'план выполнен', done: !leftW,
      go: async () => {
        const at = currentScreen();
        const next = (await packs(S.level)).find(p => !P.done.packs().has(p.id));
        if (at !== currentScreen()) return;   // пока грузилось, человек ушёл в другой раздел
        if (next) learnPack(next); else tab('words');
      } },
    { icon: 'chat', c: 'c-pink', t: 'Фразы', s: leftP ? `ещё ${leftP} из ${S.newPhrases}` : 'план выполнен', done: !leftP, go: () => tab('phrases') },
    { icon: 'grid', c: 'c-orange', t: 'Закон дня', s: nextLaw ? shortOf(nextLaw) : 'все открыты', done: day.laws > 0 || !nextLaw,
      go: () => (nextLaw ? lesson(nextLaw) : tab('laws')) },
    { icon: 'book', c: 'c-blue', t: 'Книга', s: '+2 очка за минуту', done: P.bookSecondsToday() >= BOOK_GOAL_SEC,
      go: () => { location.href = 'reader.html?b=kavkazskiy-plennik'; } },
  ];
}

export async function today() {
  show('Сегодня', async m => {
    m.classList.add('fill');
    const S = P.settings.get();
    game.payBook();
    const day = P.dayLog();
    const mins = Math.round((day.sec + P.bookSecondsToday()) / 60);
    const steps = daySteps(S, day, P.dueKeys(), await lawsData());
    const doneN = steps.filter(x => x.done).length;
    const nowI = steps.findIndex(x => !x.done);
    const off = Math.round(RING * (1 - Math.min(1, mins / S.minutes)));
    const q = el(`<button class="card tap quest"><span class="qring"><svg viewBox="0 0 62 62" aria-hidden="true"><circle class="bg" cx="31" cy="31" r="26"/><circle class="fg" cx="31" cy="31" r="26" style="stroke-dasharray:${RING};stroke-dashoffset:${off};--full:${RING};opacity:${mins ? 1 : 0}"/></svg><b>${mins}′</b></span>
      <span><h2>Квест дня: ${doneN} из 5</h2><span class="muted">${mins} из ${S.minutes} мин · мой путь и прогноз</span></span>${ic('chev')}</button>`);
    q.onclick = () => myPath();
    m.append(q);
    const path = el('<div class="path stg"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="50,10 73,30 50,50 27,70 50,90"/></svg></div>');
    steps.forEach((st, i) => {
      const [x, y, left] = SPOTS[i];
      const state = st.done ? 'done' : i === nowI ? 'now' : 'todo';
      const b = el(`<button class="pnode ${st.c} ${state} ${left ? 'r' : ''}" style="--x:${x}%;--y:${y}%;--i:${i}" aria-label="${esc(st.t)}: ${esc(st.s)}">
        <span class="pd">${ic(st.done ? 'check' : st.icon)}</span><span class="pl"><b>${esc(st.t)}</b><span>${esc(st.s)}</span></span>${state === 'now' ? '<span class="tag">СТАРТ!</span>' : ''}</button>`);
      b.onclick = st.go;
      path.append(b);
    });
    m.append(path);
    if (nowI < 0 && !P.dayFlag.has('plan')) {
      P.dayFlag.set('plan');
      game.bonus(game.PTS.dayPlan, 'План дня выполнен!');
    }
    game.checkBadges();
  });
}

const fmtH = h => (h < 10 ? h.toFixed(1).replace('.', ',') : String(Math.round(h)));

function forecast(S) {
  const hist = P.history(7);
  const active = hist.filter(x => x.sec > 0);
  const avgMin = active.length >= 3 ? hist.reduce((s, x) => s + x.sec, 0) / 7 / 60 : S.minutes;
  const start = ORDER.indexOf(S.startLevel);
  const done = P.totalHours();
  const cls = ['c-teal', 'c-violet', 'c-pink'];
  const rows = [];
  for (let k = start + 1; k <= Math.min(ORDER.length - 1, start + 3); k++) {
    const need = Math.max(0, (k - start) * HOURS_PER_LEVEL - done);
    const days = Math.ceil(need * 60 / Math.max(5, avgMin));
    const date = new Date(Date.now() + days * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    rows.push(`<span class="lv ${cls[k - start - 1]}">${ORDER[k]}</span><b>≈ ${date}</b><span class="muted">ещё ${Math.round(need)} ч</span>`);
  }
  return el(`<div class="card"><h2>Когда следующий уровень</h2><div class="fc">${rows.join('')}</div>
    <div class="muted">Часы Cambridge (~${HOURS_PER_LEVEL} ч на уровень) при темпе ${Math.round(avgMin)} мин/день${active.length >= 3 ? ' за неделю' : ' (пока по плану)'}; набрано ${fmtH(done)} ч.</div></div>`);
}

function week(S) {
  const h = P.history(7);
  const goal = S.minutes * 60;
  const top = Math.max(goal, ...h.map(x => x.sec), 1);
  const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const bars = h.map((x, i) => {
    const pct = Math.max(5, Math.round(x.sec / top * 100));
    return `<span><i class="${x.sec >= goal ? 'full' : ''}" style="height:${pct}%;animation-delay:${i * 40}ms"></i>${names[new Date(`${x.d}T12:00`).getDay()]}</span>`;
  });
  const avg = Math.round(h.reduce((s, x) => s + x.sec, 0) / 7 / 60);
  return el(`<div class="card"><div class="row"><h2>Эта неделя</h2><span class="muted">в среднем ${avg} мин</span></div><div class="week">${bars.join('')}</div></div>`);
}

const BADGE_COLOR = { cards: 'c-blue', flame: 'c-orange', trophy: 'c-violet', talk: 'c-pink', chat: 'c-pink', grid: 'c-teal', clock: 'c-blue' };
function badgesCard() {
  const list = game.badgeList();
  const got = list.filter(b => b.got).length;
  return el(`<div class="card"><h2>Награды · ${got} из ${list.length}</h2><div class="badges stg">${list.map((b, i) => `<span class="badge ${b.got ? BADGE_COLOR[b.icon] : 'no'}" style="--i:${i}"><i>${ic(b.got ? b.icon : 'lock')}</i>${esc(b.t)}</span>`).join('')}</div></div>`);
}

/** «Мой путь»: серия, очки, часы, прогноз уровней, неделя, награды; отсюда — настройки и полка книг. */
export function myPath() {
  show('Мой путь', m => {
    const S = P.settings.get();
    m.append(el(`<div class="kpis"><div class="card"><b style="color:var(--fire)">${P.streak()}</b><span class="muted">дней подряд</span></div>
      <div class="card"><b style="color:var(--violet)">${P.points.total()}</b><span class="muted">очков</span></div>
      <div class="card"><b style="color:var(--teal)">${fmtH(P.totalHours())}</b><span class="muted">часов всего</span></div></div>`));
    m.append(forecast(S), week(S), badgesCard());
    const row = el(`<div class="grid2"><button class="btn ghost">${ic('gear')}Настройки</button><a class="btn ghost" href="books.html">${ic('book')}Все книги</a></div>`);
    row.querySelector('button').onclick = () => settingsScreen();
    m.append(row);
  }, true);
}

/** Повторения: слова и фразы вперемешку, по одному заданию на карточку. */
export async function reviewSession(keys) {
  const at = currentScreen();
  const [wi, pi] = await Promise.all([wordIndex(), phraseIndex()]);
  if (at !== currentScreen()) return;   // пока грузилось, человек ушёл в другой раздел
  const wordsPool = [...wi.values()];
  const tasks = shuffle(keys).map(k => {
    const [t, id] = [k.slice(0, 1), k.slice(2)];
    if (t === 'w' && wi.has(id)) return { k, w: wi.get(id), kind: shuffle(['enru', 'ruen', 'audio', 'type', 'enru'])[0] };
    if (t === 'p' && pi.has(id)) return { k, p: pi.get(id), kind: shuffle(['listen', 'build', 'say', 'say'])[0] };
    return null;
  }).filter(Boolean);
  run('Повторение', tasks, (m, t, answer) => {
    if (t.w) wordTask(m, t.kind, t.w, wordsPool.filter(x => x.level === t.w.level), answer);
    else phraseTask(m, t.kind, t.p, [...pi.values()].filter(x => x.sit === t.p.sit), answer);
  }, results => {
    for (const r of results) {
      const limit = { type: 10, build: 12, say: 3 }[r.task.kind] || 5;
      const fast = r.ok && r.sec != null && r.sec <= limit;
      P.review(r.task.k, !r.ok ? P.Rating.Again : fast ? P.Rating.Good : P.Rating.Hard, r.task.p && r.task.kind === 'say' && fast);
    }
    P.addToDay({ reviews: results.length });
    summary('Повторение', results, '', () => today());
  });
}

function settingsScreen() {
  show('Настройки', m => {
    const S = P.settings.get();
    const num = (id, label, val, min, max, step, unit) => `<label class="set card" for="${id}"><span class="row"><span>${label}</span><b id="${id}-o">${val} ${unit}</b></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
    m.append(el(`<div style="display:grid;gap:10px">
      ${num('s-min', 'Минут в день', S.minutes, 15, 240, 15, 'мин')}
      ${num('s-w', 'Новых слов в день', S.newWords, 10, 60, 10, '')}
      ${num('s-p', 'Новых фраз в день', S.newPhrases, 5, 30, 5, '')}
    </div>`));
    const lv = el(`<div class="card"><span>Мой уровень на старте (для прогноза)</span><div class="chips">${['A1', 'A2', 'B1'].map(x => `<button class="chip" aria-pressed="${x === S.startLevel}">${x}</button>`).join('')}</div></div>`);
    lv.querySelectorAll('.chip').forEach(c => { c.onclick = () => { lv.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false')); c.setAttribute('aria-pressed', 'true'); }; });
    m.append(lv);
    const sp = el(`<label class="card row"><span>Проверять речь микрофоном</span><input type="checkbox" id="s-sp" ${S.speech ? 'checked' : ''} style="width:22px;height:22px"></label>`);
    const snd = el(`<label class="card row"><span>Звуки за ответы</span><input type="checkbox" id="s-snd" ${S.sounds ? 'checked' : ''} style="width:22px;height:22px"></label>`);
    m.append(sp, snd);
    m.querySelectorAll('input[type=range]').forEach(r => { r.oninput = () => { m.querySelector(`#${r.id}-o`).textContent = r.value + (r.id === 's-min' ? ' мин' : ''); }; });
    const save = el('<button class="btn">Сохранить</button>');
    save.onclick = () => {
      P.settings.set({ ...S, minutes: +m.querySelector('#s-min').value, newWords: +m.querySelector('#s-w').value, newPhrases: +m.querySelector('#s-p').value,
        speech: m.querySelector('#s-sp').checked, sounds: m.querySelector('#s-snd').checked, startLevel: lv.querySelector('[aria-pressed="true"]').textContent });
      toast('Сохранено');
      today();
    };
    m.append(save);
    const io = el(`<details class="card"><summary><b>Перенести прогресс на другое устройство</b></summary>
      <div class="muted">Скопируйте текст и вставьте его на другом устройстве в это же поле.</div>
      <textarea id="s-io" style="min-height:110px"></textarea>
      <div class="grid2"><button class="btn ghost" data-a="out">Скопировать мой</button><button class="btn ghost" data-a="in">Загрузить вставленный</button></div></details>`);
    io.querySelector('[data-a=out]').onclick = async () => {
      const t = P.exportAll();
      io.querySelector('textarea').value = t;
      try { await navigator.clipboard.writeText(t); toast('Скопировано'); } catch { io.querySelector('textarea').select(); toast('Выделено — скопируйте вручную'); }
    };
    io.querySelector('[data-a=in]').onclick = () => {
      try { P.importAll(io.querySelector('textarea').value); toast('Прогресс загружен'); today(); } catch (e) { toast('Не получилось: ' + e.message); }
    };
    m.append(io);
    m.append(el(`<div class="muted">Слова уровней A1–A2 — список CEFR-J 1.5 (Tono Laboratory, TUFS). Голоса — модель Kokoro-82M. Расписание повторений — FSRS (ts-fsrs, MIT).</div>`));
  }, true);
}

export { esc };
