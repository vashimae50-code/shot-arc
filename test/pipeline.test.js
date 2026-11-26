import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../js/pipeline.js';
import { makeTrack, blankImage, fillCircle } from './helpers.js';

// 1280×720 の元画像での位置合わせ（BASE_CALIB）を、320×180 に縮小して処理する
test('合成した動画から1本を見つけ、入射角と はいった を出す', () => {
  const { calib, points } = makeTrack();
  const k = 320 / 1280;
  const pipe = new Pipeline(calib, { procWidth: 320, srcWidth: 1280 });
  const ballR = pipe.calib.ballRpx;
  const last = points[points.length - 1];
  const frames = [];
  for (let i = -15; i < 0; i++) frames.push({ t: i / 30, pos: null });
  for (const p of points) frames.push({ t: p.t, pos: { x: p.x * k, y: p.y * k } });
  for (let i = 1; i <= 12; i++) frames.push({ t: last.t + i / 30, pos: { x: last.x * k, y: last.y * k + 3 * i } });
  for (let i = 13; i <= 30; i++) frames.push({ t: last.t + i / 30, pos: null });

  const results = [];
  for (const f of frames) {
    const img = blankImage(320, 180);
    if (f.pos) fillCircle(img, f.pos.x, f.pos.y, ballR);
    results.push(...pipe.processFrame(f.t, img));
  }
  assert.equal(results.length, 1);
  const r = results[0];
  assert.equal(r.metrics.quality, 'ok');
  assert.ok(Math.abs(r.metrics.entryAngleDeg - 53.1) <= 1.5, `入射角 ${r.metrics.entryAngleDeg}`);
  assert.equal(r.outcome, 'make');
});

test('flush で、見失う前に終わった軌道も閉じる', () => {
  const { calib, points } = makeTrack();
  const k = 320 / 1280;
  const pipe = new Pipeline(calib, { procWidth: 320, srcWidth: 1280 });
  let n = 0;
  for (const p of points) {
    n += pipe.processFrame(p.t, fillCircle(blankImage(320, 180), p.x * k, p.y * k, pipe.calib.ballRpx)).length;
  }
  assert.equal(n, 0);
  assert.equal(pipe.flush(1.0).length, 1);
});

test('逆光で暗く写るボールでも1本を見つける', () => {
  const { calib, points } = makeTrack();
  const k = 320 / 1280;
  const pipe = new Pipeline(calib, { procWidth: 320, srcWidth: 1280 });
  const last = points[points.length - 1];
  const frames = [];
  for (let i = -15; i < 0; i++) frames.push({ t: i / 30, pos: null });
  for (const p of points) frames.push({ t: p.t, pos: { x: p.x * k, y: p.y * k } });
  for (let i = 1; i <= 12; i++) frames.push({ t: last.t + i / 30, pos: { x: last.x * k, y: last.y * k + 3 * i } });
  for (let i = 13; i <= 30; i++) frames.push({ t: last.t + i / 30, pos: null });
  const results = [];
  for (const f of frames) {
    const img = blankImage(320, 180);
    if (f.pos) fillCircle(img, f.pos.x, f.pos.y, pipe.calib.ballRpx, [45, 28, 20]);
    results.push(...pipe.processFrame(f.t, img));
  }
  assert.equal(results.length, 1);
  assert.ok(Math.abs(results[0].metrics.entryAngleDeg - 53.1) <= 1.5);
  assert.equal(results[0].outcome, 'make');
});

test('srcWidth を省くと、位置合わせはそのまま処理画像の座標とみなす', () => {
  const { calib } = makeTrack();
  const pipe = new Pipeline(calib, { procWidth: 320 });
  assert.equal(pipe.calib.rimWpx, calib.rimWpx);
});
