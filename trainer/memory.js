// Память: три техники (ключевое слово, история-цепочка, дворец памяти), свой маршрут из 10 мест
// и «прогулка» по нему со словами выученной пачки.
import { show } from './main.js';
import { el, esc, toast } from './ui.js';
import * as audio from './audio.js';
import { audioUrl, packs, LEVELS } from './data.js';
import { done, palace, myAssoc } from './progress.js';
import { storyScreen } from './words.js';

export async function memory() {
  show('Память', async m => {
    [['Ключевое слово', 'Звучание английского слова → похожее русское → яркая картинка. key — «кий»: портье выдаёт кий вместо ключа. Готовая ассоциация есть у каждого слова, свою можно вписать на карточке.'],
      ['История-цепочка', 'Слова пачки связаны в один нелепый рассказ. В опыте Бауэра и Кларка (1969) так вспомнили 93% слов, а при простом повторении — 13%.'],
      ['Дворец памяти', 'Один раз задаёте маршрут по дому — 10 мест. Слова пачки «расставляются» по местам; вспоминаете, мысленно проходя маршрут.']]
      .forEach(([h, t]) => m.append(el(`<div class="card"><h2>${h}</h2><div class="muted">${t}</div></div>`)));

    const route = palace.get();
    const ed = el('<details class="card"><summary><b>Мой маршрут: 10 мест дома</b></summary><div class="route"></div><button class="btn ghost">Сохранить маршрут</button></details>');
    route.forEach((p, i) => ed.querySelector('.route').append(el(`<div class="place"><span class="n">${i + 1}</span><input class="field" value="${esc(p)}" aria-label="Место ${i + 1}"></div>`)));
    ed.querySelector('.btn').onclick = () => {
      palace.set([...ed.querySelectorAll('input')].map(x => x.value.trim() || '—'));
      toast('Маршрут сохранён');
    };
    m.append(ed);

    const fin = done.packs();
    const learned = [];
    for (const lv of LEVELS) for (const p of await packs(lv)) if (fin.has(p.id)) learned.push(p);
    if (!learned.length) {
      m.append(el('<div class="muted">Когда выучите первую пачку слов, здесь появятся её история и прогулка по дворцу.</div>'));
      return;
    }
    const h = el('<div class="card"><h2>Выученные пачки</h2><div class="list"></div></div>');
    learned.slice(-15).reverse().forEach(p => {
      const r = el(`<div class="row"><span style="min-width:0">${esc(p.words.map(w => w.w).join(', '))}</span><span class="chips"><button class="chip">История</button><button class="chip">Дворец</button></span></div>`);
      const [s, pl] = r.querySelectorAll('.chip');
      s.onclick = () => storyScreen(p, () => memory());
      pl.onclick = () => walk(p);
      h.querySelector('.list').append(r);
    });
    m.append(h);
  });
}

/** Прогулка по дворцу: место → вспомнить слово → открыть. */
function walk(p) {
  const route = palace.get();
  show('Прогулка по дворцу', m => {
    m.append(el('<div class="muted">Представьте каждое слово на своём месте как можно ярче, потом пройдите маршрут и вспомните — откройте и проверьте.</div>'));
    p.words.forEach((w, i) => {
      const c = el(`<div class="card place"><span class="n">${i + 1}</span><div><b>${esc(route[i] || '—')}</b>
        <div class="muted">${esc(myAssoc.get(w.id) || w.assoc)}</div>
        <button class="chip" style="margin-top:6px">Открыть слово</button></div></div>`);
      c.querySelector('.chip').onclick = e => {
        e.target.textContent = `${w.w} — ${w.ru}`;
        audio.play(audioUrl(p.audio), w.a);
      };
      m.append(c);
    });
  }, true);
}
