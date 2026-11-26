// iPadの中（IndexedDB）に、回・1本ごとの数字・動画を保存する。
const DB_NAME = 'shotarc';
const DB_VERSION = 1;

const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const tx2p = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('abort'));
});

export async function openStore(idb = globalThis.indexedDB) {
  const db = await new Promise((res, rej) => {
    const r = idb.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
      const shots = d.createObjectStore('shots', { keyPath: 'id', autoIncrement: true });
      shots.createIndex('sessionId', 'sessionId');
      shots.createIndex('at', 'at');
      const clips = d.createObjectStore('clips', { keyPath: 'id', autoIncrement: true });
      clips.createIndex('shotId', 'shotId');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const all = async (store) => req2p(db.transaction(store).objectStore(store).getAll());

  // 1本の動画を消し、shot の clipId を空にする（同じトランザクションで）
  async function removeClips(pred) {
    const tx = db.transaction(['shots', 'clips'], 'readwrite');
    const shots = tx.objectStore('shots');
    const clips = tx.objectStore('clips');
    const list = await req2p(shots.getAll());
    for (const s of list) {
      if (s.clipId == null || !pred(s)) continue;
      clips.delete(s.clipId);
      shots.put({ ...s, clipId: null });
    }
    await tx2p(tx);
  }

  async function patchShot(id, patch) {
    const tx = db.transaction('shots', 'readwrite');
    const st = tx.objectStore('shots');
    const s = await req2p(st.get(id));
    if (s) st.put({ ...s, ...patch(s) });
    await tx2p(tx);
  }

  return {
    async addSession({ player, calib }) {
      const startedAt = new Date().toISOString();
      const today = startedAt.slice(0, 10);
      const sessions = await all('sessions');
      const no = sessions.filter((s) => (s.startedAt ?? '').slice(0, 10) === today).length + 1;
      const tx = db.transaction('sessions', 'readwrite');
      const id = await req2p(tx.objectStore('sessions').add({ player, calib, startedAt, endedAt: null, no }));
      await tx2p(tx);
      return id;
    },

    async endSession(id) {
      const tx = db.transaction('sessions', 'readwrite');
      const st = tx.objectStore('sessions');
      const s = await req2p(st.get(id));
      if (s && !s.endedAt) st.put({ ...s, endedAt: new Date().toISOString() });
      await tx2p(tx);
    },

    // 数字を先に保存し、動画は別に保存する。動画が保存できなくても数字は残る。
    async saveShot(shot, clipBlob, clipMeta) {
      const tx = db.transaction('shots', 'readwrite');
      const shotId = await req2p(tx.objectStore('shots').add({
        ...shot, outcomeEdited: false, exported: false, clipId: null,
      }));
      await tx2p(tx);
      if (!clipBlob) return { shotId, clipSaved: false };
      try {
        const tx2 = db.transaction('clips', 'readwrite');
        const clipId = await req2p(tx2.objectStore('clips').add({ shotId, blob: clipBlob, ...clipMeta }));
        await tx2p(tx2);
        await patchShot(shotId, () => ({ clipId }));
        return { shotId, clipSaved: true };
      } catch (_) {
        return { shotId, clipSaved: false };
      }
    },

    listSessions: () => all('sessions'),

    async listShots({ sessionId, from, to } = {}) {
      return (await all('shots')).filter((s) => (sessionId == null || s.sessionId === sessionId)
        && (!from || s.at >= from) && (!to || s.at < to));
    },

    updateOutcome: (id, outcome) => patchShot(id, () => ({ outcome, outcomeEdited: true })),

    async markExported(ids) {
      const set = new Set(ids);
      const tx = db.transaction('shots', 'readwrite');
      const st = tx.objectStore('shots');
      for (const s of await req2p(st.getAll())) if (set.has(s.id)) st.put({ ...s, exported: true });
      await tx2p(tx);
    },

    async getClip(shotId) {
      const s = await req2p(db.transaction('shots').objectStore('shots').get(shotId));
      if (!s || s.clipId == null) return null;
      const c = await req2p(db.transaction('clips').objectStore('clips').get(s.clipId));
      return c ? { blob: c.blob, mime: c.mime, offsetS: c.offsetS, durationS: c.durationS } : null;
    },

    deleteClip: (shotId) => removeClips((s) => s.id === shotId),
    deleteSessionClips: (sessionId) => removeClips((s) => s.sessionId === sessionId),
    deleteExportedClips: () => removeClips((s) => s.exported),
  };
}
