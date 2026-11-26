// コマごとのボール候補をつないで、1本ずつのシュートの軌道に切り出す。
// 同時にいくつかの線を追う（シュートのボールと、横切る人のボールを分けるため）。

const LOST_S = 0.4;
const MIN_POINTS = 6;
const MAX_TRACKS = 6;
const JUMP_RIMS = 1.2; // 1コマで動いてよい距離（リング幅の何倍）
const TRIM_TOL_BALLS = 0.25; // 打つ前のドリブルを外すときの許容
const GAP_S = 0.12; // 頂点より前でこれ以上点が途切れたら、そこまでは手に持っていた間とみなす

export class ShotSegmenter {
  constructor(calib) {
    this.calib = calib;
    this.maxJump = JUMP_RIMS * calib.rimWpx;
    this.aboveY = calib.rimY - calib.rimWpx;
    this.bottomY = calib.netBottomY + 0.5 * calib.rimWpx;
    this.tracks = [];
  }

  push(t, dets) {
    const closed = [];
    // 見失って時間がたった線を閉じる
    this.tracks = this.tracks.filter((tr) => {
      if (t - tr.points[tr.points.length - 1].t > LOST_S) { closed.push(tr); return false; }
      return true;
    });

    // 予想位置に近い順に、線と候補を1対1で結ぶ
    const pairs = [];
    this.tracks.forEach((tr, ti) => {
      const pts = tr.points;
      const last = pts[pts.length - 1];
      const frames = Math.max(1, (t - last.t) * 30);
      let px = last.x, py = last.y;
      if (pts.length >= 2) {
        const prev = pts[pts.length - 2];
        const k = (t - last.t) / Math.max(1e-6, last.t - prev.t);
        px += (last.x - prev.x) * k; py += (last.y - prev.y) * k;
      }
      dets.forEach((d, di) => {
        const dist = Math.min(Math.hypot(d.x - px, d.y - py), Math.hypot(d.x - last.x, d.y - last.y));
        if (dist <= this.maxJump * frames) pairs.push({ ti, di, dist });
      });
    });
    pairs.sort((a, b) => a.dist - b.dist);
    const usedT = new Set(), usedD = new Set();
    for (const p of pairs) {
      if (usedT.has(p.ti) || usedD.has(p.di)) continue;
      usedT.add(p.ti); usedD.add(p.di);
      this.tracks[p.ti].points.push({ t, x: dets[p.di].x, y: dets[p.di].y });
    }
    dets.forEach((d, di) => {
      if (!usedD.has(di) && this.tracks.length < MAX_TRACKS) this.tracks.push({ points: [{ t, x: d.x, y: d.y }] });
    });

    // 一度リングより上に出た後、ネットの下より下まで落ちた線は、その場で閉じる
    // （打つ瞬間はネットより低い位置にあるので、上に出る前は閉じない）
    this.tracks = this.tracks.filter((tr) => {
      const last = tr.points[tr.points.length - 1];
      if (last.y < this.aboveY) tr.wasAbove = true;
      if (tr.wasAbove && last.y > this.bottomY) { closed.push(tr); return false; }
      return true;
    });

    return closed.map((tr) => this.finish(tr)).filter(Boolean);
  }

  // 1本として認めるかを決め、打つ前の動き（ドリブル）を頭から外す
  finish(tr) {
    const pts = tr.points;
    if (pts.length < MIN_POINTS) return null;
    let apex = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].y < pts[apex].y) apex = i;
    if (pts[apex].y >= this.aboveY) return null;
    const tol = TRIM_TOL_BALLS * this.calib.ballRpx;
    let start = 0;
    for (let i = apex; i >= 1; i--) {
      if (pts[i - 1].y < pts[i].y - tol || pts[i].t - pts[i - 1].t > GAP_S) { start = i; break; }
    }
    const points = pts.slice(start);
    if (points.length < MIN_POINTS) return null;
    return { points, startT: points[0].t, endT: points[points.length - 1].t };
  }
}
