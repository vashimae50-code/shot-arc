// 数字だけをCSVにする（Excelで開けるようにBOM付き、日時は日本時間）。
export const CSV_HEADER = '日時,打った人,回,何本目,結果,結果を手で直した,入射角,リリース角,最高点m,通過位置cm,通過位置,距離m,飛んだ時間s,拾えたコマ,測定,動画';
const OUTCOME = { make: 'はいった', miss: 'はずれ', unknown: 'ふめい' };
const WARN_COUNT = 100;
const WARN_DAYS = 7;

export function jstString(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const num = (v, digits) => (v == null || Number.isNaN(v) ? '' : Number(v).toFixed(digits));
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(shots) {
  const rows = shots.map((s) => {
    const ok = s.quality === 'ok';
    return [
      jstString(s.at), s.player, s.sessionNo ?? s.sessionId, s.idx, OUTCOME[s.outcome] ?? '', s.outcomeEdited ? '○' : '',
      ok ? num(s.entryAngleDeg, 1) : '', ok ? num(s.releaseAngleDeg, 1) : '', ok ? num(s.apexM, 2) : '',
      ok ? num(s.depthCm, 0) : '', ok ? (s.depthLabel ?? '') : '', ok ? num(s.distanceM, 2) : '', ok ? num(s.flightS, 2) : '',
      s.nPoints ?? '', ok ? 'ok' : 'はかれなかった', s.clipId != null ? 'あり' : 'なし',
    ].map(cell).join(',');
  });
  return '﻿' + [CSV_HEADER, ...rows].join('\r\n');
}

export function needsExportWarning(shots, now = new Date()) {
  const pending = shots.filter((s) => !s.exported);
  if (pending.length >= WARN_COUNT) return true;
  const limit = now.getTime() - WARN_DAYS * 24 * 3600 * 1000;
  return pending.some((s) => new Date(s.at).getTime() < limit);
}
