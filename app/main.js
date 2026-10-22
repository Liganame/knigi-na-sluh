// Сборка плеера: загрузка книги, главы и голоса, связь движка, вида и панелей.
import { createEngine } from './engine.js';
import { parsePhrase, setFunctionWords } from './text.js';
import { loadSettings, saveSettings, position, heard, listened, store } from './store.js';
import * as view from './view.js';
import * as P from './panels.js';
import { registerServiceWorker, offlineVoices, downloadVoice, initInstall } from './offline.js';

const $ = (s, r = document) => r.querySelector(s);
const FONT = ['1.04rem', '1.18rem', '1.36rem'];
const SPEEDS = [0.75, 0.9, 1, 1.15, 1.25];
const RU_ORD = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая', 'восьмая', 'девятая',
  'десятая', 'одиннадцатая', 'двенадцатая'];

const app = {
  S: loadSettings(), book: null, slug: '', chapter: null, items: [], parsed: [],
  timings: {}, offline: {}, engine: null, wait: null, sleepAt: null, dur: 0,
};
let chapterLoad = 0;   // номер последней начатой загрузки главы: опоздавшие загрузки отбрасываются

const engine = createEngine({
  settings: () => app.S,
  onPhrase,
  onChapterEnd,
  onPhraseDone: i => {
    view.markHeard(app, i);
    view.renderStats(app);
  },
  onError: msg => P.toast('Не играет: ' + msg),
  onWait: w => { app.wait = w; view.renderWait(w); },
  onPlayState: playing => {
    view.renderPlayIcon(playing);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  },
  onFxError: msg => {
    const n = $('#fx-note');
    n.hidden = false;
    n.textContent = `Тональность и тембр недоступны: ${msg}.`;
  },
});
app.engine = engine;
const save = () => saveSettings(app.S);

/* ---------- данные ---------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ответ ${r.status}`);
  return r.json();
}

/** Тайминги голоса: [{dur, T: [{start, end, words: [{s, e}]}]}] по главам. */
async function voiceTimings(id) {
  if (!app.timings[id]) {
    const raw = await getJSON(`books/${app.slug}/timings/${id}.json`);
    app.timings[id] = raw.chapters.map(c => ({
      dur: c.dur,
      T: c.ph.map(([start, end, ws]) => ({ start, end, words: ws.map(([s, e]) => ({ s, e })) })),
    }));
  }
  return app.timings[id];
}

const audioSrc = (voice, n) => `books/${app.slug}/audio/${voice}/ch${n}.mp3`;
const voiceMeta = id => app.book.voices.find(v => v.id === id) || app.book.voices[0];

/* ---------- главы ---------- */
/** Открыть главу n с фразы idx. Возвращает false, если пока грузилось, выбрали другую главу. */
async function goChapter(n, autoplay = false, idx = 0) {
  const ch = app.book.chapters[n - 1];
  if (!ch) return false;
  const load = ++chapterLoad;
  const tm = (await voiceTimings(app.S.voice))[n - 1];
  if (load !== chapterLoad) return false;
  P.closePop();
  app.chapter = ch;
  const title = { ...ch.title, ru: `Глава ${RU_ORD[n - 1] || ch.roman}`, p: -1 };
  app.items = [title, ...ch.phrases];
  app.parsed = app.items.map(parsePhrase);
  if (tm.T.length !== app.items.length) throw new Error(`глава ${n}: фраз ${app.items.length}, а таймингов ${tm.T.length}`);
  $('#btn-chapter').textContent = `Глава ${ch.roman} ▾`;
  view.renderChapter(app);
  P.renderQuiz(app);
  P.renderChapterNav(app, actions);
  app.dur = tm.dur;
  const loaded = engine.load(audioSrc(app.S.voice, n), tm.T, idx, autoplay);  // тайминги главы — в движке сразу
  view.renderTrack(app, app.dur);
  view.renderStats(app);
  if (idx === 0) $('#reader').scrollTop = 0;
  setMediaMeta();
  return loaded;
}

