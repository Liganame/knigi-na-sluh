// «Бегунок» тренировки: показывает задания по одному с полоской прогресса, собирает ответы.
import { show, dropTop } from './main.js';
export { reshow } from './main.js';
import { el, progressBar } from './ui.js';

/**
 * tasks — массив заданий; render(main, task, answer) рисует задание и вызывает answer(ok, sec).
 * finish(results) — results: [{task, ok, sec}] в порядке ответов.
 */
export function run(title, tasks, render, finish) {
  const results = [];
  let i = 0;
  // Вся тренировка — один экран в стеке: «назад» выводит из неё, а не листает задания.
  const draw = mode => show(title, m => {
    const task = tasks[i];
    if (!task) return;
    let answered = false;
    m.append(progressBar(i / tasks.length));
    render(m, task, (ok, sec = null) => {
      // ответ засчитывается один раз и только пока задание на экране (ушли — отложенный ответ не тащит назад)
      if (answered || !m.isConnected) return;
      answered = true;
      results.push({ task, ok, sec });
      i++;
      if (i < tasks.length) draw('replace');
      else {
        dropTop();
        finish(results);
      }
    });
  }, mode);
  if (!tasks.length) finish(results);
  else draw(true);
}

/** Итог тренировки с кнопкой «дальше»: итог уходит из стека, onNext открывает следующее (reshow — вернуться). */
export function summary(title, results, extraHtml, onNext) {
  const right = results.filter(r => r.ok).length;
  show(title, m => {
    m.append(el(`<div class="card" style="text-align:center"><div class="big">Готово</div>
      <div class="muted">Верно ${right} из ${results.length}. Трудное вернётся скоро, лёгкое — через несколько дней.</div></div>`));
    if (extraHtml) m.append(el(extraHtml));
    const b = el('<button class="btn">Дальше</button>');
    b.onclick = () => {
      dropTop();
      onNext();
    };
    m.append(b);
  }, true);
}
