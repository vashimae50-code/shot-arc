// 撮影中の画面で使う、画面に依存しない小さな決まりごと。

const DIGITS = ['ぜろ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];

// 0〜99 の整数をひらがなの読みにする（読み上げを確実にするため）
export function readNumber(n) {
  const v = Math.max(0, Math.min(99, Math.round(n)));
  if (v < 10) return DIGITS[v];
  const tens = Math.floor(v / 10), ones = v % 10;
  return `${tens === 1 ? '' : DIGITS[tens]}じゅう${ones ? DIGITS[ones] : ''}`;
}

export function speechText(m) {
  if (!m || m.quality !== 'ok') return 'はかれなかった';
  return `${readNumber(m.entryAngleDeg)}ど、${m.depthLabel}`;
}

export const CLIP_BEFORE_S = 3;
export const CLIP_AFTER_S = 1.5;

export function clipWindow(track, metrics) {
  const tStart = track.points[0].t - CLIP_BEFORE_S;
  const ref = metrics && metrics.quality === 'ok' && metrics.crossT != null ? metrics.crossT : track.endT;
  return { tStart, tEnd: ref + CLIP_AFTER_S };
}

export function summarizeSession(shots) {
  const ok = shots.filter((s) => s.quality === 'ok' && s.entryAngleDeg != null);
  const ang = ok.map((s) => s.entryAngleDeg);
  const depth = { てまえ: 0, まんなか: 0, おく: 0 };
  for (const s of ok) if (s.depthLabel in depth) depth[s.depthLabel]++;
  return {
    count: shots.length,
    makes: shots.filter((s) => s.outcome === 'make').length,
    measured: ok.length,
    avgEntry: ang.length ? ang.reduce((a, b) => a + b, 0) / ang.length : null,
    minEntry: ang.length ? Math.min(...ang) : null,
    maxEntry: ang.length ? Math.max(...ang) : null,
    depth,
  };
}

const METRIC_KEYS = ['quality', 'reason', 'entryAngleDeg', 'releaseAngleDeg', 'apexM', 'depthCm', 'depthLabel', 'distanceM', 'flightS', 'nPoints', 'crossT'];

export function toShotRecord(result, { sessionId, sessionNo, idx, player, at, procWidth }) {
  const rec = { sessionId, sessionNo, idx, player, at: at.toISOString(), outcome: result.outcome, procWidth };
  for (const k of METRIC_KEYS) rec[k] = result.metrics[k] ?? null;
  rec.track = result.track.points.map((p) => ({ t: p.t, x: p.x, y: p.y }));
  return rec;
}

// 同時に回せる録画の本数から、録画の区切り方を決める（1本の動画は最大約6秒）
export function recorderPlan(concurrent) {
  if (concurrent === 2) return { stepS: 6, lenS: 12 };
  if (concurrent === 1) return { stepS: 10, lenS: 10 };
  return { stepS: 3, lenS: 9 };
}
