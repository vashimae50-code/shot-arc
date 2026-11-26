// 記録の一覧：見る・○×を直す・数字を書き出す・動画を消す。
import { toCsv } from './csv.js';
import { groupRecords, exportFileName, rangeFromDates, nextOutcome, jstDate } from './recordsModel.js';
import { OUTCOME_LABEL, fmt } from './draw.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, kids = []) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) e.append(k);
  return e;
};
const CONFIRM_DELETE = 'どうがだけ けします。すうじは のこります。よろしいですか？';

// 共有メニューで送る。使えなければダウンロードにする
async function shareFiles(files) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false; // 共有をやめた
  }
  for (const f of files) {
    const a = el('a', { href: URL.createObjectURL(f), download: f.name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  return true;
}

const clipName = (shot, mime) => {
  const ext = (mime || '').includes('webm') ? 'webm' : 'mp4';
  const t = new Date(new Date(shot.at).getTime() + 9 * 3600 * 1000).toISOString();
  return `shot-arc_${t.slice(0, 10).replace(/-/g, '')}_${t.slice(11, 19).replace(/:/g, '')}_${shot.player}_${shot.idx}.${ext}`;
};

export async function showRecords(store, { show, onBack }) {
  show('records');
  $('recBack').onclick = onBack;
  await render(store);
}

async function render(store) {
  const body = $('recBody');
  body.innerHTML = '';
  const [sessions, shots] = await Promise.all([store.listSessions(), store.listShots()]);

  // 書き出し
  const from = el('input', { type: 'date' });
  const to = el('input', { type: 'date' });
  const exportBtn = el('button', { className: 'go', textContent: 'すうじを かきだす（CSV）' });
  const delExported = el('button', { className: 'sub', textContent: 'かきだしずみの どうがを ぜんぶけす' });
  const pending = shots.filter((s) => !s.exported).length;
  body.append(el('div', { className: 'exportBox' }, [
    el('div', { textContent: `ぜんぶで ${shots.length}本（まだ かきだしていない ${pending}本）` }),
    el('div', { className: 'row' }, ['きかん', from, '〜', to, el('span', { textContent: '（からなら ぜんぶ）' })]),
    el('div', { className: 'row' }, [exportBtn, delExported]),
  ]));
  exportBtn.onclick = async () => {
    const list = (await store.listShots(rangeFromDates(from.value, to.value))).sort((a, b) => a.at.localeCompare(b.at));
    if (!list.length) { alert('その きかんの きろくは ありません'); return; }
    const file = new File([toCsv(list)], exportFileName(new Date()), { type: 'text/csv' });
    if (await shareFiles([file])) { await store.markExported(list.map((s) => s.id)); await render(store); }
  };
  delExported.onclick = async () => {
    if (!confirm(CONFIRM_DELETE)) return;
    await store.deleteExportedClips();
    await render(store);
  };

  const groups = groupRecords(sessions, shots);
  if (!groups.length) body.append(el('p', { textContent: 'まだ きろくが ありません' }));
  for (const day of groups) {
    body.append(el('div', { className: 'day', textContent: day.date.replace(/-/g, '/') }));
    for (const { session, shots: list } of day.sessions) body.append(sessionCard(store, session, list));
  }
}

function sessionCard(store, session, list) {
  const makes = list.filter((s) => s.outcome === 'make').length;
  const ok = list.filter((s) => s.quality === 'ok');
  const avg = ok.length ? ok.reduce((a, s) => a + s.entryAngleDeg, 0) / ok.length : null;
  const time = new Date(new Date(session.startedAt).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16);
  const hasClip = list.some((s) => s.clipId != null);
  const delBtn = el('button', { className: 'sub', textContent: 'この回の どうがをけす', disabled: !hasClip });
  const shareBtn = el('button', { className: 'sub', textContent: 'この回の どうがを かきだす', disabled: !hasClip });
  delBtn.onclick = async () => { if (confirm(CONFIRM_DELETE)) { await store.deleteSessionClips(session.id); await render(store); } };
  shareBtn.onclick = async () => {
    const files = [];
    for (const s of list) {
      const c = await store.getClip(s.id);
      if (c) files.push(new File([c.blob], clipName(s, c.mime), { type: c.mime }));
    }
    if (files.length) await shareFiles(files);
  };

  const table = el('table', { className: 'shots' });
  table.append(el('tr', {}, ['#', 'けっか', 'にゅうしゃかく', 'つうか', 'さいこうてん', 'どうが', ''].map((h) => el('th', { textContent: h }))));
  for (const s of list) {
    const res = el('button', { textContent: `${OUTCOME_LABEL[s.outcome] ?? ''}${s.outcomeEdited ? '＊' : ''}` });
    res.onclick = async () => { await store.updateOutcome(s.id, nextOutcome(s.outcome)); await render(store); };
    const play = el('button', { textContent: '▶', disabled: s.clipId == null });
    play.onclick = () => playClip(store, s);
    const del = el('button', { className: 'sub', textContent: 'けす', disabled: s.clipId == null });
    del.onclick = async () => { if (confirm(CONFIRM_DELETE)) { await store.deleteClip(s.id); await render(store); } };
    const okRow = s.quality === 'ok';
    table.append(el('tr', {}, [
      el('td', { textContent: s.idx }),
      el('td', { className: 'res' }, res),
      el('td', { textContent: okRow ? `${fmt(s.entryAngleDeg, 1)}°` : 'はかれなかった' }),
      el('td', { textContent: okRow ? `${s.depthLabel} ${fmt(s.depthCm, 0)}cm` : '' }),
      el('td', { textContent: okRow ? `+${fmt(s.apexM, 2)}m` : '' }),
      el('td', { className: 'res' }, play),
      el('td', { className: 'res' }, del),
    ]));
  }
  return el('div', { className: 'sess' }, [
    el('div', { className: 'row' }, [
      el('div', { textContent: `${time}　${session.player}　${session.no ?? ''}かいめ　${list.length}本 ${makes}本はいった${avg != null ? `　へいきん ${fmt(avg, 1)}°` : ''}` }),
      el('div', {}, [shareBtn, delBtn]),
    ]),
    table,
  ]);
}

async function playClip(store, shot) {
  const c = await store.getClip(shot.id);
  if (!c) return;
  const url = URL.createObjectURL(c.blob);
  const v = el('video', { src: url, playsInline: true, muted: true, controls: false });
  const box = el('div', { className: 'player' });
  const close = () => { v.pause(); URL.revokeObjectURL(url); box.remove(); };
  const rate = (r) => { v.playbackRate = r; v.play(); };
  const stepBtn = el('button', { className: 'sub', textContent: 'コマおくり' });
  stepBtn.onclick = () => { v.pause(); v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 1 / 30); };
  const back = el('button', { className: 'sub', textContent: 'はじめから' });
  back.onclick = () => { v.currentTime = c.offsetS; v.play(); };
  const share = el('button', { className: 'sub', textContent: 'かきだす' });
  share.onclick = () => shareFiles([new File([c.blob], clipName(shot, c.mime), { type: c.mime })]);
  const closeBtn = el('button', { className: 'stop', textContent: 'とじる' });
  closeBtn.onclick = close;
  box.append(
    el('div', { textContent: `${jstDate(shot.at)} ${shot.player} ${shot.idx}本目`, style: 'font-size:22px;margin-bottom:8px' }),
    v,
    el('div', { className: 'row' }, [
      ...[0.25, 0.5, 1].map((r) => { const b = el('button', { textContent: `${r}ばい` }); b.onclick = () => rate(r); return b; }),
      stepBtn, back, share, closeBtn,
    ]),
  );
  document.body.appendChild(box);
  v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(c.offsetS, Math.max(0, (v.duration || c.offsetS) - 0.1)); v.playbackRate = 0.5; v.play(); }, { once: true });
  // 1本の範囲が終わったら止める（録画の区切りは長めなので）
  v.addEventListener('timeupdate', () => { if (v.currentTime > c.offsetS + c.durationS) v.pause(); });
}
