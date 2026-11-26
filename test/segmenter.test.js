import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShotSegmenter } from '../js/segmenter.js';
import { makeTrack } from './helpers.js';

// 点の列をコマごとに流す。点の無いコマは空で流す。
function run(seg, frames) {
  const out = [];
  for (const f of frames) out.push(...seg.push(f.t, f.dets));
  return out;
}
const toFrames = (points) => points.map((p) => ({ t: p.t, dets: [{ x: p.x, y: p.y }] }));
const empty = (t0, t1) => {
  const f = [];
  for (let t = t0; t <= t1 + 1e-9; t += 1 / 30) f.push({ t, dets: [] });
  return f;
};

test('1本の軌道を1本として返す', () => {
  const { calib, points } = makeTrack();
  const shots = run(new ShotSegmenter(calib), [...toFrames(points), ...empty(1.0 + 1 / 30, 1.6)]);
  assert.equal(shots.length, 1);
  assert.ok(shots[0].points.length >= 28, `点 ${shots[0].points.length}`);
  assert.equal(shots[0].points[0].t, 0, '打った瞬間（ネットより低い位置）から始まる');
});

test('間をあけた2本は2本', () => {
  const a = makeTrack();
  const b = makeTrack({ t0: 2.0, t1: 3.0 });
  const shots = run(new ShotSegmenter(a.calib), [
    ...toFrames(a.points), ...empty(1.0 + 1 / 30, 2.0 - 1 / 30), ...toFrames(b.points), ...empty(3.0 + 1 / 30, 3.6),
  ]);
  assert.equal(shots.length, 2);
});

test('リングより低い所を横切るだけの動きは数えない（Review Focus 1）', () => {
  const { calib } = makeTrack();
  const frames = [];
  for (let i = 0; i <= 30; i++) frames.push({ t: i / 30, dets: [{ x: 200 + i * 30, y: 450 + (i % 4) * 10 }] });
  const shots = run(new ShotSegmenter(calib), [...frames, ...empty(1.0 + 1 / 30, 1.6)]);
  assert.equal(shots.length, 0);
});

test('遠く離れた誤検出は軌道に入れない', () => {
  const { calib, points } = makeTrack();
  const frames = toFrames(points);
  frames[10].dets.push({ x: 100, y: 50 }); // 本物と一緒に誤検出
  frames[15].dets = [{ x: 1500, y: 40 }]; // 本物が見えず、誤検出だけ
  const shots = run(new ShotSegmenter(calib), [...frames, ...empty(1.0 + 1 / 30, 1.6)]);
  assert.equal(shots.length, 1);
  assert.ok(!shots[0].points.some((p) => p.x === 100 || p.x === 1500), '誤検出が入った');
  assert.equal(shots[0].points.length, 30);
});

test('打つ前のドリブルは軌道の頭から外す', () => {
  const { calib, points } = makeTrack();
  const pre = [];
  // 0.5秒周期で上下するドリブル（480〜600画素）を1秒
  for (let i = 30; i >= 1; i--) {
    const t = -i / 30;
    const phase = ((i % 15) + 15) % 15; // 15コマで1往復
    const y = 480 + (phase <= 7 ? phase : 15 - phase) * (120 / 7.5);
    pre.push({ t, dets: [{ x: 1200, y }] });
  }
  const shots = run(new ShotSegmenter(calib), [...pre, ...toFrames(points), ...empty(1.0 + 1 / 30, 1.6)]);
  assert.equal(shots.length, 1);
  assert.ok(shots[0].points[0].t >= -0.3, `始まり ${shots[0].points[0].t}`);
});

test('手に持っていた間の点と、間が空いた後の飛行を分け、飛行だけを返す', () => {
  const { calib, points } = makeTrack({ t0: 0, t1: 1.0 });
  const hold = [0.4, 0.37, 0.33].map((dt) => ({ t: -dt, dets: [{ x: points[0].x + 3, y: points[0].y + 40 }] }));
  const shots = run(new ShotSegmenter(calib), [...hold, ...empty(-0.3 + 1 / 30, -1 / 30), ...toFrames(points), ...empty(1.0 + 1 / 30, 1.6)]);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].points[0].t, 0);
});
