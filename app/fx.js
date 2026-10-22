// Тональность и тембр голоса — библиотека Signalsmith Stretch (MIT, vendor/SignalsmithStretch.js).
// Пока оба сдвига на нуле, звук идёт напрямую. Подключить <audio> к обработке можно только
// один раз, поэтому дальше переключаем маршрут: напрямую или через обработку.

export function createFx(audio, onError) {
  const fx = { ctx: null, node: null, src: null, latency: 0, ready: null, failed: false, routedFx: false };

  async function enable() {
    if (typeof window.SignalsmithStretch !== 'function') throw new Error('библиотека обработки не загрузилась');
    fx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    fx.node = await window.SignalsmithStretch(fx.ctx);
    fx.src = fx.ctx.createMediaElementSource(audio);
    fx.node.connect(fx.ctx.destination);
    fx.latency = await fx.node.latency();
  }

  function route(throughFx) {
    try {
      fx.src.disconnect();
    } catch {
      // ещё ни к чему не подключён
    }
    fx.src.connect(throughFx ? fx.node : fx.ctx.destination);
    fx.routedFx = throughFx;
  }

  /** Применить сдвиги (в полутонах). Вызывать из обработчика нажатия — браузер требует жеста. */
  async function apply(pitch, formant) {
    const want = pitch !== 0 || formant !== 0;
    if (!want && !fx.ready) return;
    if (fx.failed) return;
    // одно подключение на всё время: быстрые движения ползунка ждут то же обещание
    if (!fx.ready) fx.ready = enable();
    try {
      await fx.ready;
    } catch (e) {
      fx.failed = true;
      onError(e && e.message ? e.message : String(e));
      return;
    }
    try {
      await fx.ctx.resume();
    } catch {
      // контекст поднимется при следующем нажатии
    }
    route(want);
    if (want) fx.node.schedule({ active: true, semitones: pitch, formantSemitones: formant, formantCompensation: true });
  }

  /** Насколько слышимый звук отстаёт от позиции файла (обработка добавляет задержку). */
  const delay = () => (fx.routedFx ? fx.latency : 0);

  return { apply, delay, state: fx };
}
