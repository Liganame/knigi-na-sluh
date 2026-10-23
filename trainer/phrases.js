// Фразы «на автомате»: ситуации, тренировка фраз, рамки-подстановки, сценки-диалоги.
// «На автомате» — фраза сказана верно и быстрее 3 секунд в три разных дня.
import { show, back } from './main.js';
import { el, esc, shuffle, choice, tiles, mic, toast, playBtn } from './ui.js';
import * as audio from './audio.js';
import { audioUrl, phrasesData } from './data.js';
import { settings, review, Rating, isNew, isAuto, cardOf, dayLog, addToDay } from './progress.js';
import { run, summary, reshow } from './session.js';

const say = p => audio.play(audioUrl(p.audio), p.a);
const FAST = 3;
const LAG = 0.8;   // распознавание отдаёт первые слова чуть позже начала речи

export async function phrases() {
  show('Фразы на автомате', async m => {
    const d = await phrasesData();
    m.append(el('<div class="muted">Готовые фразы, которые должны вылетать без раздумья. Полоска — сколько фраз уже «на автомате».</div>'));
    const grid = el('<div class="sit"></div>');
    d.situations.forEach(s => {
      const auto = s.phrases.filter(p => isAuto(`p:${p.id}`)).length;
      const seen = s.phrases.filter(p => !isNew(`p:${p.id}`)).length;
      const b = el(`<button><b>${esc(s.title)}</b><span class="muted">${seen ? `${auto} авто · ${seen}/${s.phrases.length}` : `${s.phrases.length} фраз`}</span><span class="meter"><i style="width:${(auto / s.phrases.length * 100).toFixed(0)}%"></i></span></button>`);
      b.onclick = () => situation(s, d);
      grid.append(b);
    });
    m.append(grid);
    const fb = el('<button class="btn ghost">Рамки: Can I…? Could you…? I\'d like…</button>');
    fb.onclick = () => framesScreen(d);
    m.append(fb);
  });
}

