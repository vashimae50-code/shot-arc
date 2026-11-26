import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeOutcome } from '../js/outcome.js';
import { measureShot } from '../js/trajectory.js';
import { makeTrack } from './helpers.js';

// 通過後の点を足す：dyPerFrame は画素（下が正）、frames 個
function after(points, frames, dxPerFrame, dyPerFrame) {
  const last = points[points.length - 1];
  return [...points, ...Array.from({ length: frames }, (_, i) => ({
    t: last.t + (i + 1) / 30, x: last.x + dxPerFrame * (i + 1), y: last.y + dyPerFrame * (i + 1),
  }))];
}

test('リングの中心を通ってネットの下まで落ちたら はいった', () => {
  const { calib, points } = makeTrack();
  const pts = after(points, 9, 0, 12); // 0.3秒で108画素下（ネットの下端は81画素下）
  assert.equal(judgeOutcome(calib, pts, measureShot(calib, pts)), 'make');
});

test('手前の縁の外を通って、はね上がったら はずれ', () => {
  const { calib, points } = makeTrack({ vx: -2.7 }); // 通過位置 x=0.30m
  const pts = after(points, 6, 3, -8);
  assert.equal(judgeOutcome(calib, pts, measureShot(calib, pts)), 'miss');
});

test('リングの高さを横切る前に点が終わったら ふめい', () => {
  const { calib, points } = makeTrack();
  const pts = points.filter((p) => p.t <= 0.9);
  assert.equal(judgeOutcome(calib, pts, measureShot(calib, pts)), 'unknown');
});

test('内側を通っても、0.5秒以内にリングより上に戻ったら はずれ（はね出し）', () => {
  const { calib, points } = makeTrack();
  const down = after(points, 3, 0, 6);
  const pts = after(down, 6, 4, -12);
  assert.equal(judgeOutcome(calib, pts, measureShot(calib, pts)), 'miss');
});

test('内側を通って、ネットの下まで見えないうちに見失ったら ふめい', () => {
  const { calib, points } = makeTrack();
  const pts = after(points, 2, 0, 10);
  assert.equal(judgeOutcome(calib, pts, measureShot(calib, pts)), 'unknown');
});

test('測れなかった軌道でも、点から判定できれば判定する', () => {
  const { calib, points } = makeTrack();
  const pts = after(points, 9, 0, 12);
  const m = { quality: 'unmeasured', reason: 'ずれがおおきい' };
  assert.equal(judgeOutcome(calib, pts, m), 'make');
});
