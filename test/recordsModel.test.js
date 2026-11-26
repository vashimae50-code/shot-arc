import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRecords, exportFileName, rangeFromDates, nextOutcome } from '../js/recordsModel.js';

test('日本時間の日付ごと・回ごとにまとめ、新しい順に並べる', () => {
  const sessions = [
    { id: 1, player: 'とらお', no: 1, startedAt: '2026-11-25T14:30:00.000Z' }, // 日本時間 11/25 23:30
    { id: 2, player: 'わかな', no: 1, startedAt: '2026-11-25T15:30:00.000Z' }, // 日本時間 11/26 00:30
  ];
  const shots = [
    { id: 10, sessionId: 1, idx: 1 }, { id: 11, sessionId: 1, idx: 2 }, { id: 12, sessionId: 2, idx: 1 },
  ];
  const g = groupRecords(sessions, shots);
  assert.deepEqual(g.map((d) => d.date), ['2026-11-26', '2026-11-25']);
  assert.equal(g[1].sessions[0].shots.length, 2);
  assert.equal(g[0].sessions[0].session.player, 'わかな');
});

test('1本もない回は一覧に出さない', () => {
  const g = groupRecords([{ id: 1, startedAt: '2026-11-26T01:00:00.000Z' }], []);
  assert.equal(g.length, 0);
});

test('書き出すファイル名は日本時間の日付', () => {
  assert.equal(exportFileName(new Date('2026-11-25T16:00:00.000Z')), 'shot-arc_20261126.csv');
});

test('日付の入力（日本時間）を期間にする。空なら全期間', () => {
  assert.deepEqual(rangeFromDates('2026-11-20', '2026-11-26'), { from: '2026-11-19T15:00:00.000Z', to: '2026-11-26T15:00:00.000Z' });
  assert.deepEqual(rangeFromDates('', ''), {});
});

test('結果をタップすると はいった ⇔ はずれ、ふめい は はいった', () => {
  assert.equal(nextOutcome('make'), 'miss');
  assert.equal(nextOutcome('miss'), 'make');
  assert.equal(nextOutcome('unknown'), 'make');
});
