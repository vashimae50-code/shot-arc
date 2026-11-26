// 1本の軌道（画素の点）に放物線を当てはめ、入射角などを出す。
import { toWorld } from './geom.js';

const MIN_POINTS = 8;
const MAX_RESIDUAL_BALLS = 0.6; // 当てはめのずれの許容（ボール半径の何倍まで）
const REACH_SLACK_S = 0.07; // 最後の点からリングの高さまで、この秒数以内なら「とどいた」とみなす
const RISE_TOL_BALLS = 0.5; // 頂点の後で1コマにこれ以上上がったら、リングに当たったとみなす
const STEP_TOL_BALLS = 0.1; // 頂点から下がった後は、これだけ上がっても当たったとみなす
const BELOW_APEX_BALLS = 1.0; // 「頂点から十分に下がった」の目安
const HALF_RIM_M = 0.225;

function unmeasured(reason, nPoints) {
  return {
    quality: 'unmeasured', reason, entryAngleDeg: null, releaseAngleDeg: null, apexM: null,
    depthCm: null, depthLabel: null, distanceM: null, flightS: null, nPoints, crossT: null, fit: null,
  };
}

// 頂点の後、リングの高さを下に横切った点まで（当たってはね上がった点は入れない）
function selectFlight(world, riseTol) {
  let apex = 0;
  for (let i = 1; i < world.length; i++) if (world[i].y > world[apex].y) apex = i;
  for (let k = apex + 1; k < world.length; k++) {
    if (world[k].y <= 0) return world.slice(0, k + 1);
    // 頂点から十分に下がった後で上向きに変わったら、リングかボードに当たった
    const wellBelowApex = world[k - 1].y < world[apex].y - riseTol.belowApex;
    if (wellBelowApex && world[k].y > world[k - 1].y + riseTol.step) return world.slice(0, k);
    if (world[k].y > world[k - 1].y + riseTol.big) return world.slice(0, k);
  }
  return world;
}

function solve3(m, v) {
  // 3x3 の連立方程式（ガウスの消去法）
  const a = m.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    if (Math.abs(a[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

function fitMotion(pts) {
  const t0 = pts[0].t;
  let n = 0, st = 0, st2 = 0, st3 = 0, st4 = 0, sx = 0, sxt = 0, sy = 0, syt = 0, syt2 = 0;
  for (const p of pts) {
    const t = p.t - t0;
    n++; st += t; st2 += t * t; st3 += t ** 3; st4 += t ** 4;
    sx += p.x; sxt += p.x * t; sy += p.y; syt += p.y * t; syt2 += p.y * t * t;
  }
  const den = n * st2 - st * st;
  if (Math.abs(den) < 1e-12) return null;
  const vx = (n * sxt - st * sx) / den;
  const x0 = (sx - vx * st) / n;
  const q = solve3([[n, st, st2], [st, st2, st3], [st2, st3, st4]], [sy, syt, syt2]);
  if (!q) return null;
  const [y0, vy, ay] = q;
  return { t0, x0, vx, y0, vy, ay };
}

export function measureShot(calib, points) {
  const world = points.map((p) => ({ t: p.t, ...toWorld(calib, p) }));
  const ballR = calib.ballRpx * calib.mPerPx;
  const used = selectFlight(world, {
    big: RISE_TOL_BALLS * ballR, step: STEP_TOL_BALLS * ballR, belowApex: BELOW_APEX_BALLS * ballR,
  });
  const nPoints = used.length;
  if (nPoints < MIN_POINTS) return unmeasured('てんがすくない', nPoints);

  const f = fitMotion(used);
  if (!f) return unmeasured('てんがすくない', nPoints);
  const X = (t) => f.x0 + f.vx * (t - f.t0);
  const Y = (t) => f.y0 + f.vy * (t - f.t0) + f.ay * (t - f.t0) ** 2;

  let ss = 0;
  for (const p of used) ss += (p.x - X(p.t)) ** 2 + (p.y - Y(p.t)) ** 2;
  const rmsPx = Math.sqrt(ss / nPoints) / calib.mPerPx;
  if (rmsPx > MAX_RESIDUAL_BALLS * calib.ballRpx) return unmeasured('ずれがおおきい', nPoints);

  // y(t) = 0 の大きい方の解
  const disc = f.vy * f.vy - 4 * f.ay * f.y0;
  if (!(f.ay < 0) || disc < 0) return unmeasured('リングの高さまでとどかない', nPoints);
  const dt = (-f.vy - Math.sqrt(disc)) / (2 * f.ay);
  const crossT = f.t0 + dt;
  const tLast = used[used.length - 1].t;
  if (dt <= 0 || crossT > tLast + REACH_SLACK_S) return unmeasured('リングの高さまでとどかない', nPoints);

  const speedX = Math.abs(f.vx);
  const vyAt = (t) => f.vy + 2 * f.ay * (t - f.t0);
  const deg = (r) => (r * 180) / Math.PI;
  const tApex = f.t0 - f.vy / (2 * f.ay);
  const apexM = tApex > f.t0 && tApex < crossT ? Y(tApex) : Math.max(Y(f.t0), 0);
  const depthCm = (HALF_RIM_M - X(crossT)) * 100;

  return {
    quality: 'ok',
    entryAngleDeg: deg(Math.atan2(Math.abs(vyAt(crossT)), speedX)),
    releaseAngleDeg: deg(Math.atan2(vyAt(f.t0), speedX)),
    apexM,
    depthCm,
    depthLabel: depthCm < 15 ? 'てまえ' : depthCm <= 30 ? 'まんなか' : 'おく',
    distanceM: X(f.t0),
    flightS: crossT - f.t0,
    nPoints,
    crossT,
    fit: { x0: f.x0, vx: f.vx, y0: f.y0, vy: f.vy, ay: f.ay },
  };
}
