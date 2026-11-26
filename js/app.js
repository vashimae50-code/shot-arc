// iPadの画面：打つ人選び → 位置合わせ → 撮影中 → まとめ。記録の一覧は records.js。
import { makeCalib } from './geom.js';
import { detectRim } from './ballDetect.js';
import { Pipeline } from './pipeline.js';
import { openStore } from './store.js';
import { ClipRecorder, pickMime } from './recorder.js';
import { drawRim, drawTrack, OUTCOME_LABEL, fmt } from './draw.js';
import { speechText, clipWindow, summarizeSession, toShotRecord, recorderPlan } from './session.js';
import { needsExportWarning } from './csv.js';

const PROC_W = 320;
const KEY = { player: 'shotarc.player', players: 'shotarc.players', side: 'shotarc.side', probe: 'shotarc.probe' };
const DEFAULT_PLAYERS = ['とらお', 'わかな', 'さこ'];
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 保存できなくても続ける */ } },
};
const $ = (id) => document.getElementById(id);

const S = {
  store: null, player: ls.get(KEY.player, null), side: ls.get(KEY.side, 'right'),
  stream: null, W: 0, H: 0, mode: 'off', rim: null, taps: [],
  pipeline: null, recorder: null, sessionId: null, sessionNo: null, shots: [], lastTrack: null, lastText: '',
};

const video = $('video');
const view = $('view');
const vctx = view.getContext('2d');
const proc = document.createElement('canvas');
const pctx = proc.getContext('2d', { willReadFrequently: true });

export function show(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
}

// ---------- 打つ人 ----------
function renderPlayers() {
  const box = $('players');
  box.innerHTML = '';
  for (const name of ls.get(KEY.players, DEFAULT_PLAYERS)) {
    const b = document.createElement('button');
    b.textContent = name;
    if (name === S.player) b.classList.add('last');
    b.onclick = () => { S.player = name; ls.set(KEY.player, name); startCalibration(); };
    box.appendChild(b);
  }
}

$('addPlayer').onclick = () => {
  const name = $('newName').value.trim();
  if (!name) return;
  const list = ls.get(KEY.players, DEFAULT_PLAYERS);
  if (!list.includes(name)) list.push(name);
  ls.set(KEY.players, list);
  $('newName').value = '';
  renderPlayers();
};

// ---------- カメラ ----------
async function openCamera() {
  if (S.stream) return true;
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
    });
  } catch (e) {
    alertBar(`カメラが つかえません（${e.name}）。せっていで カメラを きょかしてください。`);
    return false;
  }
  video.srcObject = S.stream;
  await video.play();
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  S.W = video.videoWidth; S.H = video.videoHeight;
  view.width = S.W; view.height = S.H;
  proc.width = PROC_W; proc.height = Math.round((S.H * PROC_W) / S.W);
  loop();
  return true;
}

function closeCamera() {
  if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
  S.stream = null; video.srcObject = null; S.mode = 'off';
}

function loop() {
  if (!S.stream) return;
  const next = (cb) => ('requestVideoFrameCallback' in video ? video.requestVideoFrameCallback(cb) : requestAnimationFrame(cb));
  next((now) => { try { onFrame(now); } catch (e) { console.error(e); } loop(); });
}

function procFrame() {
  pctx.drawImage(video, 0, 0, proc.width, proc.height);
  return pctx.getImageData(0, 0, proc.width, proc.height);
}

function onFrame(nowMs) {
  vctx.drawImage(video, 0, 0, S.W, S.H);
  const k = S.W / PROC_W;
  if (S.mode === 'calib') {
    if (S.rim) drawRim(vctx, makeCalib({ ...S.rim, shooterSide: S.side }), 1);
    vctx.fillStyle = '#ff1744';
    for (const p of S.taps) { vctx.beginPath(); vctx.arc(p.x, p.y, 10, 0, 7); vctx.fill(); }
  } else if (S.mode === 'live') {
    const results = S.pipeline.processFrame(nowMs / 1000, procFrame());
    drawRim(vctx, S.pipeline.calib, k);
    drawTrack(vctx, S.lastTrack, k);
    // 動画にも数字が残るように、画面の左上に書く
    if (S.lastText) {
      vctx.font = `${Math.round(S.H / 18)}px sans-serif`;
      vctx.fillStyle = 'rgba(0,0,0,.55)'; vctx.fillRect(0, 0, vctx.measureText(S.lastText).width + 24, S.H / 12);
      vctx.fillStyle = '#fff'; vctx.fillText(S.lastText, 12, S.H / 16);
    }
    for (const r of results) handleShot(r);
  }
}

