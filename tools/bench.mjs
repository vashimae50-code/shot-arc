// PCで練習動画にアプリと同じ解析をかける（ffmpeg で 320 幅に縮小した画素を流す）。
// 使い方：node tools/bench.mjs <動画> --rim x0,x1,y --side right|left [--from 秒] [--to 秒] [--out 結果.json] [--csv 結果.csv]
//   --rim は元動画の画素でのリングの左端・右端・高さ
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { makeCalib } from '../js/geom.js';
import { Pipeline } from '../js/pipeline.js';

function args() {
  const a = process.argv.slice(2);
  const o = { video: a[0], side: 'right', from: 0, to: null, procWidth: 320 };
  for (let i = 1; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, ''), v = a[i + 1];
    if (k === 'rim') { const [x0, x1, y] = v.split(',').map(Number); o.rim = { rimX0: x0, rimX1: x1, rimY: y }; }
    else if (k === 'from' || k === 'to') o[k] = Number(v);
    else o[k] = v;
  }
  if (!o.video || !o.rim) { console.error('使い方：node tools/bench.mjs <動画> --rim x0,x1,y --side right|left'); process.exit(2); }
  return o;
}

function probe(video) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate', '-of', 'json', video]).toString();
  const s = JSON.parse(out).streams[0];
  const [n, d] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: n / d };
}

export async function runBench(o) {
  const info = probe(o.video);
  const procW = o.procWidth;
  const procH = Math.round((info.height * procW) / info.width / 2) * 2;
  const calib = makeCalib({ ...o.rim, shooterSide: o.side });
  const pipe = new Pipeline(calib, { procWidth: procW, srcWidth: info.width });
  const ff = ['-v', 'error'];
  if (o.from) ff.push('-ss', String(o.from));
  ff.push('-i', o.video);
  if (o.to != null) ff.push('-t', String(o.to - o.from));
  ff.push('-vf', `scale=${procW}:${procH}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-');
  const proc = spawn('ffmpeg', ff, { stdio: ['ignore', 'pipe', 'inherit'] });
  const frameBytes = procW * procH * 4;
  let buf = Buffer.alloc(0), idx = 0, nDets = 0;
  const shots = [];
  for await (const chunk of proc.stdout) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= frameBytes) {
      const data = new Uint8ClampedArray(buf.subarray(0, frameBytes));
      buf = buf.subarray(frameBytes);
      const t = o.from + idx / info.fps;
      for (const r of pipe.processFrame(t, { width: procW, height: procH, data })) shots.push(r);
      nDets += pipe.lastDets.length;
      idx++;
    }
  }
  shots.push(...pipe.flush(o.from + idx / info.fps));
  return { info, frames: idx, nDets, calib: pipe.calib, shots };
}

function summary(res) {
  const s = res.shots;
  const ok = s.filter((x) => x.metrics.quality === 'ok');
  const avg = (a) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : null);
  const sd = (a) => { const m = avg(a); return a.length > 1 ? Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / (a.length - 1)) : null; };
  const ang = (o) => ok.filter((x) => x.outcome === o).map((x) => x.metrics.entryAngleDeg);
  return {
    frames: res.frames, shots: s.length,
    make: s.filter((x) => x.outcome === 'make').length,
    miss: s.filter((x) => x.outcome === 'miss').length,
    unknown: s.filter((x) => x.outcome === 'unknown').length,
    measured: ok.length,
    entryMake: { mean: avg(ang('make')), sd: sd(ang('make')), n: ang('make').length },
    entryMiss: { mean: avg(ang('miss')), sd: sd(ang('miss')), n: ang('miss').length },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = args();
  const res = await runBench(o);
  const rows = res.shots.map((x) => ({
    t: +x.track.points[0].t.toFixed(2), tEnd: +x.track.endT.toFixed(2), outcome: x.outcome, quality: x.metrics.quality,
    reason: x.metrics.reason ?? '', entry: x.metrics.entryAngleDeg?.toFixed(1) ?? '', depth: x.metrics.depthCm?.toFixed(0) ?? '',
    n: x.track.points.length,
  }));
  const sum = summary(res);
  console.log(JSON.stringify(sum, null, 1));
  if (o.out) writeFileSync(o.out, JSON.stringify({ summary: sum, rows, shots: res.shots }, null, 1));
  if (o.csv) writeFileSync(o.csv, ['t,tEnd,outcome,quality,reason,entry,depth,n', ...rows.map((r) => Object.values(r).join(','))].join('\n'));
}
