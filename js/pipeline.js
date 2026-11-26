// 検出 → 1本の区切り → 測定 → 入った外れた をつなぐ。iPadのカメラでもPCの動画でも同じものを使う。
import { scaleCalib } from './geom.js';
import { detectBall } from './ballDetect.js';
import { ShotSegmenter } from './segmenter.js';
import { measureShot } from './trajectory.js';
import { judgeOutcome } from './outcome.js';

export class Pipeline {
  // calib は元画像（srcWidth 幅）の座標。srcWidth を省くと、処理画像の座標とみなす。
  constructor(calib, { procWidth = 320, srcWidth, roi } = {}) {
    this.procWidth = procWidth;
    this.calib = srcWidth ? scaleCalib(calib, procWidth / srcWidth) : calib;
    this.roi = roi ?? null;
    this.segmenter = new ShotSegmenter(this.calib);
    this.bg = null; // 背景（ゆっくり更新する平均の画面）
    this.bgAlpha = 0.1;
  }

  updateBackground(img) {
    const n = img.data.length;
    if (!this.bg || this.bg.length !== n) { this.bg = Float32Array.from(img.data); return; }
    const a = this.bgAlpha, bg = this.bg, d = img.data;
    for (let i = 0; i < n; i++) bg[i] += a * (d[i] - bg[i]);
  }

  // 撮影を終えたときなど、追っている線をすべて閉じて結果を返す
  flush(t) {
    return this.segmenter.push(t + 1, []).map((track) => this.result(track));
  }

  result(track) {
    const metrics = measureShot(this.calib, track.points);
    return { track, metrics, outcome: judgeOutcome(this.calib, track.points, metrics) };
  }

  processFrame(t, img) {
    const roi = this.roi ?? { x: 0, y: 0, w: img.width, h: img.height };
    const ref = this.bg ? { width: img.width, height: img.height, data: this.bg } : null;
    const dets = detectBall(img, ref, this.calib, roi);
    this.updateBackground(img);
    this.lastDets = dets;
    return this.segmenter.push(t, dets).map((track) => this.result(track));
  }
}
