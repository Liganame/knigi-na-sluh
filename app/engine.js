// Движок воспроизведения: один <audio> на главу, тайминги фраз и слов, эхо/повторы/паузы.
// Подсветку и интерфейс не трогает — сообщает о событиях через hooks.
import { createFx } from './fx.js';

/**
 * @param {{
 *   settings: () => object,
 *   onPhrase: (i: number) => void,
 *   onChapterEnd: () => void,
 *   onWait: (w: {label: string, until: number, total: number} | null) => void,
 *   onPhraseDone: (i: number) => void,
 *   onPlayState: (playing: boolean) => void,
 *   onFxError: (msg: string) => void,
 *   onError: (msg: string) => void,
 * }} hooks
 */
export function createEngine(hooks) {
  const A = new Audio();
  A.preload = 'auto';
  A.preservesPitch = true;
  A.webkitPreservesPitch = true;
  const fx = createFx(A, hooks.onFxError);
  const st = { T: null, cur: -1, handled: -1, repDone: 0, stopAt: null, wait: null, src: '', loadId: 0, doneFor: -1 };

  const S = () => hooks.settings();
  const needStop = () => S().echo || S().repeat > 1 || S().gap > 0;
  const playing = () => !A.paused || !!st.wait;
  const emitState = () => hooks.onPlayState(playing());

  function play() {
    A.play().catch(() => emitState());
  }

  function setCurrent(i) {
    st.cur = i;
    hooks.onPhrase(i);
  }

  /**
   * Загрузить главу: src — mp3, T — [{start, end, words: [{s, e}]}], idx — с какой фразы.
   * Возвращает обещание, которое выполняется, когда звук готов и встал на нужную фразу.
   * Если за это время начата другая загрузка, старая молча отменяется.
   */
  function load(src, T, idx, autoplay) {
    cancelWait();
    st.stopAt = null;
    st.T = T;
    st.handled = -1;
    st.repDone = 0;
    st.doneFor = -1;
    const id = ++st.loadId;
    const i = Math.min(Math.max(0, idx), T.length - 1);
    return new Promise(resolve => {
      const go = () => {
        if (id !== st.loadId) return resolve(false);
        A.playbackRate = S().speed;
        A.currentTime = T[i].start;
        setCurrent(i);
        if (autoplay) play();
        emitState();
        resolve(true);
      };
      if (st.src !== src || A.readyState < 1) {
        st.src = src;
        A.defaultPlaybackRate = S().speed;
        A.src = src;
        A.addEventListener('loadedmetadata', go, { once: true });
      } else {
        go();
      }
    });
  }

  function phraseAt(t) {
    const T = st.T;
    let lo = 0;
    let hi = T.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (T[m].start <= t + 0.001) {
        ans = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return ans;
  }

  function cancelWait() {
    if (!st.wait) return;
    clearTimeout(st.wait.timer);
    st.wait = null;
    hooks.onWait(null);
    emitState();
  }

  function startWait(sec, label, fn) {
    cancelWait();
    if (sec <= 0.01) {
      fn();
      return;
    }
    const until = performance.now() + sec * 1000;
    st.wait = {
      until, total: sec * 1000, label,
      timer: setTimeout(() => {
        st.wait = null;
        hooks.onWait(null);
        fn();
      }, sec * 1000),
    };
    hooks.onWait({ label, until, total: sec * 1000 });
    emitState();
  }

  function playFrom(i, keepRepeat = false) {
    if (!st.T) return;
    cancelWait();
    st.stopAt = null;
    if (!keepRepeat) st.repDone = 0;
    st.handled = -1;
    const k = Math.min(Math.max(0, i), st.T.length - 1);
    setCurrent(k);
    A.currentTime = st.T[k].start;
    play();
    emitState();
  }

  /** Конец фразы в режимах эха/повтора/паузы: решаем, что дальше. */
  function boundary() {
    const i = st.cur;
    const T = st.T;
    const dur = (T[i].end - T[i].start) / S().speed;
    const echo = S().echo ? dur * S().echoK + 0.3 : 0;
    if (st.repDone < S().repeat - 1) {
      st.repDone++;
      startWait(S().echo ? echo : 0.5, S().echo ? 'Повторите вслух' : 'Ещё раз', () => playFrom(i, true));
      return;
    }
    st.repDone = 0;
    if (i >= T.length - 1) {
      // и после последней фразы главы эхо даёт время повторить
      startWait(echo, 'Повторите вслух', () => {
        A.pause();
        hooks.onChapterEnd();
      });
      return;
    }
    startWait(echo + S().gap, S().echo ? 'Повторите вслух' : 'Пауза', () => playFrom(i + 1, true));
  }

  function toggle() {
    if (!st.T) return;
    if (st.wait) {
      cancelWait();
      return;
    }
    if (A.paused) {
      const last = st.T.length - 1;
      const atEnd = st.cur >= 0 && A.currentTime >= st.T[st.cur].end - 0.05;
      if (st.cur >= last && atEnd) {
        playFrom(0);
        return;
      }
      if (st.handled === st.cur && atEnd) {
        // пауза пришлась на паузу эха/повтора — продолжаем со следующей фразы
        playFrom(st.cur + 1);
        return;
      }
      st.handled = -1;
      st.stopAt = null;
      play();
    } else {
      A.pause();
    }
  }

  function pause() {
    cancelWait();
    A.pause();
  }

  const step = d => playFrom(st.cur + d);

  /** Слово (или сочетание a..b) из записи этим же голосом; потом встаём в начало фразы. */
  function playWord(i, a, b) {
    if (!st.T || !st.T[i]) return;
    const w0 = st.T[i].words[a];
    const w1 = st.T[i].words[b];
    if (!w0 || !w1) return;
    cancelWait();
    A.pause();
    if (i !== st.cur) setCurrent(i);
    A.currentTime = Math.max(0, w0.s - 0.03);
    st.stopAt = w1.e + 0.06;
    play();
  }

  /**
   * Вызывается каждый кадр и раз в 250 мс по таймеру (кадры в фоне не идут, а эхо,
   * повторы и паузы должны работать и с выключенным экраном). Возвращает слышимое время.
   */
  function tick() {
    if (!st.T) return 0;
    const raw = A.currentTime;
    const t = raw - fx.delay();
    if (st.stopAt != null) {
      if (raw >= st.stopAt) {
        A.pause();
        st.stopAt = null;
        A.currentTime = st.T[st.cur].start;
      }
      return t;
    }
    if (A.paused) return t;
    if (st.cur >= 0 && st.doneFor !== st.cur && raw >= st.T[st.cur].end - 0.05) {
      st.doneFor = st.cur;
      hooks.onPhraseDone(st.cur);
    }
    if (needStop() && st.cur >= 0 && st.handled !== st.cur && raw >= st.T[st.cur].end - 0.02) {
      st.handled = st.cur;
      A.pause();
      boundary();
      return t;
    }
    // Само воспроизведение двигает фразу только вперёд. Назад — только нажатием (playFrom):
    // иначе с тональностью (звук отстаёт на задержку обработки) сразу после перехода
    // время «t» ещё в прошлой фразе, и эхо/повтор зацикливались бы на ней.
    const k = phraseAt(t);
    if (k > st.cur && !(needStop() && st.handled !== st.cur)) setCurrent(k);
    return t;
  }

  A.addEventListener('play', emitState);
  A.addEventListener('pause', emitState);
  A.addEventListener('ended', () => {
    if (!st.wait && st.stopAt == null) hooks.onChapterEnd();
  });
  A.addEventListener('error', () => {
    if (!A.src) return;
    hooks.onError(navigator.onLine ? 'звук главы не загрузился' : 'нет интернета, а этот голос не скачан для офлайна');
  });

  return {
    audio: A,
    load, playFrom, toggle, pause, step, playWord, tick, phraseAt,
    setSpeed: s => {
      A.playbackRate = s;
      A.defaultPlaybackRate = s;
    },
    applyFx: (pitch, formant) => fx.apply(pitch, formant),
    isPlaying: playing,
    isAudible: () => !A.paused,
    current: () => st.cur,
    timings: () => st.T,
    duration: () => A.duration || (st.T ? st.T[st.T.length - 1].end + 0.4 : 0),
    word: t => {
      if (!st.T || st.cur < 0 || A.paused) return -1;
      const ws = st.T[st.cur].words;
      let k = -1;
      for (let j = 0; j < ws.length; j++) {
        if (ws[j].s <= t + 0.02) k = j;
        else break;
      }
      return k >= 0 && t > ws[ws.length - 1].e + 0.15 ? -1 : k;
    },
  };
}
