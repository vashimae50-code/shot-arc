// 段階0の試作で測った値から、このiPadで作り方Aが成り立つかを判定する。
export const MIN_FPS = 24;

export function summarizeProbe(raw) {
  const reasons = [];
  let ng = false;
  if (!(raw.fps720 >= MIN_FPS)) { reasons.push('コマ数が少ない'); ng = true; }
  if (!raw.mime) { reasons.push('録画できる形式がない'); ng = true; }
  if (!raw.idbBlobOk) { reasons.push('動画を保存できない'); ng = true; }
  if (raw.concurrentRecorders < 2) reasons.push('録画は1本ずつ');
  else if (raw.concurrentRecorders < 3) reasons.push('録画は2本まで');
  if (!raw.persist) reasons.push('データが消える可能性');
  if (!raw.jaVoice) reasons.push('日本語の声がない');
  return {
    fps720: raw.fps720, fps1080: raw.fps1080, mime: raw.mime ?? null,
    concurrentRecorders: raw.concurrentRecorders, persist: !!raw.persist,
    idbBlobOk: !!raw.idbBlobOk, jaVoice: !!raw.jaVoice,
    verdict: ng ? 'ng' : 'ok', reasons,
  };
}
