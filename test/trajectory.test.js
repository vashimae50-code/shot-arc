import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureShot } from '../js/trajectory.js';
import { makeTrack } from './helpers.js';

const within = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} は ${b}±${eps} の外`);

function assertStandard(m) {
  assert.equal(m.quality, 'ok');
  within(m.entryAngleDeg, 53.1, 0.5, '入射角');
  within(m.releaseAngleDeg, 62.6, 0.5, 'リリース角');
  within(m.apexM, 0.82, 0.03, '最高点');
  within(m.depthCm, 22.5, 1.0, '通過位置');
  assert.equal(m.depthLabel, 'まんなか');
  within(m.distanceM, 3.0, 0.05, '距離');
  within(m.flightS, 1.0, 0.04, '飛んだ時間');
}

test('標準の軌道で各値が出る', () => {
  const { calib, points } = makeTrack();
  const m = measureShot(calib, points);
  assertStandard(m);
  assert.equal(m.nPoints, 31);
});

test('打つ人が左側でも同じ値（Review Focus 3）', () => {
  const { calib, points } = makeTrack({ side: 'left' });
  assertStandard(measureShot(calib, points));
});

test('リングの高さまで降りてこない軌道は測れない（Review Focus 2）', () => {
  const { calib, points } = makeTrack();
  const m = measureShot(calib, points.filter((p) => p.t <= 0.55));
  assert.equal(m.quality, 'unmeasured');
  assert.equal(m.reason, 'リングの高さまでとどかない');
  assert.equal(m.entryAngleDeg, null);
});

test('点が少ないと測れない', () => {
  const { calib, points } = makeTrack();
  const m = measureShot(calib, points.slice(-5));
  assert.equal(m.quality, 'unmeasured');
  assert.equal(m.reason, 'てんがすくない');
});

test('ずれが大きいと測れない', () => {
  const { calib, points } = makeTrack();
  const noisy = points.map((p, i) => {
    const s = i % 2 === 0 ? 1 : -1;
    return { ...p, x: p.x + s * calib.ballRpx * 0.9, y: p.y - s * calib.ballRpx * 0.9 };
  });
  const m = measureShot(calib, noisy);
  assert.equal(m.quality, 'unmeasured');
  assert.equal(m.reason, 'ずれがおおきい');
});

test('手前を通ると てまえ、奥を通ると おく', () => {
  const front = makeTrack({ vx: -2.8 });
  const mf = measureShot(front.calib, front.points);
  within(mf.depthCm, 2.5, 1.0, '手前'); assert.equal(mf.depthLabel, 'てまえ');
  const back = makeTrack({ vx: -3.15 });
  const mb = measureShot(back.calib, back.points);
  within(mb.depthCm, 37.5, 1.0, '奥'); assert.equal(mb.depthLabel, 'おく');
});

test('リングに当たってゆっくり上がる点も当てはめに使わない', () => {
  const { calib, points } = makeTrack({ vx: -2.7 });
  const last = points[points.length - 1];
  // 最後の点をリングの高さのわずか上にして、はね返りを1コマ3画素ずつ（ボール半径の半分より小さい）
  const pts = [...points.slice(0, -1), { ...last, y: last.y - 0.5 }];
  const after = [1, 2, 3, 4, 5, 6].map((k) => ({ t: last.t + k / 30, x: last.x + k * 5, y: last.y - 0.5 - k * 3 }));
  const m = measureShot(calib, [...pts, ...after]);
  assert.equal(m.quality, 'ok');
  within(m.entryAngleDeg, 56.0, 1.0, '入射角'); // atan(4.0/2.7)
});

test('リングに当たった後の点は当てはめに使わない', () => {
  const { calib, points } = makeTrack();
  // 通過後にリングではね返って上がる点を足す
  const last = points[points.length - 1];
  const after = [1, 2, 3, 4, 5].map((k) => ({ t: last.t + k / 30, x: last.x - k * 2, y: last.y - k * 6 }));
  assertStandard(measureShot(calib, [...points, ...after]));
});
