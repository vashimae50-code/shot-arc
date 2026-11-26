// 画面に重ねる線（リングの枠・軌道）。points は処理画像の座標、k は表示倍率。
export function drawRim(ctx, calib, k = 1) {
  ctx.save();
  ctx.strokeStyle = '#00e676';
  ctx.lineWidth = 3;
  const h = Math.max(6, calib.rimWpx * 0.15) * k;
  ctx.strokeRect(calib.rimX0 * k, calib.rimY * k - h / 2, calib.rimWpx * k, h);
  ctx.restore();
}

export function drawTrack(ctx, points, k = 1, color = '#ffeb3b') {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)));
  ctx.stroke();
  ctx.restore();
}

export const OUTCOME_LABEL = { make: 'はいった', miss: 'はずれ', unknown: 'ふめい' };

export function fmt(v, digits = 1) {
  return v == null || Number.isNaN(v) ? '' : Number(v).toFixed(digits);
}
