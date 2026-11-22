// Catalogue photos made by the studio tab: one transparent 4:5 photo per product variant (and content set).
// The images live in Vercel Blob (uploaded through /api/blob); this keeps the index: variant key → image URL.
// GET  → { items: { <key>: { url, name, set, updated } } }
// GET ?files=1 → { files: [{ url, at, size }] }   every studio file kept in Blob, old ones too (admin)
// POST → { action: 'set', key, url, name?, set?, ref? } | { action: 'review', key, review: 'ok'|'redo'|'', note? } | { action: 'delete', key }   (admin only)
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
    if (req.method === 'GET' && req.query?.files) {           // every studio file in Blob – also older renders the gallery no longer shows (admin)
      if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
      if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return res.status(200).json({ files: [] });
      const { list } = await import('@vercel/blob'); const files = []; let cursor;
      do { const r = await list({ prefix: 'scenes/catalog-', cursor, limit: 1000 }); for (const b of r.blobs) files.push({ url: b.url, at: b.uploadedAt, size: b.size }); cursor = r.hasMore ? r.cursor : null; } while (cursor && files.length < 20000);
      return res.status(200).json({ files });
    }
    if (req.method === 'GET') return res.status(200).json(await read());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
    const { action, key, url, name, set, review, note, ref } = req.body || {};
    const k = typeof key === 'string' ? key.trim().slice(0, 200) : '';
    if (!k) return res.status(400).json({ error: 'חסר מפתח' });
    const doc = await read();
    if (action === 'set') {
      if (typeof url !== 'string' || !/^(https?:|\/)/.test(url)) return res.status(400).json({ error: 'כתובת תמונה לא תקינה' });
      const old = doc.items[k];                     // a new render of a variant keeps the one before it, to compare
      const r0 = typeof ref === 'string' && /^(https?:|\/)/.test(ref) ? ref.slice(0, 600) : old?.ref;     // the 3D picture it was made from (to compare)
      doc.items[k] = { url, name: String(name || '').slice(0, 200), set: String(set || '').slice(0, 20), updated: new Date().toISOString(), ...(r0 ? { ref: r0 } : {}),
        ...(old && old.url !== url ? { prev: old.url, prevNote: old.note || '' } : {}) };
    } else if (action === 'review') {
      if (!doc.items[k]) return res.status(404).json({ error: 'אין תמונה לווריאציה הזו' });
      doc.items[k].review = ['ok', 'redo'].includes(review) ? review : '';
      doc.items[k].note = String(note || '').slice(0, 600);
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