// ---------- 位置合わせ ----------
async function startCalibration() {
  show('camera');
  $('calibBar').classList.remove('hidden');
  $('hud').classList.add('hidden');
  setSide(S.side);
  S.taps = [];
  if (!(await openCamera())) return;
  S.mode = 'calib';
  setTimeout(findRim, 800);
}

function findRim() {
  const r = detectRim(procFrame());
  const k = S.W / PROC_W;
  if (r) {
    S.rim = { rimX0: r.rimX0 * k, rimX1: r.rimX1 * k, rimY: r.rimY * k };
    $('calibMsg').textContent = 'リングを みつけました。みどりの わくが リングに あっていれば OK。ずれていたら リングの ひだりはし・みぎはしを タップ。';
  } else {
    $('calibMsg').textContent = 'リングが みつかりません。リングの ひだりはし・みぎはしを タップしてください。';
  }
  $('calibOk').disabled = !S.rim;
}

function setSide(side) {
  S.side = side; ls.set(KEY.side, side);
  $('sideLeft').classList.toggle('on', side === 'left');
  $('sideRight').classList.toggle('on', side === 'right');
}
$('sideLeft').onclick = () => setSide('left');
$('sideRight').onclick = () => setSide('right');
$('retryRim').onclick = () => { S.taps = []; findRim(); };
$('calibBack').onclick = () => { closeCamera(); show('home'); };

view.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'calib') return;
  // object-fit: contain を考えて、画面の位置を映像の画素に直す
  const r = view.getBoundingClientRect();
  const scale = Math.min(r.width / S.W, r.height / S.H);
  const ox = r.left + (r.width - S.W * scale) / 2, oy = r.top + (r.height - S.H * scale) / 2;
  S.taps.push({ x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale });
  if (S.taps.length === 2) {
    const [a, b] = S.taps;
    if (Math.abs(a.x - b.x) > 10) {
      S.rim = { rimX0: Math.min(a.x, b.x), rimX1: Math.max(a.x, b.x), rimY: (a.y + b.y) / 2 };
      $('calibMsg').textContent = 'リングを きめました。OK を おしてください。';
      $('calibOk').disabled = false;
    }
    S.taps = [];
  }
});

$('calibOk').onclick = () => {
  // iPadはタップの直後でないと声を出さないので、ここで1回鳴らしておく
  say('はじめます');
  startLive();
};

// ---------- 撮影中 ----------
async function startLive() {
  const calib = makeCalib({ ...S.rim, shooterSide: S.side });
  S.pipeline = new Pipeline(calib, { procWidth: PROC_W, srcWidth: S.W });
  S.shots = []; S.lastTrack = null; S.lastText = '';
  S.sessionId = await S.store.addSession({ player: S.player, calib });
  const sess = (await S.store.listSessions()).find((x) => x.id === S.sessionId);
  S.sessionNo = sess ? sess.no : null;
  const mime = pickMime();
  S.recorder = null;
  if (mime && view.captureStream) {
    const probe = ls.get(KEY.probe, null);
    S.recorder = new ClipRecorder({ stream: view.captureStream(30), mime, ...recorderPlan(probe ? probe.concurrentRecorders : undefined) });
    S.recorder.start();
  }
  $('calibBar').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('hudShot').textContent = 'うってください';
  updateToday();
  flash(S.recorder ? '' : 'このiPadでは どうがを ほぞんできません（すうじは のこります）');
  S.mode = 'live';
}

