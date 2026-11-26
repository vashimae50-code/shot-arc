// PCで動画ファイルにアプリと同じ解析をかける画面。
import { makeCalib } from './geom.js';
import { detectRim } from './ballDetect.js';
import { Pipeline } from './pipeline.js';
import { drawRim, drawTrack, OUTCOME_LABEL, fmt } from './draw.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const view = $('view');
const vctx = view.getContext('2d');
const PROC_W = 320;
const proc = document.createElement('canvas');
const pctx = proc.getContext('2d', { willReadFrequently: true });
let clicks = [];
let rim = null; // 元動画の画素 {rimX0, rimX1, rimY}
let results = [];

const msg = (s) => { $('msg').textContent = s; };

function drawFrame() {
  view.width = video.videoWidth; view.height = video.videoHeight;
  vctx.drawImage(video, 0, 0);
  if (rim) drawRim(vctx, makeCalib({ ...rim, shooterSide: $('side').value }), 1);
  for (const c of clicks) { vctx.fillStyle = '#f00'; vctx.beginPath(); vctx.arc(c.x, c.y, 6, 0, 7); vctx.fill(); }
}

$('file').addEventListener('change', () => {
  const f = $('file').files[0];
  if (!f) return;
  video.src = URL.createObjectURL(f);
  video.onloadeddata = async () => {
    video.currentTime = Math.min(2, video.duration / 2);
    await new Promise((r) => { video.onseeked = r; });
    proc.width = PROC_W; proc.height = Math.round((video.videoHeight * PROC_W) / video.videoWidth);
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    const found = detectRim(pctx.getImageData(0, 0, proc.width, proc.height));
    const k = video.videoWidth / PROC_W;
    rim = found ? { rimX0: found.rimX0 * k, rimX1: found.rimX1 * k, rimY: found.rimY * k } : null;
    clicks = [];
    drawFrame();
    msg(rim ? 'リングを見つけました。ずれていたら左はし・右はしをクリックしてください。' : 'リングの左はし・右はしをクリックしてください。');
    $('run').disabled = !rim;
  };
});

view.addEventListener('click', (e) => {
  const r = view.getBoundingClientRect();
  const x = ((e.clientX - r.left) * view.width) / r.width;
  const y = ((e.clientY - r.top) * view.height) / r.height;
  clicks.push({ x, y });
  if (clicks.length === 2) {
    rim = { rimX0: Math.min(clicks[0].x, clicks[1].x), rimX1: Math.max(clicks[0].x, clicks[1].x), rimY: (clicks[0].y + clicks[1].y) / 2 };
    clicks = [];
    $('run').disabled = false;
    msg('リングを決めました。「かいせき」をおしてください。');
  }
  drawFrame();
});

function addRow(r, i) {
  const tr = document.createElement('tr');
  const m = r.metrics;
  const cells = [i + 1, fmt(r.track.points[0].t), OUTCOME_LABEL[r.outcome],
    m.quality === 'ok' ? fmt(m.entryAngleDeg) : 'はかれなかった',
    m.quality === 'ok' ? `${m.depthLabel} ${fmt(m.depthCm, 0)}cm` : '', m.quality === 'ok' ? `${fmt(m.apexM, 2)}m` : '', r.track.points.length];
  for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); }
  $('tbl').querySelector('tbody').appendChild(tr);
}

$('run').addEventListener('click', () => {
  if (!rim) return;
  results = [];
  $('tbl').querySelector('tbody').innerHTML = '';
  $('run').disabled = true; $('csv').disabled = true;
  const pipe = new Pipeline(makeCalib({ ...rim, shooterSide: $('side').value }), { procWidth: PROC_W, srcWidth: video.videoWidth });
  const k = video.videoWidth / PROC_W;
  let lastTrack = null;
  video.currentTime = 0;
  video.playbackRate = 0.5; // 取りこぼしを減らすため、ゆっくり再生
  const onFrame = (_now, meta) => {
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    for (const r of pipe.processFrame(meta.mediaTime, pctx.getImageData(0, 0, proc.width, proc.height))) {
      results.push(r); addRow(r, results.length - 1); lastTrack = r.track.points;
    }
    vctx.drawImage(video, 0, 0);
    drawRim(vctx, pipe.calib, k);
    drawTrack(vctx, lastTrack, k);
    msg(`かいせきちゅう… ${fmt(meta.mediaTime, 0)} / ${fmt(video.duration, 0)} びょう（${results.length}本）`);
    if (!video.ended) video.requestVideoFrameCallback(onFrame);
  };
  video.onended = () => {
    for (const r of pipe.flush(video.duration)) { results.push(r); addRow(r, results.length - 1); }
    msg(`おわり：${results.length}本（はいった ${results.filter((r) => r.outcome === 'make').length}本）`);
    $('run').disabled = false; $('csv').disabled = false;
  };
  video.requestVideoFrameCallback(onFrame);
  video.play();
});

$('csv').addEventListener('click', () => {
  const head = 'じこく,けっか,にゅうしゃかく,リリースかく,さいこうてんm,つうかcm,つうか,きょりm,コマ,そくてい';
  const rows = results.map((r) => {
    const m = r.metrics;
    return [fmt(r.track.points[0].t, 2), OUTCOME_LABEL[r.outcome], fmt(m.entryAngleDeg), fmt(m.releaseAngleDeg), fmt(m.apexM, 2),
      fmt(m.depthCm, 0), m.depthLabel ?? '', fmt(m.distanceM, 2), r.track.points.length, m.quality === 'ok' ? 'ok' : 'はかれなかった'].join(',');
  });
  const blob = new Blob(['﻿' + [head, ...rows].join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'analyze.csv';
  a.click();
});
