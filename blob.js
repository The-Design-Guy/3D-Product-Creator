// Stores an image of a saved scene (approved base / final render) in Vercel Blob and returns its public URL.
// Admin only. The browser sends the raw image bytes (not base64) to stay well under the request size limit.
// Needs a Blob store connected to the project (Vercel → Storage → Blob), which adds BLOB_READ_WRITE_TOKEN.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const TYPES = { 'image/webp':'webp', 'image/png':'png', 'image/jpeg':'jpg' };

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(501).json({ error: 'לא חובר אחסון תמונות (Vercel Blob) – ראו README' });
  const type = String(req.headers['content-type'] || '').split(';')[0];
  if (!TYPES[type]) return res.status(400).json({ error: 'רק WebP, PNG או JPG' });
  try {
    const buf = await rawBody(req);
    if (!buf.length || buf.length > 4_300_000) return res.status(413).json({ error: 'התמונה גדולה מדי' });
    const kind = String(req.query?.kind || 'image').replace(/[^a-z]/g, '').slice(0, 10) || 'image';
    const { put } = await import('@vercel/blob');
    const r = await put(`scenes/${kind}-${Date.now()}.${TYPES[type]}`, buf, { access:'public', contentType:type, addRandomSuffix:true });
    return res.status(200).json({ url: r.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
