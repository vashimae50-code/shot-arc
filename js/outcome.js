// 入った／外れた／不明を、軌道の点から判定する。
import { toWorld } from './geom.js';

const HALF_RIM_M = 0.225;
const INSIDE_MARGIN_BALLS = 0.5; // 中心がリングの縁からボール半径の半分より内側なら「内側」
const WATCH_S = 0.5; // 通過後この秒数のあいだを見る
const ABOVE_TOL_BALLS = 0.5; // リングよりこれ以上上に出たら「戻った」

export function judgeOutcome(calib, points, _metrics) {
  const w = points.map((p) => ({ t: p.t, ...toWorld(calib, p) }));
  if (w.length < 2) return 'unknown';
  const ballR = calib.ballRpx * calib.mPerPx;

  let apex = 0;
  for (let i = 1; i < w.length; i++) if (w[i].y > w[apex].y) apex = i;
  let k = -1;
  for (let i = Math.max(apex, 1); i < w.length; i++) if (w[i].y <= 0 && w[i - 1].y > 0) { k = i; break; }
  if (k < 0) return 'unknown';

  // リングの高さでの x（前後の点で直線補間）
  const a = w[k - 1], b = w[k];
  const r = a.y / (a.y - b.y);
  const xCross = a.x + (b.x - a.x) * r;
  const tCross = a.t + (b.t - a.t) * r;
  const inside = Math.abs(xCross) < HALF_RIM_M - INSIDE_MARGIN_BALLS * ballR;

  const netBottomM = -(calib.netBottomY - calib.rimY) * calib.mPerPx;
  let reachedNet = false;
  let wentAbove = false;
  for (let i = k; i < w.length && w[i].t <= tCross + WATCH_S; i++) {
    if (w[i].y > ABOVE_TOL_BALLS * ballR) wentAbove = true;
    if (w[i].y <= netBottomM) reachedNet = true;
  }
  if (!inside || wentAbove) return 'miss';
  return reachedNet ? 'make' : 'unknown';
}
