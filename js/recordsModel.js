// 記録の一覧で使う、画面に依存しない決まりごと（日付はすべて日本時間）。
const JST_MS = 9 * 3600 * 1000;
export const jstDate = (iso) => new Date(new Date(iso).getTime() + JST_MS).toISOString().slice(0, 10);

export function groupRecords(sessions, shots) {
  const bySession = new Map();
  for (const s of shots) {
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }
  const days = new Map();
  const sorted = [...sessions].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  for (const session of sorted) {
    const list = bySession.get(session.id);
    if (!list || !list.length) continue;
    const date = jstDate(session.startedAt);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push({ session, shots: list.sort((a, b) => a.idx - b.idx) });
  }
  return [...days.entries()].map(([date, ss]) => ({ date, sessions: ss }));
}

export function exportFileName(now = new Date()) {
  return `shot-arc_${jstDate(now.toISOString()).replace(/-/g, '')}.csv`;
}

// 'YYYY-MM-DD'（日本時間）の開始日・終了日（その日を含む）を ISO の期間にする
export function rangeFromDates(fromStr, toStr) {
  const r = {};
  if (fromStr) r.from = new Date(new Date(`${fromStr}T00:00:00.000Z`).getTime() - JST_MS).toISOString();
  if (toStr) r.to = new Date(new Date(`${toStr}T00:00:00.000Z`).getTime() - JST_MS + 24 * 3600 * 1000).toISOString();
  return r;
}

export function nextOutcome(o) {
  return o === 'make' ? 'miss' : 'make';
}
