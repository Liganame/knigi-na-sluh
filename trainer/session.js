// «Бегунок» тренировки: показывает задания по одному с полоской прогресса и серией, собирает ответы;
// в конце — итог со звёздами и заработанными очками, проверка новых наград.
import { show, dropTop } from './main.js';
export { reshow } from './main.js';
import { el } from './ui.js';
import { ic } from './icons.js';
import { points } from './progress.js';
import * as game from './game.js';

// задания-знакомства (карточка слова, «понять фразу») — не вопрос, очков и серии не дают
const NOT_SCORED = new Set(['intro', 'learn']);
let startPoints = 0;

function runbar(share) {
  const c = game.comboNow();
  return el(`<div class="runbar"><div class="bar"><i style="width:${Math.round(share * 100)}%"></i></div>${c >= 2 ? `<span class="combo">${ic('flame', 'flick')}×${c}</span>` : ''}</div>`);
}

/**
 * tasks — массив заданий; render(main, task, answer) рисует задание и вызывает answer(ok, sec).
 * finish(results) — results: [{task, ok, sec}] в порядке ответов.
 */
export function run(title, tasks, render, finish) {
  const results = [];
  let i = 0;
  startPoints = points.total();
  // Вся тренировка — один экран в стеке: «назад» выводит из неё, а не листает задания.
  const draw = mode => show(title, m => {
    const task = tasks[i];
    if (!task) return;
    let answered = false;
    m.append(runbar(i / tasks.length));
    render(m, task, (ok, sec = null) => {
      // ответ засчитывается один раз и только пока задание на экране (ушли — отложенный ответ не тащит назад)
      if (answered || !m.isConnected) return;
      answered = true;
      results.push({ task, ok, sec, scored: !NOT_SCORED.has(task.kind) });
      i++;
      if (i < tasks.length) draw('replace');
      else {
        dropTop();
        finish(results);
        game.checkBadges();
      }
    });
  }, mode);
  if (!tasks.length) finish(results);
  else draw(true);
}

/** Итог тренировки с кнопкой «дальше»: итог уходит из стека, onNext открывает следующее (reshow — вернуться). */
export function summary(title, results, extraHtml, onNext) {
  const scored = results.filter(r => r.scored !== false);
  const right = scored.filter(r => r.ok).length;
  const share = scored.length ? right / scored.length : 1;
  const stars = share >= 0.9 ? 3 : share >= 0.7 ? 2 : 1;
  const earnedPts = Math.max(0, points.total() - startPoints);
  show(title, m => {
    m.append(el(`<div class="card" style="justify-items:center;text-align:center;padding:22px 16px">
      <span class="fx-ico" style="width:76px;height:76px;border-radius:50%;background:var(--gold);color:#2A1A00;display:grid;place-items:center;box-shadow:0 6px 0 var(--gold-d)">${ic('trophy', '', '').replace('class="ic ', 'style="width:38px;height:38px" class="ic ')}</span>
      <div class="big">${stars === 3 ? 'Блестяще!' : stars === 2 ? 'Отлично!' : 'Готово!'}</div>
      <div class="stars" style="gap:6px">${[0, 1, 2].map(k => ic('star', k < stars ? 'on' : '').replace('class="ic', 'style="width:30px;height:30px" class="ic')).join('')}</div>
      <div class="muted">Верно ${right} из ${scored.length}. Трудное вернётся скоро, лёгкое — через несколько дней.</div>
      ${earnedPts ? `<span class="stat pts">${ic('zap')}+${earnedPts}</span>` : ''}</div>`));
    if (extraHtml) m.append(el(extraHtml));
    const b = el('<button class="btn">Дальше</button>');
    b.onclick = () => {
      dropTop();
      onNext();
    };
    m.append(b);
  }, true);
}