function dots(key) {
  const n = Math.min(3, (cardOf(key)?.fd || []).length);
  return `<span class="dots">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function situation(s, d) {
  show(s.title, m => {
    const fresh = s.phrases.filter(p => isNew(`p:${p.id}`));
    const left = Math.max(0, settings.get().newPhrases - dayLog().newPhrases);
    const list = el('<div class="card list"></div>');
    s.phrases.forEach(p => {
      const r = el(`<div class="row"><div style="min-width:0"><div>${esc(p.en)}</div><div class="muted">${esc(p.ru)}</div></div>${dots(`p:${p.id}`)}</div>`);
      r.onclick = () => audio.play(audioUrl(s.audio), p.a);   // у фраз в данных нет своего audio — файл ситуации
      list.append(r);
    });
    if (fresh.length) {
      const n = Math.min(fresh.length, Math.max(5, left || 5));
      const b = el(`<button class="btn">Учить новые: ${Math.min(n, 10)} фраз</button>`);
      b.onclick = () => learnPhrases(s, fresh.slice(0, Math.min(n, 10)), d);
      m.append(b);
    }
    const seen = s.phrases.filter(p => !isNew(`p:${p.id}`));
    if (seen.length) {
      const b = el(`<button class="btn ghost">Говорить на скорость: ${Math.min(seen.length, 10)} знакомых фраз</button>`);
      b.onclick = () => speedRound(s, shuffle(seen).slice(0, 10), d);
      m.append(b);
    }
    s.dialogs.forEach(dg => {
      const b = el(`<button class="btn ghost">Сценка: ${esc(dg.title)}</button>`);
      b.onclick = () => dialog(s, dg, d);
      m.append(b);
    });
    m.append(el('<div class="muted">Точки: «на автомате» — три разных дня верно и быстрее 3 секунд. Нажмите на фразу — прозвучит.</div>'));
    m.append(list);
  }, true);
}

/** Задание с фразой. kind: learn | shadow | listen | build | say. */
export function phraseTask(m, kind, p, pool, answer) {
  const names = { learn: '1 · Понять', shadow: '2 · Повторить за диктором', listen: '3 · Узнать на слух', build: '4 · Собрать из слов', say: '5 · Сказать самому за 3 секунды' };
  m.append(el(`<div class="step">${names[kind]}</div>`));
  const hl = esc(p.en).replace(esc(p.chunk), `<mark>${esc(p.chunk)}</mark>`);
  if (kind === 'learn') {
    const c = el(`<div class="card"><div class="muted">${esc(p.when)}</div><div class="row"><div class="en">${hl}</div>${playBtn()}</div><div class="ru">${esc(p.ru)}</div>
      <div class="assoc law"><b>Блок для заучивания</b>«${esc(p.chunk)}» — учите целиком, подставляйте свои слова</div></div>`);
    c.querySelector('.play').onclick = () => say(p);
    m.append(c);
    say(p);
    const b = el('<button class="btn">Понятно</button>');
    b.onclick = () => answer(true);
    m.append(b);
  } else if (kind === 'shadow') {
    const c = el(`<div class="card"><div class="row"><div class="en">${esc(p.en)}</div>${playBtn()}</div><div class="muted">Послушайте и повторите вслух, копируя интонацию.</div></div>`);
    c.querySelector('.play').onclick = () => say(p);
    m.append(c);
    say(p);
    mic(m, p.en, 'Нажмите и повторите фразу', (ok, sec) => setTimeout(() => answer(ok, sec), 700), settings.get().speech);
  } else if (kind === 'listen') {
    const c = el(`<div class="card" style="justify-items:center">${playBtn()}<div class="muted">Что прозвучало?</div></div>`);
    c.querySelector('.play').onclick = () => say(p);
    m.append(c);
    say(p);
    const wrong = shuffle(pool.filter(x => x.id !== p.id).map(x => x.ru)).slice(0, 2);
    choice(m, p.ru, wrong, answer);
  } else if (kind === 'build') {
    m.append(el(`<div class="card"><div class="muted">Соберите по-английски:</div><div class="ru">${esc(p.ru)}</div></div>`));
    tiles(m, p.en.split(' '), ' ', p.en, answer, { onCheck: () => say(p) });
  } else if (kind === 'say') {
    const c = el(`<div class="card"><div class="muted">${esc(p.when)}. Скажите по-английски:</div><div class="ru">${esc(p.ru)}</div><div class="timer">${FAST}</div></div>`);
    m.append(c);
    let left = FAST;
    const tm = c.querySelector('.timer');
    const iv = setInterval(() => { left--; tm.textContent = left > 0 ? left : 'медленно'; if (left <= 0) clearInterval(iv); }, 1000);
    mic(m, p.en, 'Говорите сразу, не обдумывая', (ok, sec) => {
      clearInterval(iv);
      const fast = ok && (sec != null ? sec <= FAST + LAG : left > 0);
      say(p);
      m.append(el(`<div class="fb ${ok ? 'ok' : 'bad'}">${fast ? 'На автомате! ' : ok ? 'Верно, но с обдумыванием. ' : 'Запомните: '}<b>${esc(p.en)}</b></div>`));
      const b = el('<button class="btn">Дальше</button>');
      b.onclick = () => answer(ok, fast ? 1 : 99);
      m.append(b);
    }, settings.get().speech);
  }
}

function rate(results, keyOf) {
  const by = new Map();
  for (const r of results) {
    const k = keyOf(r.task);
    const v = by.get(k) || { err: 0, fast: false };
    if (!r.ok && r.task.kind !== 'learn') v.err++;
    if (r.task.kind === 'say' && r.ok && r.sec != null && r.sec <= FAST) v.fast = true;
    by.set(k, v);
  }
  return by;
}

function learnPhrases(s, list, d) {
  const ps = list.map(p => ({ ...p, audio: s.audio }));
  const tasks = [];
  ps.forEach(p => tasks.push({ kind: 'learn', p }, { kind: 'shadow', p }));
  for (const kind of ['listen', 'build', 'say']) shuffle(ps).forEach(p => tasks.push({ kind, p }));
  run(s.title, tasks, (m, t, answer) => phraseTask(m, t.kind, t.p, s.phrases, answer), results => {
    let fresh = 0;
    rate(results, t => t.p.id).forEach((v, id) => {
      if (isNew(`p:${id}`)) fresh++;
      review(`p:${id}`, v.err === 0 ? (v.fast ? Rating.Good : Rating.Hard) : Rating.Again, v.fast && v.err === 0);
    });
    addToDay({ newPhrases: fresh });
    const frames = [...new Set(ps.map(p => p.frame).filter(Boolean))];
    summary(s.title, results, frames.length ? '<div class="muted">Дальше — рамки: та же конструкция с другими словами.</div>' : '', () => {
      if (frames.length) framesDrill(d, frames.slice(0, 2), reshow);
      else reshow();
    });
  });
}

/** Быстрый круг: только «сказать за 3 секунды» по знакомым фразам. */
function speedRound(s, list, d) {
  const ps = list.map(p => ({ ...p, audio: s.audio }));
  run('На скорость', ps.map(p => ({ kind: 'say', p })), (m, t, answer) => phraseTask(m, 'say', t.p, s.phrases, answer), results => {
    rate(results, t => t.p.id).forEach((v, id) => review(`p:${id}`, v.err ? Rating.Again : v.fast ? Rating.Good : Rating.Hard, v.fast && !v.err));
    addToDay({ reviews: results.length });
    summary('На скорость', results, '', reshow);
  });
}

/** Рамки: подставить слово и сказать фразу целиком. */
export function framesScreen(d) {
  show('Рамки', m => {
    m.append(el('<div class="muted">Рамка — каркас фразы, в который подставляются любые слова. Выучив 25 рамок, вы скажете сотни фраз.</div>'));
    d.frames.list.forEach(f => {
      const b = el(`<button class="card tap"><b>${esc(f.pattern)}</b><span class="muted">${esc(f.ru)}</span></button>`);
      b.onclick = () => framesDrill(d, [f.id], reshow);
      m.append(b);
    });
  }, true);
}

function framesDrill(d, ids, onDone) {
  const tasks = [];
  ids.forEach(id => {
    const f = d.frames.list.find(x => x.id === id);
    if (f) shuffle(f.cues).slice(0, 4).forEach(c => tasks.push({ f, c }));
  });
  run('Подстановка', tasks, (m, { f, c }, answer) => {
    m.append(el(`<div class="step">Рамка</div><div class="card"><div class="en">${esc(f.pattern)}</div><div class="muted">${esc(f.ru)}</div><div class="ru">Подставьте: <b>${esc(c.ru)}</b></div></div>`));
    mic(m, c.full, 'Скажите фразу целиком, быстро', (ok, sec) => {
      audio.play(audioUrl(d.frames.audio), c.a);
      m.append(el(`<div class="fb ${ok ? 'ok' : 'bad'}">${esc(c.full)}</div>`));
      const b = el('<button class="btn">Дальше</button>');
      b.onclick = () => answer(ok, sec);
      m.append(b);
    }, settings.get().speech);
  }, results => summary('Подстановка', results, '', onDone));
}

/** Сценка: собеседник говорит (голос George), ученик отвечает. */
function dialog(s, dg, d) {
  show(`Сценка: ${dg.title}`, m => {
    const chat = el('<div class="chat"></div>');
    const ctl = el('<div style="display:grid;gap:10px"></div>');
    m.append(chat, ctl);
    const url = audioUrl(dg.audio);
    let k = 0;
    let right = 0;
    const step = async () => {
      if (!m.isConnected) return;   // ушли со сценки — дальше не играем
      ctl.replaceChildren();
      if (k >= dg.lines.length) {
        ctl.append(el(`<div class="fb ok">Сценка пройдена: верно ${right} из ${dg.lines.filter(x => x.who === 'you').length} реплик.</div>`));
        const b = el('<button class="btn">К ситуации</button>');
        b.onclick = back;
        ctl.append(b);
        addToDay({ reviews: 1 });
        return;
      }
      const ln = dg.lines[k];
      if (ln.who === 'staff') {
        chat.append(el(`<div class="bubble staff">${esc(ln.en)}<span class="tr">${esc(ln.ru)}</span></div>`));
        m.parentElement.scrollTop = m.parentElement.scrollHeight;
        k++;
        await audio.play(url, ln.a);
        step();
      } else {
        ctl.append(el(`<div class="card"><div class="muted">Ваша реплика:</div><div class="ru">${esc(ln.ru)}</div></div>`));
        mic(ctl, ln.en, 'Ответьте вслух', async ok => {
          if (ok) right++;
          chat.append(el(`<div class="bubble you">${esc(ln.en)}</div>`));
          k++;
          await audio.play(url, ln.a);
          step();
        }, settings.get().speech);
        m.parentElement.scrollTop = m.parentElement.scrollHeight;
      }
    };
    step();
  }, true);
}

export { toast };
