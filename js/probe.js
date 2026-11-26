// 段階0：このiPadのSafariで、カメラのコマ数・録画・保存・声が使えるかを測る。
import { summarizeProbe } from './probeSummary.js';

const $ = (id) => document.getElementById(id);
const log = (msg) => { const p = document.createElement('div'); p.textContent = msg; $('log').appendChild(p); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measureFps(width, height) {
  const video = $('v');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 60 } },
    });
  } catch (e) {
    return { fps: 0, error: String(e) };
  }
  video.srcObject = stream;
  await video.play();
  await sleep(500);
  const settings = stream.getVideoTracks()[0].getSettings();
  let frames = 0;
  const seconds = 5;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    let running = true;
    const onFrame = () => { frames++; if (running) video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
    await sleep(seconds * 1000);
    running = false;
  } else {
    // 古いSafari向け：映像の時刻が進んだ回数を数える
    let last = -1;
    const end = performance.now() + seconds * 1000;
    while (performance.now() < end) {
      if (video.currentTime !== last) { frames++; last = video.currentTime; }
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  return { fps: Math.round((frames / seconds) * 10) / 10, settings };
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) { /* 次を試す */ }
  }
  return null;
}

function canPlay(blob) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    const url = URL.createObjectURL(blob);
    const done = (ok) => { URL.revokeObjectURL(url); resolve(ok); };
    v.onloadedmetadata = () => done(true);
    v.onerror = () => done(false);
    setTimeout(() => done(false), 5000);
    v.src = url;
  });
}

async function measureRecorders(mime, count, seconds) {
  if (!mime) return { concurrent: 0, sizes: [] };
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  let animating = true;
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    ctx.fillStyle = '#87bee9'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#e66e28';
    ctx.beginPath(); ctx.arc(320 + 250 * Math.sin(t * 2), 180 - 120 * Math.abs(Math.cos(t * 2)), 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = '24px sans-serif'; ctx.fillText(t.toFixed(1), 10, 30);
    if (animating) requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  const recs = [];
  for (let i = 0; i < count; i++) {
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime }); } catch (e) { log(`ろくが${i + 1}：つくれない ${e}`); continue; }
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    try { rec.start(); } catch (e) { log(`ろくが${i + 1}：はじめられない ${e}`); continue; }
    recs.push({ rec, chunks, stopped });
  }
  await sleep(seconds * 1000);
  recs.forEach(({ rec }) => { try { rec.stop(); } catch (_) { /* すでに止まっている */ } });
  await Promise.all(recs.map((r) => Promise.race([r.stopped, sleep(3000)])));
  animating = false;
  stream.getTracks().forEach((t) => t.stop());
  const sizes = [];
  let concurrent = 0;
  for (const { chunks } of recs) {
    const blob = new Blob(chunks, { type: mime });
    sizes.push(blob.size);
    if (blob.size > 0 && await canPlay(blob)) concurrent++;
  }
  return { concurrent, sizes };
}

async function testIdbBlob() {
  const name = 'shotarc-probe';
  const open = () => new Promise((res, rej) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('b');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  try {
    const db = await open();
    const blob = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'application/octet-stream' });
    await new Promise((res, rej) => {
      const tx = db.transaction('b', 'readwrite');
      tx.objectStore('b').put(blob, 'x');
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
    const back = await new Promise((res, rej) => {
      const req = db.transaction('b').objectStore('b').get('x');
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
    db.close();
    indexedDB.deleteDatabase(name);
    return !!back && back.size === blob.size;
  } catch (e) {
    log(`ほぞんのテスト：しっぱい ${e}`);
    return false;
  }
}

async function testVoice() {
  if (!('speechSynthesis' in window)) return false;
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise((r) => { speechSynthesis.onvoiceschanged = r; setTimeout(r, 2000); });
    voices = speechSynthesis.getVoices();
  }
  const ja = voices.some((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
  const u = new SpeechSynthesisUtterance('よんじゅうさんど、てまえ');
  u.lang = 'ja-JP';
  speechSynthesis.speak(u);
  return ja;
}

async function run() {
  $('start').disabled = true;
  const raw = { ua: navigator.userAgent, standalone: !!navigator.standalone, at: new Date().toISOString() };
  // 声は最初のタップの直後に鳴らす（Safariはタップ直後でないと鳴らさないことがある）
  raw.jaVoice = await testVoice();
  log(`にほんごのこえ：${raw.jaVoice ? 'あり' : 'なし'}`);

  log('カメラ 1280×720 をはかっています（5びょう）…');
  const f720 = await measureFps(1280, 720);
  raw.fps720 = f720.fps; raw.settings720 = f720.settings; if (f720.error) raw.camError = f720.error;
  log(`→ ${raw.fps720} コマ/びょう`);

  log('カメラ 1920×1080 をはかっています（5びょう）…');
  const f1080 = await measureFps(1920, 1080);
  raw.fps1080 = f1080.fps; raw.settings1080 = f1080.settings;
  log(`→ ${raw.fps1080} コマ/びょう`);

  raw.mime = pickMime();
  log(`ろくがのかたち：${raw.mime ?? 'なし'}`);

  log('ろくがを3ぼん同時にためしています（9びょう）…');
  const r = await measureRecorders(raw.mime, 3, 9);
  raw.concurrentRecorders = r.concurrent; raw.recorderSizes = r.sizes;
  log(`→ ${raw.concurrentRecorders} ぼん うごいた`);

  raw.persist = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    raw.quotaMB = Math.round((est.quota || 0) / 1048576);
    raw.usageMB = Math.round((est.usage || 0) / 1048576);
  }
  log(`データをのこす設定：${raw.persist ? 'できた' : 'できなかった'}（つかえる容量 ${raw.quotaMB ?? '?'} MB）`);

  raw.idbBlobOk = await testIdbBlob();
  log(`5MBのほぞん：${raw.idbBlobOk ? 'できた' : 'できなかった'}`);

  const s = summarizeProbe(raw);
  const out = { summary: s, raw };
  const verdict = document.createElement('div');
  verdict.className = s.verdict;
  verdict.textContent = s.verdict === 'ok' ? 'けっか：つかえそうです' : `けっか：むずかしい（${s.reasons.join('、')}）`;
  $('log').appendChild(verdict);
  $('out').textContent = JSON.stringify(out, null, 2);
  $('copy').disabled = false;
  $('start').disabled = false;
}

$('start').addEventListener('click', () => { run().catch((e) => log(`エラー：${e}`)); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('out').textContent); log('コピーしました。チャットにはりつけてください。'); }
  catch (_) { log('コピーできませんでした。下の文字を長押しして選んでコピーしてください。'); }
});
