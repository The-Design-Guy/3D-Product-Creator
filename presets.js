// Catalog settings ("קטלוג חוליות", "קטלוג מדיקופ"...): one JSON document shared by every product family.
// GET  → { active, presets: { name: { camera, families: { ravta: {...}, ... }, updated } } }
// POST → admin only: { action: 'login' | 'save' | 'delete' | 'activate', name?, data?, makeActive? }
import { redis } from './_redis.js';
import { isAdmin } from './_auth.js';

const KEY = 'catalog-settings';
const empty = () => ({ active: null, presets: {} });

async function read() {
  const raw = await redis(['GET', KEY]);
  try { return raw ? JSON.parse(raw) : empty(); } catch { return empty(); }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await read());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error: 'סיסמת ניהול שגויה' });

    const { action, name, data, makeActive } = req.body || {};
    if (action === 'login') return res.status(200).json({ ok: true });

    const doc = await read();
    const clean = typeof name === 'string' ? name.trim().slice(0, 80) : '';
    if (action === 'save') {
      if (!clean || !data || typeof data !== 'object') return res.status(400).json({ error: 'missing name or data' });
      if (JSON.stringify(data).length > 200_000) return res.status(413).json({ error: 'settings too large' });
      doc.presets[clean] = data;
      if (makeActive) doc.active = clean;
    } else if (action === 'delete') {
      delete doc.presets[clean];
      if (doc.active === clean) doc.active = null;
    } else if (action === 'activate') {
      doc.active = clean && doc.presets[clean] ? clean : null;
    } else {
      return res.status(400).json({ error: 'unknown action' });
    }
    await redis(['SET', KEY, JSON.stringify(doc)]);
    return res.status(200).json(doc);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
