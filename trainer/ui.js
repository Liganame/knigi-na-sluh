// Общие детали экранов: элементы, тосты, выбор ответа, сборка из плиток, микрофон, «бегунок» упражнений.
import * as speech from './speech.js';

export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
export const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  rep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>',
  word: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  law: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>',
};
export const playBtn = (label = 'Послушать', small = false) => `<button class="play ${small ? 'small' : ''}" aria-label="${label}">${ICON.play}</button>`;

let toastT;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

/** Выбор одного варианта. onAnswer(ok, секунды до ответа). */
export function choice(box, right, wrong, onAnswer, after) {
  const t0 = performance.now();
  const list = el('<div class="opts"></div>');
  shuffle([right, ...wrong]).forEach(o => {
    const b = el(`<button class="opt">${esc(o)}</button>`);
    b.onclick = () => {
      if (list.dataset.done) return;
      list.dataset.done = '1';
      const ok = o === right;
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) [...list.children].find(x => x.textContent === right)?.classList.add('right');
      if (after) after(ok);
      const sec = (performance.now() - t0) / 1000;
      setTimeout(() => onAnswer(ok, sec), ok ? 650 : 1500);
    };
    list.append(b);
  });
  box.append(list);
}

/** Собрать ответ из плиток (слова фразы или буквы слова). */
export function tiles(box, parts, joiner, target, onAnswer, { letters = false, onCheck } = {}) {
  const t0 = performance.now();
  const ans = el('<div class="tiles answer" aria-label="Ваш ответ"></div>');
  const pool = el('<div class="tiles"></div>');
  shuffle(parts).forEach(x => {
    const t = el(`<button class="tile ${letters ? 'letter' : ''}">${esc(x)}</button>`);
    t.onclick = () => {
      (t.parentElement === pool ? ans : pool).append(t);
      check();
    };
    pool.append(t);
  });
  const fb = el('<div></div>');
  const check = () => {
    if (pool.children.length) return;
    // всё собрано — плитки замирают, иначе перекладывание последней дало бы второй ответ
    [...ans.children].forEach(x => { x.disabled = true; });
    const got = [...ans.children].map(x => x.textContent).join(joiner);
    const ok = got.toLowerCase() === target.toLowerCase();
    fb.className = `fb ${ok ? 'ok' : 'bad'}`;
    fb.textContent = ok ? 'Верно!' : `Правильно: ${target}`;
    if (onCheck) onCheck(ok);
    const sec = (performance.now() - t0) / 1000;
    setTimeout(() => onAnswer(ok, sec), ok ? 800 : 1800);
  };
  box.append(ans, pool, fb);
}

/**
 * Микрофон: распознаёт речь и сверяет со словами цели; без распознавания — самооценка.
 * onDone(ok, firstSec) — firstSec: через сколько секунд ОТ ПОЯВЛЕНИЯ задания начали говорить
 * (вместе с нажатием на микрофон — подумать перед нажатием не выйдет); null при самооценке.
 */
export function mic(box, target, hint, onDone, enabled = true) {
  const born = performance.now();
  const card = el(`<div class="card" style="text-align:center">
    <div class="muted">${esc(hint)}</div>
    <button class="mic" aria-label="Говорить">${ICON.mic}</button>
    <div class="heard" aria-live="polite"></div>
    <div class="grid2 self" hidden><button class="btn ghost" data-ok="0">Не вышло</button><button class="btn" data-ok="1">Сказал верно</button></div>
  </div>`);
  const btn = card.querySelector('.mic');
  const heard = card.querySelector('.heard');
  const self = card.querySelector('.self');
  let finished = false;
  const finish = (ok, sec) => {
    if (finished) return;
    finished = true;
    btn.disabled = true;
    onDone(ok, sec);
  };
  const no = self.querySelector('[data-ok="0"]');
  const yes = self.querySelector('[data-ok="1"]');
  const selfGrade = msg => {
    heard.textContent = msg;
    no.textContent = 'Не вышло';
    no.onclick = () => finish(false, null);
    yes.textContent = 'Сказал верно';
    self.hidden = false;
    btn.classList.remove('live');
  };
  self.querySelectorAll('button').forEach(b => { b.onclick = () => finish(b.dataset.ok === '1', null); });
  if (!enabled || !speech.available()) {
    btn.hidden = true;
    selfGrade('Скажите вслух, потом отметьте честно:');
  }
  btn.onclick = async () => {
    const pressed = (performance.now() - born) / 1000;
    btn.classList.add('live');
    heard.textContent = 'Слушаю…';
    const render = text => {
      const m = speech.match(target, text);
      heard.innerHTML = m.words.map(x => `<span class="${x.ok ? 'y' : 'n'}">${esc(x.w)}</span>`).join(' ');
      return m;
    };
    try {
      const r = await speech.listen({ onPartial: render });
      btn.classList.remove('live');
      const m = render(r.text);
      if (m.share >= 0.8) finish(true, r.firstSec == null ? null : pressed + r.firstSec);
      else {
        heard.insertAdjacentHTML('beforeend', `<div class="muted">Расслышал: «${esc(r.text)}»</div>`);
        self.hidden = false;   // распознавание могло ошибиться — последнее слово за вами
        yes.textContent = 'Я сказал верно';
        no.textContent = 'Ещё раз';
        no.onclick = () => {
          self.hidden = true;
          btn.click();
        };
      }
    } catch (e) {
      selfGrade(e.code === 'denied' ? 'Нет доступа к микрофону — скажите вслух и отметьте сами.'
        : e.code === 'unavailable' ? 'Распознавание недоступно — скажите вслух и отметьте сами.'
          : e.code === 'network' ? 'Распознаванию нужен интернет (или офлайн-пакет английского в настройках голосового ввода Google) — скажите вслух и отметьте сами.'
            : 'Не расслышал. Нажмите микрофон ещё раз или отметьте сами.');
      btn.classList.remove('live');
    }
  };
  box.append(card);
  return { cancel: () => speech.abort() };
}

/** Прогресс-полоска. */
export const progressBar = share => el(`<div class="bar"><i style="width:${Math.round(share * 100)}%"></i></div>`);
