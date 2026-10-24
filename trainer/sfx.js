// Короткие звуки за ответы — синтезируются на месте (без файлов, работают без сети).
// Выключаются в настройках; на тот же звуковой движок, что и слова, но не прерывают их.
import { context } from './audio.js';
import { settings } from './progress.js';

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

function tone(freq, start, dur, { type = 'sine', gain = 0.13, slide = 0 } = {}) {
  const c = context();
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function allowed() {
  if (!settings.get().sounds) return false;
  try {
    const c = context();
    if (c.state === 'suspended') c.resume().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Верный ответ: «дзинь» из двух нот; чем длиннее серия, тем выше. */
export function right(combo = 1) {
  if (!allowed()) return;
  const up = combo >= 10 ? 1.5 : combo >= 5 ? 1.26 : combo >= 3 ? 1.12 : 1;
  tone(NOTE.E6 * up, 0, 0.11);
  tone(NOTE.A5 * up * 1.5, 0.08, 0.2);
}

/** Ошибка: мягкий низкий тон вниз — без резкости. */
export function wrong() {
  if (!allowed()) return;
  tone(220, 0, 0.22, { type: 'triangle', gain: 0.1, slide: 0.7 });
}

/** Победа (пачка, план дня, награда): короткий аккорд-арпеджио. */
export function win() {
  if (!allowed()) return;
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(f, i * 0.09, 0.32, { gain: 0.11 }));
}
