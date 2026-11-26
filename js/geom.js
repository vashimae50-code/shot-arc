// 画素 ⇔ m の変換。リング中心が原点、y は上が正、x は打つ人のいる側が正。
export const RIM_INNER_M = 0.45;
export const BALL_DIAMETER_M = 0.22;
const NET_DEPTH_RIMS = 0.9; // ネットの下端はリングの高さからリング幅の0.9倍下とみなす

export function makeCalib({ rimX0, rimX1, rimY, shooterSide }) {
  const left = Math.min(rimX0, rimX1);
  const right = Math.max(rimX0, rimX1);
  const rimWpx = right - left;
  if (!(rimWpx > 0)) throw new Error('リングの左右の位置が同じです');
  const mPerPx = RIM_INNER_M / rimWpx;
  return {
    rimX0: left, rimX1: right, rimY, rimWpx, mPerPx,
    cx: (left + right) / 2,
    sign: shooterSide === 'left' ? -1 : 1,
    shooterSide: shooterSide === 'left' ? 'left' : 'right',
    netBottomY: rimY + NET_DEPTH_RIMS * rimWpx,
    ballRpx: (BALL_DIAMETER_M / 2) / mPerPx,
  };
}

export function scaleCalib(calib, k) {
  return makeCalib({
    rimX0: calib.rimX0 * k, rimX1: calib.rimX1 * k, rimY: calib.rimY * k, shooterSide: calib.shooterSide,
  });
}

export function toWorld(calib, p) {
  return { x: calib.sign * (p.x - calib.cx) * calib.mPerPx, y: -(p.y - calib.rimY) * calib.mPerPx };
}

export function toPixel(calib, w) {
  return { x: calib.cx + (calib.sign * w.x) / calib.mPerPx, y: calib.rimY - w.y / calib.mPerPx };
}