function onPhrase(i) {
  view.markPhrase(app, i);
  view.resetKaraoke();
  view.follow(i);
  position.set(app.slug, app.chapter.n, i);
  P.closePop();
  view.renderStats(app);
}

function onChapterEnd() {
  const n = app.chapter.n;
  view.markHeard(app, app.items.length - 1);
  view.renderStats(app);
  if (app.S.sleep === 'ch') {
    app.S.sleep = 0;
    save();
    P.renderSeg('#seg-sleep', 0);
    P.toast('Таймер сна: глава окончена, чтение остановлено');
    return;
  }
  if (app.S.autoNext && n < app.book.chapters.length) {
    P.toast(`Глава ${app.book.chapters[n].roman}. Вопросы к прошлой — в конце её текста`);
    goChapter(n + 1, true).catch(fail);
    return;
  }
  P.toast(n < app.book.chapters.length ? 'Глава окончена — проверьте себя' : 'Книга окончена — проверьте себя');
  if (!$('#quiz').hidden) view.scrollToEl($('#quiz'));
}

/* ---------- действия интерфейса ---------- */
const preview = new Audio();
let previewStop = null;
const actions = {
  save,
  playFrom: i => engine.playFrom(i),
  playWord: (i, a, b) => engine.playWord(i, a, b),
  chapter: (n, autoplay = false) => {
    engine.pause();
    goChapter(n, autoplay).catch(fail);
  },
  async voice(id) {
    if (id === app.S.voice) return;
    const wasPlaying = engine.isPlaying();
    engine.pause();
    try {
      const n = app.chapter.n;
      const tm = (await voiceTimings(id))[n - 1];
      if (tm.T.length !== app.items.length) throw new Error(`тайминги главы ${n} не сходятся с текстом`);
      if (app.chapter.n !== n) return;
      app.S.voice = id;
      save();
      app.dur = tm.dur;
      const loaded = engine.load(audioSrc(id, n), tm.T, Math.max(0, engine.current()), wasPlaying);
      view.renderTrack(app, app.dur);
      P.renderVoices(app, actions);
      setMediaMeta();
      await loaded;
    } catch (e) {
      P.toast('Голос не загрузился: ' + e.message);
    }
  },
  async tryVoice(v, btn) {
    const was = previewStop && previewStop.id === v.id && !preview.paused;
    preview.pause();
    document.querySelectorAll('.voice .pill.on.try').forEach(b => { b.classList.remove('on', 'try'); b.textContent = '▶ проба'; });
    previewStop = null;
    if (was) return;
    try {
      const tm = (await voiceTimings(v.id))[0];
      engine.pause();
      preview.src = audioSrc(v.id, 1);
      preview.playbackRate = app.S.speed;
      previewStop = { id: v.id, end: tm.T[Math.min(2, tm.T.length - 1)].end };
      btn.classList.add('on', 'try');
      btn.textContent = '■ стоп';
      await preview.play();
    } catch (e) {
      P.toast('Проба не запустилась: ' + e.message);
    }
  },
  async download(v, btn) {
    if (app.offline[v.id]) {
      P.toast(`Голос ${v.name} уже работает без интернета`);
      return;
    }
    try {
      btn.disabled = true;
      await downloadVoice(app.book, v.id, p => { btn.textContent = Math.round(p * 100) + '%'; });
      app.offline[v.id] = true;
      P.toast(`Голос ${v.name} скачан — книга работает без интернета`);
    } catch (e) {
      P.toast('Не скачалось: ' + e.message);
    } finally {
      btn.disabled = false;
      P.renderVoices(app, actions);
    }
  },
  async playSaved(v) {
    if (v.slug !== app.slug) return;
    P.closeSheets();
    try {
      if (v.ch !== app.chapter.n && !(await goChapter(v.ch, false, v.i))) return;
      engine.playWord(v.i, v.a, v.b);
    } catch (e) {
      fail(e);
    }
  },
  speed: () => {
    engine.setSpeed(app.S.speed);
    preview.playbackRate = app.S.speed;
    P.renderOutputs(app.S);
  },
  fx: () => engine.applyFx(app.S.pitch, app.S.formant),
  enMode: () => {
    view.renderChapter(app);
    const cur = engine.current();
    if (cur >= 0) view.markPhrase(app, cur);
  },
  font: () => document.documentElement.style.setProperty('--fs', FONT[app.S.font] || FONT[1]),
  theme: () => {
    const r = document.documentElement;
    if (app.S.theme === 'system') r.removeAttribute('data-theme');
    else r.setAttribute('data-theme', app.S.theme);
  },
  sleep: () => {
    app.sleepAt = typeof app.S.sleep === 'number' && app.S.sleep > 0 ? Date.now() + app.S.sleep * 60000 : null;
    $('#sleep-hint').textContent = app.sleepAt
      ? `Остановлю чтение в ${new Date(app.sleepAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.`
      : app.S.sleep === 'ch' ? 'Остановлю чтение в конце главы.' : 'Остановит чтение через выбранное время или в конце главы.';
  },
};
preview.addEventListener('timeupdate', () => {
  if (previewStop && preview.currentTime >= previewStop.end) {
    preview.pause();
    previewStop = null;
    document.querySelectorAll('.voice .pill.on.try').forEach(b => { b.classList.remove('on', 'try'); b.textContent = '▶ проба'; });
  }
});

