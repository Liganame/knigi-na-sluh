// Память: три техники (ключевое слово, история-цепочка, дворец памяти), карта своего маршрута из 10 мест
// и «прогулка» по нему со словами выученной пачки. Длинные списки — на вложенных экранах.
import { show } from './main.js';
import { el, esc, toast } from './ui.js';
import { ic } from './icons.js';
import * as audio from './audio.js';
import { audioUrl, packs, LEVELS } from './data.js';
import { done, palace, myAssoc } from './progress.js';
import { storyScreen } from './words.js';

const TECH = [
  { icon: 'key', c: 'c-orange', t: 'Ключевое слово', b: 'у каждого слова',
    text: 'Звучание английского слова → похожее русское → яркая картинка. key — «кий»: портье выдаёт кий вместо ключа. Готовая ассоциация есть у каждого слова, свою можно вписать на карточке — своя запоминается не хуже готовой.' },
  { icon: 'link', c: 'c-violet', t: 'Цепочка', b: '93% / 13%',
    text: 'Слова пачки связаны в один нелепый рассказ. В опыте Бауэра и Кларка (1969) так вспомнили 93% слов, а при простом повторении — 13%. История открывается после каждой пачки.' },
  { icon: 'home', c: 'c-teal', t: 'Дворец', b: '10 мест',
    text: 'Один раз задаёте маршрут по дому — 10 мест. Слова пачки «расставляются» по местам; вспоминаете, мысленно проходя маршрут. Метод мест — один из самых сильных приёмов запоминания.' },
];
// точки маршрута на карте дворца (проценты площадки)
const PINS = [[9, 85], [27, 76], [46, 60], [63, 69], [81, 70], [90, 59], [77, 33], [56, 30], [36, 25], [18, 15]];

async function learnedPacks() {
  const fin = done.packs();
  const out = [];
  for (const lv of LEVELS) for (const p of await packs(lv)) if (fin.has(p.id)) out.push(p);
  return out;
}

export async function memory() {
  show('Память', async m => {
    const techs = el('<div class="techs stg"></div>');
    TECH.forEach((x, i) => {
      const b = el(`<button class="tech ${x.c}" style="--i:${i}"><span class="pi">${ic(x.icon)}</span><b>${x.t}</b><small>${x.b}</small></button>`);
      b.onclick = () => show(x.t, mm => mm.append(el(`<div class="card ${x.c}"><span class="pi" style="width:52px;height:52px;border-radius:16px;background:var(--t);color:var(--c);display:grid;place-items:center">${ic(x.icon)}</span><div class="ru">${esc(x.text)}</div></div>`)), true);
      techs.append(b);
    });
    m.append(techs);
    const route = palace.get();
    const map = el(`<button class="card tap" style="gap:8px"><div class="row"><h2>Мой дворец</h2><b style="color:var(--violet)">${route.length} мест · изменить</b></div>
      <div class="palace"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M9 85 C20 85 22 76 27 76 S40 60 46 60 S58 69 63 69 S76 72 81 70 S94 62 90 59 S82 36 77 33 S62 30 56 30 S42 26 36 25 S24 18 18 15"/></svg>
      ${PINS.map(([x, y], i) => `<span class="pin on" style="--x:${x}%;--y:${y}%">${i + 1}</span>`).join('')}</div>
      <span class="muted">${esc(route[0] || '—')} → ${esc(route[1] || '—')} → … → ${esc(route[route.length - 1] || '—')}</span></button>`);
    map.onclick = () => routeEditor();
    m.append(map);
    const learned = await learnedPacks();
    const walk = el(`<button class="btn cc c-teal">${ic('route')}Прогулка по дворцу · ${learned.length} ${learned.length === 1 ? 'пачка' : 'пачек'}</button>`);
    walk.onclick = () => (learned.length ? walkList(learned) : toast('Выучите первую пачку слов — и по дворцу можно будет гулять'));
    m.append(walk);
  });
}

function routeEditor() {
  show('Мой маршрут', m => {
    m.append(el('<div class="muted">10 мест вашего дома по порядку обхода — от двери до кровати. Слова пачки встанут на эти места.</div>'));
    const card = el('<div class="card"></div>');
    palace.get().forEach((p, i) => card.append(el(`<div class="place"><span class="n">${i + 1}</span><input class="field" value="${esc(p)}" aria-label="Место ${i + 1}"></div>`)));
    m.append(card);
    const b = el('<button class="btn">Сохранить маршрут</button>');
    b.onclick = () => {
      palace.set([...card.querySelectorAll('input')].map(x => x.value.trim() || '—'));
      toast('Маршрут сохранён');
    };
    m.append(b);
  }, true);
}

function walkList(list) {
  show('Выученные пачки', m => {
    const card = el('<div class="card"><div class="list"></div></div>');
    list.slice().reverse().forEach(p => {
      const r = el(`<div class="row"><span style="min-width:0">${esc(p.words.map(w => w.w).join(', '))}</span><span class="chips"><button class="chip">История</button><button class="chip">Дворец</button></span></div>`);
      const [s, pl] = r.querySelectorAll('.chip');
      s.onclick = () => storyScreen(p, () => memory());
      pl.onclick = () => walk(p);
      card.querySelector('.list').append(r);
    });
    m.append(card);
  }, true);
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
