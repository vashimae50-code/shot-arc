import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openStore } from '../js/store.js';

const shot = (o = {}) => ({
  idx: 1, at: '2026-11-26T03:00:00.000Z', player: 'とらお', outcome: 'make', quality: 'ok',
  entryAngleDeg: 45.2, releaseAngleDeg: 55.1, apexM: 0.9, depthCm: 20, depthLabel: 'まんなか',
  distanceM: 3.1, flightS: 1.0, nPoints: 30, track: [{ t: 0, x: 1, y: 2 }], ...o,
});
const clip = () => new Blob([new Uint8Array(1000)], { type: 'video/mp4' });
const meta = { mime: 'video/mp4', offsetS: 1.2, durationS: 9 };

test('回を作り、1本を動画つきで保存して読み戻す', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: { rimX0: 1 } });
  const r = await st.saveShot(shot({ sessionId: sid }), clip(), meta);
  assert.equal(r.clipSaved, true);
  const shots = await st.listShots({ sessionId: sid });
  assert.equal(shots.length, 1);
  assert.equal(shots[0].exported, false);
  assert.equal(shots[0].outcomeEdited, false);
  const c = await st.getClip(r.shotId);
  assert.equal(c.offsetS, 1.2);
  assert.equal(c.blob.size, 1000);
  const sessions = await st.listSessions();
  assert.equal(sessions.length, 1);
});

test('数字を先に保存し、動画は後から付ける', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  const { shotId } = await st.saveShot(shot({ sessionId: sid }), null, null);
  assert.equal(await st.getClip(shotId), null);
  assert.equal(await st.attachClip(shotId, clip(), meta), true);
  const c = await st.getClip(shotId);
  assert.equal(c.offsetS, 1.2);
});

test('動画を消しても数字は残る', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  const { shotId } = await st.saveShot(shot({ sessionId: sid }), clip(), meta);
  await st.deleteClip(shotId);
  assert.equal(await st.getClip(shotId), null);
  const [s] = await st.listShots({ sessionId: sid });
  assert.equal(s.entryAngleDeg, 45.2);
  assert.equal(s.clipId, null);
});

test('書き出し済みの動画だけをまとめて消す', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  const a = await st.saveShot(shot({ sessionId: sid, idx: 1 }), clip(), meta);
  const b = await st.saveShot(shot({ sessionId: sid, idx: 2 }), clip(), meta);
  await st.markExported([a.shotId]);
  await st.deleteExportedClips();
  assert.equal(await st.getClip(a.shotId), null);
  assert.ok(await st.getClip(b.shotId));
});

test('回の動画をまとめて消す', async () => {
  const st = await openStore(new IDBFactory());
  const s1 = await st.addSession({ player: 'とらお', calib: {} });
  const s2 = await st.addSession({ player: 'わかな', calib: {} });
  const a = await st.saveShot(shot({ sessionId: s1 }), clip(), meta);
  const b = await st.saveShot(shot({ sessionId: s2 }), clip(), meta);
  await st.deleteSessionClips(s1);
  assert.equal(await st.getClip(a.shotId), null);
  assert.ok(await st.getClip(b.shotId));
});

test('容量いっぱいで動画が保存できなくても、数字は保存される（Review Focus 5）', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  const orig = IDBObjectStore.prototype.put;
  const origAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'clips') throw new DOMException('full', 'QuotaExceededError');
    return orig.apply(this, args);
  };
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'clips') throw new DOMException('full', 'QuotaExceededError');
    return origAdd.apply(this, args);
  };
  try {
    const r = await st.saveShot(shot({ sessionId: sid }), clip(), meta);
    assert.equal(r.clipSaved, false);
    const [s] = await st.listShots({ sessionId: sid });
    assert.equal(s.entryAngleDeg, 45.2);
    assert.equal(s.clipId, null);
  } finally {
    IDBObjectStore.prototype.put = orig;
    IDBObjectStore.prototype.add = origAdd;
  }
});

test('結果を手で直すと印が付く', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  const { shotId } = await st.saveShot(shot({ sessionId: sid }), null, null);
  await st.updateOutcome(shotId, 'miss');
  const [s] = await st.listShots({ sessionId: sid });
  assert.equal(s.outcome, 'miss');
  assert.equal(s.outcomeEdited, true);
});

test('期間でしぼって一覧にする', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  await st.saveShot(shot({ sessionId: sid, at: '2026-11-20T03:00:00.000Z' }), null, null);
  await st.saveShot(shot({ sessionId: sid, at: '2026-11-26T03:00:00.000Z' }), null, null);
  const r = await st.listShots({ from: '2026-11-25T00:00:00.000Z' });
  assert.equal(r.length, 1);
});

test('回を終えると終わった時刻が入る', async () => {
  const st = await openStore(new IDBFactory());
  const sid = await st.addSession({ player: 'とらお', calib: {} });
  await st.endSession(sid);
  const [s] = await st.listSessions();
  assert.ok(s.endedAt);
});
