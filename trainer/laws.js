// Законы слов: правило → примеры со звуком → «угадай по закону» на незнакомых словах (+ пары для ложных друзей и частиц).
import { show } from './main.js';
import { el, esc, choice, playBtn } from './ui.js';
import * as audio from './audio.js';
import { audioUrl, lawsData } from './data.js';
import { done } from './progress.js';
import { run, summary } from './session.js';

export async function laws() {
  show('Законы слов', async m => {
    const d = await lawsData();
    const fin = done.laws();
    const opened = d.laws.filter(x => fin.has(x.id)).reduce((s, x) => s + (x.count || 0), 0);
    m.append(el(`<div class="card"><div class="row"><span>Законы открыли вам</span><span class="big">${opened}</span></div>
      <div class="muted">Правило — и слова узнаются без заучивания. Число — сколько слов списка A1–B2 подходит под закон; настоящих «близнецов» среди них примерно половина-две трети, ловушки разобраны в уроках.</div></div>`));
    d.laws.forEach(x => {
      const r = el(`<button class="card tap row"><span><b>${esc(x.title)}</b></span><span class="pill ${fin.has(x.id) ? 'done' : ''}">${fin.has(x.id) ? '✓ ' : ''}${x.count ? x.count + ' слов' : 'урок'}</span></button>`);
      r.onclick = () => lesson(x, d);
      m.append(r);
    });
  });
}

function lesson(x, d) {
  const url = audioUrl(x.audio);
  show(x.title, m => {
    m.append(el(`<div class="card"><div class="assoc law"><b>Закон</b>${esc(x.rule)}</div>${x.count ? `<div class="muted">В списке A1–B2 под него подходит ${x.count} слов.</div>` : ''}</div>`));
    const ex = el('<div class="card"><h2>Примеры</h2></div>');
    x.examples.forEach(e => {
      const b = el(`<button class="opt"><b>${esc(e.en)}</b> — ${esc(e.ru)}</button>`);
      b.onclick = () => audio.play(url, e.a);
      ex.append(b);
    });
    m.append(ex);
    if (x.pairs?.length) {
      const pr = el('<div class="card"><h2>Пары</h2></div>');
      x.pairs.forEach(p => pr.append(el(`<div class="row" style="border-top:1px solid var(--rule);padding-top:6px"><span><b>${esc(p.en)}</b> <span class="muted">≈ ${esc(p.looks)}</span></span><span>${esc(p.ru)}</span></div>`)));
      m.append(pr);
    }
    const b = el('<button class="btn">Угадай по закону: 8 незнакомых слов</button>');
    b.onclick = () => run('Угадай по закону', x.guess, (mm, g, answer) => {
      mm.append(el('<div class="step">Вы этого слова не учили — узнайте по закону</div>'));
      const c = el(`<div class="card" style="text-align:center"><div class="word">${esc(g.en)}</div>${playBtn()}</div>`);
      c.querySelector('.play').onclick = () => audio.play(url, g.a);
      mm.append(c);
      audio.play(url, g.a);
      choice(mm, g.ru, g.wrong, answer);
    }, results => {
      done.addLaw(x.id);
      summary(x.title, results, '<div class="muted">Закон засчитан — слова этого типа теперь узнаются по виду.</div>', () => laws());
    });
    m.append(b);
  }, true);
}
