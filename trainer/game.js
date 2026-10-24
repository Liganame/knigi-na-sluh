// Игра: очки, серия верных подряд (комбо), награды и праздничные эффекты поверх экрана.
// Эффекты живут в слое #fx над экранами — переход к следующему заданию их не обрывает.
import { points, stats, earned, streak, learnedCount, cardKeys, done, totalHours, bookByDate, bookPaid } from './progress.js';
import * as sfx from './sfx.js';
import { ic } from './icons.js';

/** Сколько очков за что (утверждено в брифе 24.10.2026). */
export const PTS = { answer: 10, pack: 50, auto: 20, scene: 40, law: 30, bookMin: 2, dayPlan: 150 };
const COMBO_MARKS = [3, 5, 10, 20];

let combo = 0;
export const comboNow = () => combo;

const changed = () => document.dispatchEvent(new CustomEvent('knl:stats'));
const quiet = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function spawn(cls, html, ms) {
  const layer = document.getElementById('fx');
  if (!layer) return null;
  const n = document.createElement('div');
  n.className = cls;
  n.innerHTML = html;
  layer.append(n);
  setTimeout(() => n.remove(), ms);
  return n;
}

/** Конфетти: n кусочков разного цвета падают сверху. */
export function confetti(n = 26) {
  if (quiet()) return;
  const layer = document.getElementById('fx');
  if (!layer) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'fx-cf';
    p.style.left = `${Math.random() * 100}%`;
    p.style.setProperty('--d', `${(Math.random() * 0.35).toFixed(2)}s`);
    p.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.setProperty('--x', `${Math.round(Math.random() * 120 - 60)}px`);
    p.dataset.c = String(i % 6);
    layer.append(p);
    setTimeout(() => p.remove(), 1900);
  }
}

function shake(target) {
  if (quiet() || !target) return;
  target.classList.remove('shake');
  void target.offsetWidth;   // перезапуск анимации
  target.classList.add('shake');
}

/** Ответ в упражнении: звук, очки, серия, всплывающее «+10» или покачивание неверного варианта. */
export function answer(ok, target = null) {
  if (ok) {
    combo++;
    points.add(PTS.answer);
    sfx.right(combo);
    spawn('fx-plus', `+${PTS.answer}`, 1000);
    if (COMBO_MARKS.includes(combo)) {
      spawn('fx-combo', `${ic('flame')}<b>Серия ×${combo}!</b>`, 1600);
      confetti(combo >= 10 ? 36 : 18);
    }
  } else {
    combo = 0;
    sfx.wrong();
    shake(target);
  }
  changed();
}

/** Бонус за большое дело: пачка, сценка, закон, весь план дня. */
export function bonus(n, title) {
  points.add(n);
  changed();
  celebrate(title, `+${n} очков`);
}

/** Большая плашка-праздник посреди экрана: заголовок, подпись, конфетти и аккорд. */
export function celebrate(title, sub = '', icon = 'trophy') {
  sfx.win();
  confetti();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  spawn('fx-banner', `<span class="fx-ico">${ic(icon)}</span><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`, 2300);
}

/** Очки за книгу: +2 за каждую новую полную минуту прослушивания — по всем датам, поэтому минуты,
 *  дослушанные перед полуночью, не пропадают, если вернуться в тренажёр уже утром. */
export function payBook() {
  const paid = { ...bookPaid.get() };
  let mins = 0;
  for (const [d, sec] of Object.entries(bookByDate())) {
    if (!Number.isFinite(sec)) continue;
    const m = Math.floor(sec / 60);
    const prev = Number(paid[d]) || 0;
    if (m > prev) {
      mins += m - prev;
      paid[d] = m;
    }
  }
  if (mins) {
    bookPaid.set(paid);
    // отметка «оплачено» не записалась (память переполнена) — не платим, иначе заплатим дважды
    if (JSON.stringify(bookPaid.get()) !== JSON.stringify(paid)) return 0;
    points.add(mins * PTS.bookMin);
    changed();
  }
  return mins;
}

/** 12 наград — проверяются по уже сохраняемому прогрессу. */
export const BADGES = [
  { id: 'pack1', t: 'Первая пачка', icon: 'cards', ok: s => s.packs >= 1 },
  { id: 'streak5', t: '5 дней подряд', icon: 'flame', ok: s => s.streak >= 5 },
  { id: 'streak30', t: '30 дней подряд', icon: 'flame', ok: s => s.streak >= 30 },
  { id: 'streak100', t: '100 дней подряд', icon: 'flame', ok: s => s.streak >= 100 },
  { id: 'words100', t: '100 слов', icon: 'trophy', ok: s => s.words >= 100 },
  { id: 'words500', t: '500 слов', icon: 'trophy', ok: s => s.words >= 500 },
  { id: 'words1000', t: '1000 слов', icon: 'trophy', ok: s => s.words >= 1000 },
  { id: 'scene1', t: 'Первая сценка', icon: 'talk', ok: s => s.scenes >= 1 },
  { id: 'sits15', t: 'Все 15 ситуаций', icon: 'chat', ok: s => s.sits >= 15 },
  { id: 'law1', t: 'Закон открыт', icon: 'grid', ok: s => s.laws >= 1 },
  { id: 'laws18', t: 'Все 18 законов', icon: 'grid', ok: s => s.laws >= 18 },
  { id: 'hours10', t: '10 часов занятий', icon: 'clock', ok: s => s.hours >= 10 },
];

function snapshot() {
  const sits = new Set(cardKeys().filter(k => k.startsWith('p:')).map(k => k.slice(2, k.lastIndexOf('-'))));
  return {
    packs: done.packs().size, streak: streak(), words: learnedCount('w:'), scenes: Number(stats.get().scenes) || 0,
    sits: sits.size, laws: done.laws().size, hours: totalHours(),
  };
}

/** Проверить награды; новые отметить и показать. Возвращает новые. */
export function checkBadges() {
  const s = snapshot();
  const have = earned.get();
  const fresh = BADGES.filter(b => !have[b.id] && b.ok(s));
  fresh.forEach(b => earned.add(b.id));
  if (fresh.length) setTimeout(() => celebrate('Новая награда!', fresh.map(b => b.t).join(' · ')), 2400);
  return fresh;
}

export function badgeList() {
  const have = earned.get();
  return BADGES.map(b => ({ ...b, got: !!have[b.id] }));
}
