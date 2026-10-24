// Законы слов: таблица всех 18 законов на одном экране (три группы цветом) → урок: правило, примеры
// со звуком → «угадай по закону» на незнакомых словах (+ пары для ложных друзей и частиц).
import { show } from './main.js';
import { el, esc, choice, playBtn } from './ui.js';
import { ic } from './icons.js';
import * as audio from './audio.js';
import { audioUrl, lawsData } from './data.js';
import { done, addToDay } from './progress.js';
import * as game from './game.js';
import { run, summary } from './session.js';

// краткая запись закона для плитки: знак, перевод, группа (tw — «близнецы», pt — части слов, sp — особые)
const SHORT = {
  tion: ['-tion', '-ция', 'tw'], al: ['-al', '-альный', 'tw'], ic: ['-ic', '-ический', 'tw'], ive: ['-ive', '-ивный', 'tw'],
  ity: ['-ity', '-ость', 'tw'], ment: ['-ment', '-мент', 'tw'], ure: ['-ure', '-ура', 'tw'], ist: ['-ist', '-ист, -изм', 'tw'],
  logy: ['-logy', '-логия', 'tw'], neg: ['un-', 'не-', 'pt'], again: ['re-', 'снова, пере-', 'pt'], doer: ['-er', 'тот, кто', 'pt'],
  fulless: ['-ful', '-less', 'pt'], nessly: ['-ness', '-ly, -able', 'pt'], compound: ['a+b', 'сложные', 'pt'],
  twins: ['taxi', 'близнецы', 'sp'], falsefriends: ['≠', 'ложные друзья', 'sp'], phrasal: ['up', 'фразовые', 'sp'],
};
const GROUP = { tw: ['c-violet', 'Близнецы'], pt: ['c-teal', 'Части слов'], sp: ['c-pink', 'Особые'] };
const ORDER = { tw: 0, pt: 1, sp: 2 };

/** «-ive = -ивный» — подпись закона для плана дня. */
export function shortOf(x) {
  const s = SHORT[x.id];
  return s ? `${s[0]} = ${s[1]}` : x.title;
}

export async function laws() {
  show('Законы слов', async m => {
    const d = await lawsData();
    const fin = done.laws();
    const opened = d.laws.filter(x => fin.has(x.id)).reduce((s, x) => s + (x.count || 0), 0);
    m.append(el(`<div class="legend">${Object.values(GROUP).map(([c, t]) => `<span class="${c}">${t}</span>`).join('')}
      <span class="c-orange">${fin.size} из ${d.laws.length}${opened ? ` · ≈${opened} слов` : ''}</span></div>`));
    const grid = el('<div class="ltiles stg"></div>');
    const list = [...d.laws].sort((a, b) => ORDER[(SHORT[a.id] || [])[2] || 'sp'] - ORDER[(SHORT[b.id] || [])[2] || 'sp']);
    list.forEach((x, i) => {
      const [sym, ru, g] = SHORT[x.id] || [x.id, x.title, 'sp'];
      const got = fin.has(x.id);
      const b = el(`<button class="ltile ${GROUP[g][0]} ${got ? 'got' : ''}" style="--i:${i}" aria-label="${esc(x.title)}${got ? ', открыт' : ''}">
        <small>${x.count ? `${x.count} слов` : g === 'pt' ? 'часть слова' : 'особый'}</small><b>${esc(sym)}</b><span>${esc(ru)}</span>
        ${got ? `<span class="ok">${ic('check')}</span>` : ''}</button>`);
      b.onclick = () => lesson(x);
      grid.append(b);
    });
    m.append(grid);
  });
}

export function lesson(x) {
  const url = audioUrl(x.audio);
  show(x.title, m => {
    m.append(el(`<div class="card"><div class="assoc law"><b>Закон</b>${esc(x.rule)}</div>${x.count ? `<div class="muted">В списке A1–B2 под него подходит ${x.count} слов.</div>` : ''}</div>`));
    const ex = el('<div class="card"><h2>Примеры</h2><div class="opts"></div></div>');
    x.examples.forEach(e => {
      const b = el(`<button class="opt"><b>${esc(e.en)}</b> — ${esc(e.ru)}</button>`);
      b.onclick = () => audio.play(url, e.a);
      ex.querySelector('.opts').append(b);
    });
    m.append(ex);
    if (x.pairs?.length) {
      const pr = el('<div class="card"><h2>Пары</h2><div class="list"></div></div>');
      x.pairs.forEach(p => pr.querySelector('.list').append(el(`<div class="row"><span><b>${esc(p.en)}</b> <span class="muted">≈ ${esc(p.looks)}</span></span><span>${esc(p.ru)}</span></div>`)));
      m.append(pr);
    }
    const b = el(`<button class="btn cc c-teal">Угадай по закону · +${game.PTS.law}</button>`);
    b.onclick = () => run('Угадай по закону', x.guess, (mm, g, answer) => {
      mm.append(el('<div class="step">Вы этого слова не учили — узнайте по закону</div>'));
      const c = el(`<div class="card" style="justify-items:center;text-align:center"><div class="word">${esc(g.en)}</div>${playBtn()}</div>`);
      c.querySelector('.play').onclick = () => audio.play(url, g.a);
      mm.append(c);
      audio.play(url, g.a);
      choice(mm, g.ru, g.wrong, answer);
    }, results => {
      const fresh = !done.laws().has(x.id);
      done.addLaw(x.id);
      if (fresh) {
        addToDay({ laws: 1 });   // «Закон дня» — это новый закон, повтор открытого не считается
        game.bonus(game.PTS.law, 'Закон открыт!');
      }
      summary(x.title, results, '<div class="muted">Закон засчитан — слова этого типа теперь узнаются по виду.</div>', () => laws());
    });
    m.append(b);
  }, true);
}
