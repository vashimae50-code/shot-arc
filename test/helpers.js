// テスト用の軌道と画像を作る道具。
import { makeCalib, toPixel } from '../js/geom.js';

export const BASE_CALIB = { rimX0: 555, rimX1: 645, rimY: 300, shooterSide: 'right' };

// 物理の軌道（m）を画素の点にする。t は t0 から fps 刻み。
export function makeTrack({
  x0 = 3.0, y0 = -0.9, vx = -3.0, vy = 5.8, g = 9.8, ax = 0, fps = 30, t0 = 0, t1 = 1.0, side = 'right', calib,
} = {}) {
  const c = calib ?? makeCalib({ ...BASE_CALIB, shooterSide: side });
  const pts = [];
  const n = Math.round((t1 - t0) * fps);
  for (let i = 0; i <= n; i++) {
    const dt = i / fps;
    const w = { x: x0 + vx * dt + 0.5 * ax * dt * dt, y: y0 + vy * dt - 0.5 * g * dt * dt };
    const p = toPixel(c, w);
    pts.push({ t: t0 + dt, x: p.x, y: p.y });
  }
  return { calib: c, points: pts };
}

// 背景色で塗った ImageData 風の画像
export function blankImage(w, h, [r, g, b] = [135, 190, 235]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
}

export function fillCircle(img, cx, cy, rad, [r, g, b] = [230, 110, 40]) {
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) {
        const i = (y * img.width + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      }
    }
  }
  return img;
}

export function fillRect(img, x0, y0, w, h, [r, g, b] = [230, 110, 40]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * img.width + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
  }
  return img;
}
