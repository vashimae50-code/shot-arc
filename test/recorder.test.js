import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSegments, chooseSegment, ClipRecorder } from '../js/recorder.js';

const opt = { stepS: 3, lenS: 9 };

test('区切りは stepS ごとに始まり lenS 続く', () => {
  const s = planSegments(20, opt);
  assert.deepEqual(s.map((x) => x.startS), [0, 3, 6, 9, 12, 15, 18]);
  assert.equal(s[3].endS, 18);
});

test('1本の範囲を含む区切りのうち、一番遅く始まったものを選ぶ', () => {
  const seg = chooseSegment(planSegments(20, opt), 10.2, 15.0);
  assert.deepEqual(seg, { startS: 9, endS: 18 });
  assert.ok(Math.abs(10.2 - seg.startS - 1.2) < 1e-9);
});

test('範囲が長すぎて入る区切りが無ければ null', () => {
  assert.equal(chooseSegment(planSegments(20, opt), 8.9, 15.4), null);
});

test('区切りが無い時刻なら null', () => {
  assert.equal(chooseSegment(planSegments(20, opt), -1, 2), null);
});

// 偽の録画と時計で ClipRecorder の動きを確かめる
function fakeEnv() {
  let clock = 0;
  const timers = [];
  class FakeRec {
    constructor(stream, o) { this.mimeType = o.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; this.started = clock; }
    stop() {
      if (this.state !== 'recording') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([`rec@${this.started}`]) });
      this.onstop?.();
    }
  }
  return {
    now: () => clock,
    Recorder: FakeRec,
    schedule: (fn, ms) => { timers.push({ at: clock + ms / 1000, fn }); return timers.length; },
    cancel: (id) => { if (timers[id - 1]) timers[id - 1].fn = () => {}; },
    advance(to) {
      for (;;) {
        const next = timers.filter((x) => !x.done && x.at <= to).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        next.done = true; clock = next.at; next.fn();
      }
      clock = to;
    },
  };
}

test('ClipRecorder：撮影中の区切りが終わるのを待って、その録画と頭出し位置を返す', async () => {
  const env = fakeEnv();
  const rec = new ClipRecorder({ stream: {}, mime: 'video/mp4', ...opt, ...env });
  rec.start();
  env.advance(15.0);
  const p = rec.clipFor(10.2, 15.0); // 9秒に始まった区切りは18秒で止まる
  env.advance(18.0);
  const c = await p;
  assert.equal(await c.blob.text(), 'rec@9');
  assert.ok(Math.abs(c.offsetS - 1.2) < 1e-9);
  assert.ok(Math.abs(c.durationS - 4.8) < 1e-9);
  rec.stop();
});

test('ClipRecorder：入る区切りが無ければ null', async () => {
  const env = fakeEnv();
  const rec = new ClipRecorder({ stream: {}, mime: 'video/mp4', ...opt, ...env });
  rec.start();
  env.advance(20);
  assert.equal(await rec.clipFor(8.9, 15.4), null);
  rec.stop();
});
