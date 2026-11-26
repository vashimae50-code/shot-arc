import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, needsExportWarning, CSV_HEADER } from '../js/csv.js';

const base = {
  id: 1, sessionId: 3, sessionNo: 2, idx: 5, at: '2026-11-26T03:04:05.000Z', player: 'とらお',
  outcome: 'make', outcomeEdited: false, quality: 'ok', entryAngleDeg: 45.26, releaseAngleDeg: 55.04, apexM: 0.876,
  depthCm: 21.4, depthLabel: 'まんなか', distanceM: 3.123, flightS: 1.004, nPoints: 30, clipId: 7, exported: false,
};

test('見出しの行', () => {
  assert.equal(CSV_HEADER, '日時,打った人,回,何本目,結果,結果を手で直した,入射角,リリース角,最高点m,通過位置cm,通過位置,距離m,飛んだ時間s,拾えたコマ,測定,動画');
});

test('BOMで始まり、1行目が見出し、日時は日本時間', () => {
  const csv = toCsv([base]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], CSV_HEADER);
  assert.equal(lines[1], '2026-11-26 12:04:05,とらお,2,5,はいった,,45.3,55.0,0.88,21,まんなか,3.12,1.00,30,ok,あり');
});

test('測れなかった1本は数値が空欄、手直しの印、動画なし', () => {
  const csv = toCsv([{ ...base, quality: 'unmeasured', entryAngleDeg: null, releaseAngleDeg: null, apexM: null, depthCm: null,
    depthLabel: null, distanceM: null, flightS: null, outcome: 'unknown', outcomeEdited: true, clipId: null }]);
  const line = csv.slice(1).split('\r\n')[1];
  assert.equal(line, '2026-11-26 12:04:05,とらお,2,5,ふめい,○,,,,,,,,30,はかれなかった,なし');
});

test('カンマや引用符を含む名前は囲む', () => {
  const line = toCsv([{ ...base, player: 'た,"ろう"' }]).slice(1).split('\r\n')[1];
  assert.ok(line.includes(',"た,""ろう""",'), line);
});

test('書き出し忘れの判定', () => {
  const now = new Date('2026-11-26T03:00:00.000Z');
  const fresh = { exported: false, at: '2026-11-25T03:00:00.000Z' };
  assert.equal(needsExportWarning([fresh], now), false);
  assert.equal(needsExportWarning(Array.from({ length: 100 }, () => fresh), now), true);
  assert.equal(needsExportWarning([{ exported: false, at: '2026-11-18T02:00:00.000Z' }], now), true);
  assert.equal(needsExportWarning([{ exported: true, at: '2026-11-01T00:00:00.000Z' }], now), false);
});