/* ---------- экран блокировки ---------- */
function setMediaMeta() {
  if (!('mediaSession' in navigator) || !app.chapter) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Глава ${app.chapter.roman}`,
      artist: `Диктор ${voiceMeta(app.S.voice).name}`,
      album: app.book.title,
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => engine.toggle());
    navigator.mediaSession.setActionHandler('pause', () => engine.toggle());
    navigator.mediaSession.setActionHandler('previoustrack', () => engine.step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => engine.step(1));
  } catch {
    // браузер без управления с экрана блокировки
  }
}

/* ---------- каждый кадр (рисование) и каждые 250 мс (логика, работает и в фоне) ---------- */
function frame(now) {
  requestAnimationFrame(frame);
  if (!app.chapter) return;
  const t = engine.tick();
  view.karaoke(app, engine.current(), engine.word(t));
  view.renderTime(engine.audio.currentTime, app.dur || engine.duration());
  view.renderWaitProgress(app.wait, now);
}

let lastBeat = performance.now();
let unsaved = 0;       // секунды прослушивания, ещё не записанные в память
function beat() {
  const now = performance.now();
  const dt = (now - lastBeat) / 1000;
  lastBeat = now;
  if (!app.chapter) return;
  engine.tick();
  if (engine.isAudible() && dt < 2) unsaved += dt;
  if (unsaved >= 5) flushListened();
  if (app.sleepAt && Date.now() >= app.sleepAt) {
    app.sleepAt = null;
    app.S.sleep = 0;
    save();
    P.renderSeg('#seg-sleep', 0);
    engine.pause();
    P.toast('Таймер сна: чтение остановлено');
  }
}

function flushListened() {
  if (unsaved <= 0) return;
  listened.add(unsaved);
  unsaved = 0;
  view.renderStats(app);
}

/* ---------- события ---------- */
function bindUi() {
  $('#btn-play').onclick = () => engine.toggle();
  $('#btn-prev').onclick = () => engine.step(-1);
  $('#btn-next').onclick = () => engine.step(1);
  $('#btn-repeat').onclick = () => engine.playFrom(Math.max(0, engine.current()));
  $('#btn-speed').onclick = () => {
    const ix = SPEEDS.findIndex(s => s > app.S.speed + 0.001);
    app.S.speed = ix < 0 ? SPEEDS[0] : SPEEDS[ix];
    save();
    $('#in-speed').value = app.S.speed;
    actions.speed();
  };
  $('#btn-settings').onclick = () => P.openSheet('settings');
  $('#btn-vocab').onclick = () => { P.renderVocab(app, actions); P.openSheet('vocab-sheet'); };
  $('#btn-chapter').onclick = () => P.openChapterMenu(app, actions);
  $('#scrim').onclick = P.closeSheets;
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = P.closeSheets; });
  $('#follow').onclick = () => view.follow(engine.current(), true);
  $('#coach-again').onclick = () => { P.closeSheets(); P.coach(0); };
  view.initScroll();

  document.addEventListener('click', ev => {
    const w = ev.target.closest('.w');
    if (w) {
      ev.stopPropagation();
      P.showHint(app, actions, +w.dataset.i, +w.dataset.k);
      return;
    }
    if (ev.target.closest('#cap') && $('#cap').classList.contains('blur')) {
      $('#cap').classList.remove('blur');
      return;
    }
    const ph = ev.target.closest('.ph');
    if (ph) {
      engine.playFrom(+ph.dataset.i);
      return;
    }
    if (!ev.target.closest('#pop')) P.closePop();
  });
  $('#track').addEventListener('pointerdown', ev => {
    const r = $('#track').getBoundingClientRect();
    const t = (ev.clientX - r.left) / r.width * (app.dur || engine.duration());
    engine.playFrom(engine.phraseAt(t));
  });
  document.addEventListener('keydown', ev => {
    if (ev.target.closest('input, textarea, select')) return;
    const k = ev.key.toLowerCase();
    if (ev.key === ' ') {
      ev.preventDefault();
      engine.toggle();
    } else if (ev.key === 'ArrowRight') engine.step(1);
    else if (ev.key === 'ArrowLeft') engine.step(-1);
    else if (k === 'r' || k === 'к') engine.playFrom(Math.max(0, engine.current()));
    else if (ev.key === 'Escape') {
      P.closeSheets();
      P.closePop();
    }
  });
  P.bindSettings(app, actions);
  initInstall($('#install-row'), $('#btn-install'));
  engine.audio.addEventListener('play', () => preview.pause());
  engine.audio.addEventListener('timeupdate', () => engine.tick());
  document.addEventListener('visibilitychange', flushListened);
  window.addEventListener('pagehide', flushListened);
}

function fail(e) {
  $('#text').replaceChildren(Object.assign(document.createElement('p'), {
    textContent: `Не удалось открыть книгу: ${e && e.message ? e.message : e}. Проверьте интернет и обновите страницу.`,
  }));
}

async function boot() {
  actions.theme();
  actions.font();
  registerServiceWorker();
  try {
    const shelf = await getJSON('books/index.json');
    const want = new URLSearchParams(location.search).get('b');
    const entry = shelf.books.find(b => b.slug === want) || shelf.books[0];
    app.slug = entry.slug;
    const [book, fw] = await Promise.all([getJSON(`books/${app.slug}/book.json`), getJSON('books/function_words.json')]);
    app.book = book;
    setFunctionWords(fw);
    if (!book.voices.some(v => v.id === app.S.voice)) app.S.voice = book.voices[0].id;
    document.title = `${book.title} — на слух`;
    $('#book-title').textContent = book.title;
    $('#book-sub').textContent = `${book.author} · английский ${book.level}`;
    bindUi();
    actions.sleep();
    app.offline = await offlineVoices(book);
    P.renderVoices(app, actions);
    P.renderVocabCount();
    const pos = position.get(app.slug);
    await goChapter(Math.min(Math.max(1, pos.ch), book.chapters.length), false, pos.idx);
    if (app.S.pitch !== 0 || app.S.formant !== 0) {
      document.addEventListener('pointerdown', () => actions.fx(), { once: true });
    }
    requestAnimationFrame(frame);
    setInterval(beat, 250);
    if (!store.get('coachDone', false)) setTimeout(() => P.coach(0), 600);
  } catch (e) {
    fail(e);
  }
}

// для автопроверки Playwright: reader.html?b=…&test=1
if (new URLSearchParams(location.search).has('test')) window.__knl = { app, engine, goChapter, actions, heard };

boot();
