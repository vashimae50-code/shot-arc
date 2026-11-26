import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBall, detectRim } from '../js/ballDetect.js';
import { makeCalib } from '../js/geom.js';
import { blankImage, fillCircle, fillRect } from './helpers.js';

// 320×180 に縮小した画像での位置合わせ（リング幅45画素 → ボール半径11画素）
const calib = makeCalib({ rimX0: 140, rimX1: 185, rimY: 60, shooterSide: 'right' });
const roi = { x: 0, y: 0, w: 320, h: 180 };

test('動いたオレンジの円を1つ見つける', () => {
  const prev = fillCircle(blankImage(320, 180), 140, 100, 11);
  const cur = fillCircle(blankImage(320, 180), 160, 100, 11);
  const d = detectBall(cur, prev, calib, roi);
  assert.equal(d.length, 1);
  assert.ok(Math.hypot(d[0].x - 160, d[0].y - 100) <= 1.5, `中心 ${d[0].x},${d[0].y}`);
});

test('動いていない円は拾わない', () => {
  const prev = fillCircle(blankImage(320, 180), 160, 100, 11);
  const cur = fillCircle(blankImage(320, 180), 160, 100, 11);
  assert.equal(detectBall(cur, prev, calib, roi).length, 0);
});

test('小さすぎるオレンジの点は拾わない', () => {
  const prev = blankImage(320, 180);
  const cur = fillRect(blankImage(320, 180), 200, 50, 3, 1);
  assert.equal(detectBall(cur, prev, calib, roi).length, 0);
});

test('roi の外は見ない', () => {
  const prev = fillCircle(blankImage(320, 180), 40, 100, 11);
  const cur = fillCircle(blankImage(320, 180), 60, 100, 11);
  assert.equal(detectBall(cur, prev, calib, { x: 120, y: 0, w: 200, h: 180 }).length, 0);
});

test('横長のオレンジの棒をリングとして見つける', () => {
  const img = fillRect(blankImage(320, 180), 140, 60, 45, 4);
  const r = detectRim(img);
  assert.ok(r, 'null だった');
  assert.ok(Math.abs(r.rimX0 - 140) <= 2 && Math.abs(r.rimX1 - 185) <= 2, `左右 ${r.rimX0},${r.rimX1}`);
  assert.ok(Math.abs(r.rimY - 61.5) <= 2, `高さ ${r.rimY}`);
});

test('リングが無ければ null', () => {
  const img = fillCircle(blankImage(320, 180), 160, 60, 11); // 丸いボールはリングではない
  assert.equal(detectRim(img), null);
});