function say(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    speechSynthesis.speak(u);
  } catch (_) { /* 声が出せなくても続ける */ }
}

let flashTimer = null;
function flash(text) {
  $('hudFlash').textContent = text;
  clearTimeout(flashTimer);
  if (text) flashTimer = setTimeout(() => { $('hudFlash').textContent = ''; }, 6000);
}
function alertBar(text) { $('calibMsg').textContent = text; }

function shotLine(rec) {
  const mark = rec.outcome === 'make' ? '○' : rec.outcome === 'miss' ? '×' : '？';
  if (rec.quality !== 'ok') return `はかれなかった  ${mark}`;
  return `にゅうしゃかく ${fmt(rec.entryAngleDeg, 0)}°  さいこうてん +${fmt(rec.apexM, 1)}m  ${rec.depthLabel}  ${mark}`;
}

function updateToday() {
  const s = summarizeSession(S.shots);
  $('hudToday').textContent = `きょう：${s.count}本 ${s.makes}本はいった${s.avgEntry != null ? `  へいきん ${fmt(s.avgEntry, 0)}°` : ''}`;
}

async function handleShot(r) {
  const rec = toShotRecord(r, {
    sessionId: S.sessionId, sessionNo: S.sessionNo, idx: S.shots.length + 1, player: S.player, at: new Date(), procWidth: PROC_W,
  });
  S.shots.push(rec);
  S.lastTrack = r.track.points;
  S.lastText = `${rec.idx}本目  ${shotLine(rec)}`;
  $('hudShot').textContent = shotLine(rec);
  updateToday();
  say(speechText(r.metrics));
  // 数字はすぐ保存し、動画は録画の区切りが終わってから付ける
  const { shotId } = await S.store.saveShot(rec, null, null);
  if (!S.recorder) return;
  const w = clipWindow(r.track, r.metrics);
  const c = await S.recorder.clipFor(w.tStart, w.tEnd);
  const ok = c ? await S.store.attachClip(shotId, c.blob, { mime: c.mime, offsetS: c.offsetS, durationS: c.durationS }) : false;
  if (!ok) flash('どうがは ほぞんできなかった');
}

async function endLive() {
  if (S.mode !== 'live') return;
  S.mode = 'ending';
  for (const r of S.pipeline.flush(performance.now() / 1000)) handleShot(r);
  if (S.recorder) S.recorder.stop();
  await S.store.endSession(S.sessionId);
  const s = summarizeSession(S.shots);
  $('sumBody').innerHTML = '';
  const lines = [
    `${S.player}　${s.count}本うって ${s.makes}本はいった`,
    s.avgEntry != null ? `にゅうしゃかく：へいきん ${fmt(s.avgEntry, 1)}°（${fmt(s.minEntry, 0)}〜${fmt(s.maxEntry, 0)}°、${s.measured}本）` : 'にゅうしゃかく：はかれた シュートが ありません',
    `つうか：てまえ ${s.depth['てまえ']}　まんなか ${s.depth['まんなか']}　おく ${s.depth['おく']}`,
  ];
  for (const l of lines) { const d = document.createElement('div'); d.textContent = l; $('sumBody').appendChild(d); }
  show('summary');
}

$('endLive').onclick = () => endLive();
$('sumAgain').onclick = () => { show('camera'); startLive(); };
$('sumHome').onclick = () => { closeCamera(); goHome(); };

// 画面が消えた・別のアプリに切り替わったら、その回を終える（それまでの記録は保存済み）
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'live') endLive(); });

// ---------- ホーム ----------
async function goHome() {
  show('home');
  renderPlayers();
  try { $('warn').classList.toggle('hidden', !needsExportWarning(await S.store.listShots(), new Date())); } catch (_) { /* 表示だけ */ }
}

$('toRecords').onclick = async () => {
  const { showRecords } = await import('./records.js');
  showRecords(S.store, { show, onBack: goHome });
};

(async function init() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) { /* 続ける */ }
  S.store = await openStore();
  goHome();
})();

export { OUTCOME_LABEL };
