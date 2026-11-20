// Catalogue photos made by the studio tab: one transparent 4:5 photo per product variant (and content set).
// The images live in Vercel Blob (uploaded through /api/blob); this keeps the index: variant key → image URL.
// GET  → { items: { <key>: { url, name, set, updated } } }
// POST → { action: 'set', key, url, name?, set? } | { action: 'delete', key }   (admin only)
import { redis } from './_redis.js';
import { isAdmin } from './_auth.js';

const KEY = 'catalog';
async function read() {
  const raw = await redis(['GET', KEY]);
  try { const d = raw ? JSON.parse(raw) : {}; d.items = d.items || {}; return d; } catch { return { items: {} }; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await read());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
    const { action, key, url, name, set } = req.body || {};
    const k = typeof key === 'string' ? key.trim().slice(0, 200) : '';
    if (!k) return res.status(400).json({ error: 'חסר מפתח' });
    const doc = await read();
    if (action === 'set') {
      if (typeof url !== 'string' || !/^(https?:|\/)/.test(url)) return res.status(400).json({ error: 'כתובת תמונה לא תקינה' });
      doc.items[k] = { url, name: String(name || '').slice(0, 200), set: String(set || '').slice(0, 20), updated: new Date().toISOString() };
    } else if (action === 'delete') delete doc.items[k];
    else return res.status(400).json({ error: 'unknown action' });
    const out = JSON.stringify(doc);
    if (out.length > 900_000) return res.status(413).json({ error: 'אינדקס הקטלוג גדול מדי' });
    await redis(['SET', KEY, out]);
    return res.status(200).json(doc);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
