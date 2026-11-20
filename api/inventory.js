// Planning wizard – step "what do you store": turns the client's own description (typed or dictated, usually Hebrew)
// and / or photos of the items into a table: item, size, quantity, how often it is picked, its kind.
// Admin only. The model reads and estimates – sizes from photos are rough and the user confirms them.
import { isAdmin } from './_auth.js';
import { analyzeInventory, REFS } from './_inv.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  const text = String(req.body?.text || '').slice(0, 6000);
  const ok = (u) => typeof u === 'string' && /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(u);
  // images: plain urls / data urls, or { url, ref, note } with the reference object next to the item
  const items = (Array.isArray(req.body?.images) ? req.body.images : []).map(x => typeof x === 'string' ? { url:x } : x)
    .filter(x => x && ok(x.url)).slice(0, 6).map(x => ({ url:x.url, ref:REFS[x.ref] ? x.ref : 'none', note:String(x.note || '').slice(0, 400) }));
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 80) : [];
  if (!text.trim() && !items.length) return res.status(400).json({ error: 'אין טקסט או תמונה לנתח' });
  try {
    return res.status(200).json(await analyzeInventory({ text, items, rows }));
  } catch (e) {
    return res.status(502).json({ error:e.message });
  }
}
