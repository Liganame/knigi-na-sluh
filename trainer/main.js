// Каркас тренажёра: нижнее меню из пяти разделов, экраны со стрелкой «назад», учёт времени занятий.
import { $, toast } from './ui.js';
import { addToDay, points, streak } from './progress.js';
import { ic } from './icons.js';
import { registerServiceWorker } from '../app/offline.js';
import * as audio from './audio.js';
import * as speech from './speech.js';
import { today } from './today.js';
import { phrases } from './phrases.js';
import { words } from './words.js';
import { laws } from './laws.js';
import { memory } from './memory.js';

const TABS = { today, phrases, words, laws, memory };
let stack = [];

/**
 * Показать экран. mode: false — раздел (стек сброшен), true — вложенный (появляется «назад»),
 * 'replace' — заменить верхний экран (шаги одной тренировки не копятся в «назад»).
 * Каждый экран рисуется в свой контейнер: запоздавший ответ старого экрана пишет в отцепленный
 * контейнер и не портит новый; по screen.isConnected обработчики узнают, что экран уже ушёл.
 */
export function show(title, render, mode = false) {
  audio.stop();
  speech.abort();
  if (!mode) stack = [];
  if (mode === 'replace' && stack.length) stack.pop();
  stack.push({ title, render });
  $('#title').textContent = title;
  $('#back').hidden = stack.length < 2;
  renderStats();
  const main = $('#main');
  const screen = document.createElement('div');
  screen.className = 'screen';
  main.replaceChildren(screen);
  main.scrollTop = 0;
  Promise.resolve(render(screen)).catch(e => {
    if (!screen.isConnected) return;
    screen.replaceChildren(Object.assign(document.createElement('div'), {
      className: 'card', textContent: `Не удалось открыть: ${e.message}. Проверьте интернет и попробуйте ещё раз.`,
    }));
  });
}
/** Текущий экран: обработчик, который ждал загрузку, сверяет — не ушёл ли человек за это время. */
export const currentScreen = () => document.querySelector('#main > .screen');
/** Убрать верхний экран из стека, не перерисовывая (тренировка закончилась — «назад» ведёт мимо неё). */
export function dropTop() {
  if (stack.length > 1) stack.pop();
}
/** Перерисовать верхний экран стека (вернуться на экран, с которого начали тренировку). */
export function reshow() {
  const top = stack.pop();
  if (top) show(top.title, top.render, stack.length ? true : false);
}
export function back() {
  if (stack.length < 2) return false;
  stack.pop();
  const top = stack.pop();
  show(top.title, top.render, true);
  return true;
}
/** Серия дней и очки в шапке — только на главных экранах разделов (во вложенных места нет). */
function renderStats() {
  const box = $('#stats');
  box.hidden = stack.length > 1;
  if (box.hidden) return;
  box.innerHTML = `<span class="stat fire" title="Дней подряд">${ic('flame', 'flick')}${streak()}</span><span class="stat pts" title="Очки">${ic('zap')}${points.total()}</span>`;
}

export function tab(name) {
  document.querySelectorAll('#nav button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === name));
  document.querySelector(`#nav [data-tab="${name}"]`)?.setAttribute('aria-current', 'page');
  TABS[name]();
}

/* учёт времени: считаем секунды, когда экран виден и человек что-то делал последние 2 минуты */
let lastAct = Date.now();
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { lastAct = Date.now(); }, { passive: true }));
setInterval(() => {
  if (document.visibilityState === 'visible' && Date.now() - lastAct < 120000) addToDay({ sec: 15 });
}, 15000);

function boot() {
  $('#back').onclick = back;
  document.addEventListener('knl:stats', renderStats);
  // iPhone: звук разрешается только из касания — включаем его на первом же касании экрана
  ['pointerdown', 'touchend', 'click'].forEach(t => document.addEventListener(t, () => audio.unlock(), { once: true, capture: true }));
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) tab(b.dataset.tab);
  });
  // кнопка «назад» Android в APK
  window.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
    if (!back()) window.Capacitor.Plugins.App.minimizeApp?.();
  });
  registerServiceWorker();
  const want = location.hash.replace('#', '');
  tab(TABS[want] ? want : 'today');
  window.addEventListener('unhandledrejection', e => toast('Ошибка: ' + (e.reason?.message || e.reason)));
}
boot();
