// «Сегодня»: план дня, минуты и серия, повторения по расписанию, прогноз, настройки и перенос прогресса.
import { show, tab } from './main.js';
import { el, esc, ICON, shuffle, toast } from './ui.js';
import { wordIndex, phraseIndex, packs } from './data.js';
import * as P from './progress.js';
import { wordTask, learnPack } from './words.js';
import { phraseTask } from './phrases.js';
import { run, summary } from './session.js';

const HOURS_PER_LEVEL = 200;   // Cambridge: ~200 часов занятий на уровень CEFR
const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

export async function today() {
  show('Сегодня', async m => {
    const S = P.settings.get();
    const day = P.dayLog();
    const sec = day.sec + P.bookSecondsToday();
    const mins = Math.round(sec / 60);
    const share = Math.min(1, mins / S.minutes);
    const due = P.dueKeys();
    m.append(el(`<div class="card"><div class="row">
      <div><div class="muted">Цель на день</div><div class="big">${mins} из ${S.minutes} мин</div><div class="muted">Серия: ${P.streak()} дн. подряд (от 10 минут в день)</div></div>
      <svg class="ring" viewBox="0 0 80 80" aria-hidden="true"><circle class="bg" cx="40" cy="40" r="32"/><circle class="fg" cx="40" cy="40" r="32" stroke-dasharray="201" stroke-dashoffset="${(201 * (1 - share)).toFixed(0)}"/></svg>
    </div></div>`));
    const plan = el('<div class="plan"></div>');
    const add = (ic, title, desc, pill, fn) => {
      const c = el(`<button class="card tap"><span class="ico">${ICON[ic]}</span><span><b>${title}</b><br><span class="muted">${desc}</span></span><span class="pill ${pill === '✓' ? 'done' : ''}">${pill}</span></button>`);
      c.onclick = fn;
      plan.append(c);
    };
    add('rep', 'Повторить', due.length ? `${due.length} карточек по расписанию` : 'На сейчас всё повторено', due.length ? `${Math.ceil(due.length * 0.25)} мин` : '✓', () => {
      if (due.length) reviewSession(due.slice(0, 40)); else toast('Повторять пока нечего — новое придёт по расписанию');
    });
    const leftW = Math.max(0, S.newWords - day.newWords);
    add('word', 'Новые слова', leftW ? `ещё ${leftW} из ${S.newWords} · уровень ${S.level}` : 'План на сегодня выполнен', leftW ? `${Math.ceil(leftW / 10) * 6} мин` : '✓', async () => {
      const next = (await packs(S.level)).find(p => !P.done.packs().has(p.id));
      if (next) learnPack(next); else tab('words');
    });
    const leftP = Math.max(0, S.newPhrases - day.newPhrases);
    add('chat', 'Фразы на автомате', leftP ? `ещё ${leftP} из ${S.newPhrases} новых фраз` : 'Новые на сегодня есть — тренируйте скорость', leftP ? `${Math.ceil(leftP * 1.5)} мин` : '✓', () => tab('phrases'));
    add('law', 'Закон дня', 'Правило, которое открывает сразу много слов', '5 мин', () => tab('laws'));
    add('book', 'Книга на слух', '«Кавказский пленник» — продолжить с места', '15 мин', () => { location.href = 'reader.html?b=kavkazskiy-plennik'; });
    m.append(plan);
    m.append(forecast(S));
    const g = el(`<button class="btn ghost">${ICON.gear.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} Настройки и перенос прогресса</button>`);
    g.onclick = () => settingsScreen();
    m.append(g);
  });
}

function forecast(S) {
  const hist = P.history(7);
  const active = hist.filter(x => x.sec > 0);
  const avgMin = active.length >= 3 ? hist.reduce((s, x) => s + x.sec, 0) / 7 / 60 : S.minutes;
  const start = ORDER.indexOf(S.startLevel);
  const done = P.totalHours();
  const rows = [];
  for (let k = start + 1; k <= Math.min(ORDER.length - 1, start + 3); k++) {
    const need = (k - start) * HOURS_PER_LEVEL - done;
    const days = Math.max(0, Math.ceil(need * 60 / Math.max(5, avgMin)));
    const date = new Date(Date.now() + days * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    rows.push(`<div class="row"><span>${ORDER[k]}</span><span class="muted">≈ ${date}</span></div>`);
  }
  return el(`<div class="card"><h2>Прогноз</h2><div class="muted">По часам Cambridge (~${HOURS_PER_LEVEL} ч на уровень) и вашему темпу ${Math.round(avgMin)} мин/день${active.length >= 3 ? ' за последнюю неделю' : ' (пока по плану)'}; набрано ${done.toFixed(1).replace('.', ',')} ч.</div><div class="list">${rows.join('')}</div></div>`);
}

/** Повторения: слова и фразы вперемешку, по одному заданию на карточку. */
export async function reviewSession(keys) {
  const [wi, pi] = await Promise.all([wordIndex(), phraseIndex()]);
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
    m.append(sp);
    m.querySelectorAll('input[type=range]').forEach(r => { r.oninput = () => { m.querySelector(`#${r.id}-o`).textContent = r.value + (r.id === 's-min' ? ' мин' : ''); }; });
    const save = el('<button class="btn">Сохранить</button>');
    save.onclick = () => {
      P.settings.set({ ...S, minutes: +m.querySelector('#s-min').value, newWords: +m.querySelector('#s-w').value, newPhrases: +m.querySelector('#s-p').value,
        speech: m.querySelector('#s-sp').checked, startLevel: lv.querySelector('[aria-pressed="true"]').textContent });
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
