import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechText, clipWindow, summarizeSession, toShotRecord, recorderPlan } from '../js/session.js';

const okM = { quality: 'ok', entryAngleDeg: 43.4, releaseAngleDeg: 55, apexM: 0.9, depthCm: 10, depthLabel: 'てまえ', distanceM: 3, flightS: 1, nPoints: 30, crossT: 11.0 };
const badM = { quality: 'unmeasured', reason: 'ずれがおおきい', entryAngleDeg: null, depthLabel: null, nPoints: 12, crossT: null };

test('読み上げ：入射角の整数と通過位置', () => {
  assert.equal(speechText(okM), 'よんじゅうさんど、てまえ');
  assert.equal(speechText({ ...okM, entryAngleDeg: 51.6, depthLabel: 'おく' }), 'ごじゅうにど、おく');
  assert.equal(speechText({ ...okM, entryAngleDeg: 40.2, depthLabel: 'まんなか' }), 'よんじゅうど、まんなか');
  assert.equal(speechText(badM), 'はかれなかった');
});

test('動画の範囲：放す3秒前〜リング通過の1.5秒後', () => {
  const track = { points: [{ t: 10.0 }], startT: 10.0, endT: 11.4 };
  assert.deepEqual(clipWindow(track, okM), { tStart: 7.0, tEnd: 12.5 });
  // 測れなかったら最後の点から1.5秒後
  const w = clipWindow(track, badM);
  assert.equal(w.tStart, 7.0); assert.ok(Math.abs(w.tEnd - 12.9) < 1e-9);
});

test('その回のまとめ：平均は測れた分だけ', () => {
  const shots = [
    { outcome: 'make', quality: 'ok', entryAngleDeg: 40, depthLabel: 'てまえ' },
    { outcome: 'miss', quality: 'ok', entryAngleDeg: 50, depthLabel: 'おく' },
    { outcome: 'make', quality: 'ok', entryAngleDeg: 45, depthLabel: 'まんなか' },
    { outcome: 'unknown', quality: 'unmeasured', entryAngleDeg: null, depthLabel: null },
  ];
  const s = summarizeSession(shots);
  assert.equal(s.count, 4); assert.equal(s.makes, 2); assert.equal(s.measured, 3);
  assert.equal(s.avgEntry, 45); assert.equal(s.minEntry, 40); assert.equal(s.maxEntry, 50);
  assert.deepEqual(s.depth, { てまえ: 1, まんなか: 1, おく: 1 });
  assert.equal(summarizeSession([]).avgEntry, null);
});

test('保存する1本の形', () => {
  const r = toShotRecord({ track: { points: [{ t: 1, x: 2, y: 3 }], startT: 1, endT: 2 }, metrics: okM, outcome: 'make' },
    { sessionId: 4, sessionNo: 2, idx: 7, player: 'とらお', at: new Date('2026-11-26T03:00:00Z'), procWidth: 320 });
  assert.equal(r.sessionId, 4); assert.equal(r.sessionNo, 2); assert.equal(r.idx, 7); assert.equal(r.player, 'とらお');
  assert.equal(r.at, '2026-11-26T03:00:00.000Z'); assert.equal(r.outcome, 'make'); assert.equal(r.quality, 'ok');
  assert.equal(r.entryAngleDeg, 43.4); assert.equal(r.depthLabel, 'てまえ'); assert.equal(r.nPoints, 30);
  assert.deepEqual(r.track, [{ t: 1, x: 2, y: 3 }]); assert.equal(r.procWidth, 320);
});

test('同時に回せる録画の本数から、区切り方を決める', () => {
  assert.deepEqual(recorderPlan(3), { stepS: 3, lenS: 9 });
  assert.deepEqual(recorderPlan(5), { stepS: 3, lenS: 9 });
  assert.deepEqual(recorderPlan(2), { stepS: 6, lenS: 12 });
  assert.deepEqual(recorderPlan(1), { stepS: 10, lenS: 10 });
  assert.deepEqual(recorderPlan(undefined), { stepS: 3, lenS: 9 });
});
