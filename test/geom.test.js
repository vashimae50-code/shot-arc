import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCalib, toWorld, toPixel, scaleCalib, RIM_INNER_M, BALL_DIAMETER_M } from '../js/geom.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const base = { rimX0: 555, rimX1: 645, rimY: 300, shooterSide: 'right' };

test('定数', () => {
  assert.equal(RIM_INNER_M, 0.45);
  assert.equal(BALL_DIAMETER_M, 0.22);
});

test('makeCalib はリング幅から画素あたりのmを出す', () => {
  const c = makeCalib(base);
  assert.equal(c.rimWpx, 90);
  near(c.mPerPx, 0.005);
  assert.equal(c.cx, 600);
  near(c.netBottomY, 381);
  near(c.ballRpx, 22.0, 1e-6);
  assert.equal(c.sign, 1);
});

test('toWorld：右に打つ人', () => {
  const w = toWorld(makeCalib(base), { x: 1200, y: 480 });
  near(w.x, 3.0, 1e-9); near(w.y, -0.9, 1e-9);
});

test('toWorld：左に打つ人も打つ人側が正', () => {
  const w = toWorld(makeCalib({ ...base, shooterSide: 'left' }), { x: 0, y: 480 });
  near(w.x, 3.0, 1e-9); near(w.y, -0.9, 1e-9);
});

test('toPixel は toWorld の逆', () => {
  for (const side of ['left', 'right']) {
    const c = makeCalib({ ...base, shooterSide: side });
    const p = { x: 123.4, y: 456.7 };
    const q = toPixel(c, toWorld(c, p));
    near(q.x, p.x, 1e-9); near(q.y, p.y, 1e-9);
  }
});

test('scaleCalib は縮小した画像の座標に直す', () => {
  const c = scaleCalib(makeCalib(base), 0.5);
  assert.equal(c.rimX0, 277.5); assert.equal(c.rimWpx, 45);
  near(c.mPerPx, 0.01); near(c.ballRpx, 11.0, 1e-6); near(c.netBottomY, 190.5);
  assert.equal(c.sign, 1);
});
