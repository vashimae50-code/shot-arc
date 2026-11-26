import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProbe } from '../js/probeSummary.js';

const good = {
  fps720: 29.6, fps1080: 29.4, mime: 'video/mp4',
  concurrentRecorders: 3, persist: true, idbBlobOk: true, jaVoice: true,
};

test('十分な性能なら ok', () => {
  const s = summarizeProbe(good);
  assert.equal(s.verdict, 'ok');
  assert.deepEqual(s.reasons, []);
});

test('720pのコマ数が24未満なら ng', () => {
  const s = summarizeProbe({ ...good, fps720: 14 });
  assert.equal(s.verdict, 'ng');
  assert.ok(s.reasons.includes('コマ数が少ない'));
});

test('同時録画が1本だけなら ok だが印が付く', () => {
  const s = summarizeProbe({ ...good, concurrentRecorders: 1 });
  assert.equal(s.verdict, 'ok');
  assert.ok(s.reasons.includes('録画は1本ずつ'));
});

test('録画できる形式が無ければ ng', () => {
  const s = summarizeProbe({ ...good, mime: null });
  assert.equal(s.verdict, 'ng');
});

test('IndexedDBにBlobを保存できなければ ng', () => {
  const s = summarizeProbe({ ...good, idbBlobOk: false });
  assert.equal(s.verdict, 'ng');
});
