// Product models ("The Balloon Wall Stand" …) and saved scenes, shared by everyone; changes are admin only.
// GET  → { models: { <type>: { <name>: { cfg, updated } } }, scenes: { <name>: { kind:'base'|'ready', scene, brief?, light?, camera, updated } } }
// POST → { action: 'save-model' | 'delete-model' | 'rename-model' | 'save-scene' | 'delete-scene' | 'rename-scene' | 'scene-meta', type?, name, newName?, data?, agent?, cover? }
import { redis } from './_redis.js';
import { isAdmin } from './_auth.js';

const KEY = 'library';
// images of a scene that is deleted or replaced are removed from Vercel Blob (when it is connected)
async function dropImages(sc, keep = []) {
  const urls = [sc?.base?.url, sc?.final?.url].filter(u => u && !keep.includes(u));
  if (!urls.length || (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)) return;
  try { const { del } = await import('@vercel/blob'); await del(urls); } catch {}
}
const empty = () => ({ models: {}, scenes: {} });
const TYPES = ['unit', 'stand', 'excl', 'part', 'wall', 'tena', 'smart', 'tamb', 'mtamb', 'mdoor'];

async function read() {
  const raw = await redis(['GET', KEY]);
  try { const d = raw ? JSON.parse(raw) : empty(); d.models = d.models || {}; d.scenes = d.scenes || {}; return d; } catch { return empty(); }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await read());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });

    const { action, type, name, newName, data } = req.body || {};
    const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
    const n = clean(name);
    if (!n) return res.status(400).json({ error: 'חסר שם' });
    const doc = await read();
    if (action === 'save-model' || action === 'delete-model' || action === 'rename-model') {
      if (!TYPES.includes(type)) return res.status(400).json({ error: 'סוג מוצר לא מוכר' });
      const m = (doc.models[type] = doc.models[type] || {});
      if (action === 'save-model') {
        if (!data || typeof data !== 'object') return res.status(400).json({ error: 'missing data' });
        m[n] = { cfg: data, updated: new Date().toISOString() };
      } else if (action === 'delete-model') delete m[n];
      else { const nn = clean(newName); if (!nn || !m[n]) return res.status(400).json({ error: 'שם לא תקין' }); m[nn] = m[n]; delete m[n]; }
    } else if (action === 'save-scene') {
      if (!data || typeof data !== 'object' || !['base', 'ready'].includes(data.kind)) return res.status(400).json({ error: 'missing data' });
      await dropImages(doc.scenes[n], [data.base?.url, data.final?.url]);
      doc.scenes[n] = { ...data, updated: new Date().toISOString() };
    } else if (action === 'delete-scene') { await dropImages(doc.scenes[n]); delete doc.scenes[n]; }
    else if (action === 'scene-meta') {               // the scene's card: its picture, name and whose project it is
      const sc = doc.scenes[n]; if (!sc) return res.status(404).json({ error: 'אין סצנה בשם הזה' });
      const { agent, cover } = req.body || {};
      if (agent !== undefined) { const a = clean(agent); if (a) sc.agent = a; else delete sc.agent; }
      if (cover !== undefined) {
        const c = typeof cover === 'string' && /^(https?:|\/)/.test(cover) ? cover.slice(0, 600) : '';
        if (sc.cover && sc.cover !== c && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) { try { const { del } = await import('@vercel/blob'); await del([sc.cover]); } catch {} }
        if (c) sc.cover = c; else delete sc.cover;
      }
      const nn = clean(newName);
      if (nn && nn !== n) { if (doc.scenes[nn]) await dropImages(doc.scenes[nn], [sc.base?.url, sc.final?.url]); doc.scenes[nn] = sc; delete doc.scenes[n]; }
    }
    else if (action === 'rename-scene') {            // a new name, the same scene and pictures (nothing is deleted from Blob)
      const nn = clean(newName); if (!nn || !doc.scenes[n]) return res.status(400).json({ error: 'שם לא תקין' });
      if (nn !== n) { if (doc.scenes[nn]) await dropImages(doc.scenes[nn], [doc.scenes[n].base?.url, doc.scenes[n].final?.url]); doc.scenes[nn] = doc.scenes[n]; delete doc.scenes[n]; }
    }
    else return res.status(400).json({ error: 'unknown action' });
    const out = JSON.stringify(doc);
    if (out.length > 900_000) return res.status(413).json({ error: 'הספרייה גדולה מדי – מחקו דגמים או סצנות ישנים' });
    await redis(['SET', KEY, out]);
    return res.status(200).json(doc);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
