// 1本ごとの動画：録画を stepS 秒ずらしで何本か同時に回し、1本の範囲を丸ごと含む録画を選ぶ。
// 作り直し（切り出しの再エンコード）はせず、録画と頭出し位置（offsetS）を保存する。

export function planSegments(nowS, { stepS = 3, lenS = 9 } = {}) {
  const out = [];
  for (let s = 0; s <= nowS + 1e-9; s += stepS) out.push({ startS: s, endS: s + lenS });
  return out;
}

export function chooseSegment(segments, tStart, tEnd) {
  let best = null;
  for (const s of segments) {
    if (s.startS <= tStart && s.endS >= tEnd && (!best || s.startS > best.startS)) best = s;
  }
  return best ? { startS: best.startS, endS: best.endS } : null;
}

const KEEP_FINISHED = 3;

export class ClipRecorder {
  // stream：canvas.captureStream(30) など。now：秒の時計（解析の時刻と同じもの）
  constructor({
    stream, mime, stepS = 3, lenS = 9, now = () => performance.now() / 1000,
    Recorder = globalThis.MediaRecorder, schedule = (f, ms) => setTimeout(f, ms), cancel = (id) => clearTimeout(id),
  }) {
    Object.assign(this, { stream, mime, stepS, lenS, now, Recorder, schedule, cancel });
    this.segments = [];
    this.timers = new Set();
    this.running = false;
  }

  start() {
    this.running = true;
    this.tick();
  }

  later(fn, ms) {
    const id = this.schedule(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
  }

  tick() {
    if (!this.running) return;
    const startS = this.now();
    const seg = { startS, endS: startS + this.lenS, chunks: [], blob: null };
    seg.done = new Promise((resolve) => { seg.resolve = resolve; });
    try {
      const rec = new this.Recorder(this.stream, { mimeType: this.mime });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) seg.chunks.push(e.data); };
      rec.onstop = () => this.finish(seg);
      rec.start();
      seg.rec = rec;
      this.segments.push(seg);
      this.later(() => { try { rec.stop(); } catch (_) { this.finish(seg); } }, this.lenS * 1000);
    } catch (_) {
      // 同時に回せる本数をこえたときなど：この区切りは飛ばす
    }
    this.later(() => this.tick(), this.stepS * 1000);
  }

  finish(seg) {
    if (seg.blob) return;
    seg.blob = new Blob(seg.chunks, { type: this.mime });
    seg.chunks = [];
    seg.endS = Math.min(seg.endS, this.now());
    seg.resolve();
    const finished = this.segments.filter((s) => s.blob);
    const drop = finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED));
    this.segments = this.segments.filter((s) => !drop.includes(s));
  }

  async clipFor(tStart, tEnd) {
    const pick = chooseSegment(this.segments, tStart, tEnd);
    if (!pick) return null;
    const seg = this.segments.find((s) => s.startS === pick.startS);
    await seg.done;
    if (!seg.blob || !seg.blob.size) return null;
    return { blob: seg.blob, mime: this.mime, offsetS: tStart - seg.startS, durationS: tEnd - tStart };
  }

  stop() {
    this.running = false;
    for (const id of this.timers) this.cancel(id);
    this.timers.clear();
    for (const s of this.segments) if (!s.blob && s.rec) { try { s.rec.stop(); } catch (_) { this.finish(s); } }
  }
}

// このブラウザで録画できる形式（mp4 を優先）
export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) { /* 次を試す */ }
  }
  return null;
}
