// 1コマの画像からボールの候補とリングを探す（重いAIは使わず、色と動きで）。
// 画像は ImageData と同じ形 {width, height, data:RGBA}。

export const BALL_COLOR = { hMin: 6, hMax: 32, sMin: 0.51, vMin: 0.43 };
export const RIM_COLOR = { hMax: 35, hWrapMin: 340, sMin: 0.4, vMin: 0.3 };
export const MOTION_DIFF = 25; // 背景との明るさの差
export const DARK_V = 0.35; // 逆光で暗く写るボール（空を背にしたとき）
export const AREA_RANGE = [0.3, 3.0]; // 期待面積の何倍まで

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max / 255];
}

const isOrange = (h, s, v, c = BALL_COLOR) => h >= c.hMin && h <= c.hMax && s >= c.sMin && v >= c.vMin;
const isRimColor = (h, s, v, c = RIM_COLOR) => (h <= c.hMax || h >= c.hWrapMin) && s >= c.sMin && v >= c.vMin;
const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// mask の中のつながった塊を調べる（4近傍）。moved があれば動いた画素も数える。
function components(mask, w, h, moved) {
  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0, sx = 0, sy = 0, nMoved = 0, mx = 0, my = 0, minX = w, maxX = -1, minY = h, maxY = -1;
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (moved && moved[p]) { nMoved++; mx += x; my += y; }
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
    out.push({ area, cx: sx / area, cy: sy / area, nMoved, mx, my, minX, maxX, minY, maxY });
  }
  return out;
}

// ref は背景（ボールのいない画面）。背景と違い、ボールらしい色（オレンジ、または逆光で暗い）の画素の塊を拾う。
// ref が無いとき（最初のコマ）はオレンジだけを見る。
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) tmp[y * w + k] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tmp[y * w + x]) continue;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) out[k * w + x] = 1;
  }
  return out;
}

export function detectBall(cur, ref, calib, roi) {
  const x0 = Math.max(0, Math.floor(roi.x)), y0 = Math.max(0, Math.floor(roi.y));
  const x1 = Math.min(cur.width, Math.ceil(roi.x + roi.w)), y1 = Math.min(cur.height, Math.ceil(roi.y + roi.h));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return [];
  const mask = new Uint8Array(w * h);
  const d = cur.data, rd = ref ? ref.data : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + y0) * cur.width + (x + x0)) * 4;
      const [hh, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
      if (rd) {
        if (Math.abs(luma(d, i) - luma(rd, i)) < MOTION_DIFF) continue;
        if (!isOrange(hh, s, v) && v > DARK_V) continue;
      } else if (!isOrange(hh, s, v)) continue;
      mask[y * w + x] = 1;
    }
  }
  // 細い柱・ネットでボールが切れても1つの塊になるように、少し太らせてから塊を分け、
  // 面積と中心は元の画素で数える
  const R = Math.max(1, Math.round(calib.ballRpx * 0.25));
  const grown = dilate(mask, w, h, R);
  const comps = components(grown, w, h, mask);
  const expected = Math.PI * calib.ballRpx * calib.ballRpx;
  const res = [];
  for (const c0 of comps) {
    if (!c0.nMoved) continue;
    const c = { ...c0, area: c0.nMoved, cx: c0.mx / c0.nMoved, cy: c0.my / c0.nMoved };
    if (c.area < AREA_RANGE[0] * expected || c.area > AREA_RANGE[1] * expected) continue;
    // 細長い塊（腕・電線のゆれなど）はボールではない
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (Math.max(bw, bh) > 2.5 * Math.min(bw, bh)) continue;
    res.push({ x: c.cx + x0, y: c.cy + y0, area: c.area, score: 1 });
  }
  return res;
}

export function detectRim(img) {
  const { width: w, height: h, data: d } = img;
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const [hh, s, v] = hsv(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
    if (isRimColor(hh, s, v)) mask[p] = 1;
  }
  let best = null;
  for (const c of components(mask, w, h, null)) {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (bw < 8 || bw / bh < 4 || c.cy >= h / 2) continue;
    if (!best || bw > best.maxX - best.minX + 1) best = c;
  }
  return best ? { rimX0: best.minX, rimX1: best.maxX + 1, rimY: best.cy } : null;
}
