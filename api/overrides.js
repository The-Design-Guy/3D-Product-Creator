// What the admin renamed or added on top of the code: display names of products and of their choices, and the
// product photos (hide a built-in one, add one from a file). Names only – the inner keys stay as they are, so the
// studio photos and the saved scenes keep finding their products.
// GET  → { names:{ prod:{ <product>:<shown name> }, opt:{ <product>:{ <choice>:<shown name> } } },
//          photos:{ <product>:{ hide:[<choice>…], extra:[{ id, name, url }] } } }
// POST → { data }   the whole document (admin only)
import { redis } from './_redis.js';
import { isAdmin } from './_auth.js';

const KEY = 'overrides';
const clean = (d) => {
  const out = { names:{ prod:{}, opt:{} }, photos:{} }, str = (v, n = 80) => String(v ?? '').slice(0, n);
  const n = (d && d.names) || {};
  for (const [k, v] of Object.entries(n.prod || {})) if (str(v).trim()) out.names.prod[str(k, 120)] = str(v).trim();
  for (const [p, m] of Object.entries(n.opt || {})) {
    const o = {}; for (const [k, v] of Object.entries(m || {})) if (str(v).trim()) o[str(k, 120)] = str(v).trim();
    if (Object.keys(o).length) out.names.opt[str(p, 120)] = o;
  }
  for (const [p, x] of Object.entries((d && d.photos) || {})) {
    const hide = [...new Set((x.hide || []).map(v => str(v, 120)))];
    const extra = (x.extra || []).filter(e => e && /^(https?:|\/)/.test(String(e.url || ''))).slice(0, 40)
      .map(e => ({ id:str(e.id, 40), name:str(e.name).trim() || 'תמונה', url:str(e.url, 600) }));
    if (hide.length || extra.length) out.photos[str(p, 120)] = { hide, extra };
  }
  return out;
};

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') { const raw = await redis(['GET', KEY]); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch {} return res.status(200).json(clean(d)); }
    if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
    const doc = clean((req.body || {}).data), out = JSON.stringify(doc);
    if (out.length > 200_000) return res.status(413).json({ error:'יותר מדי שינויים' });
    await redis(['SET', KEY, out]);
    return res.status(200).json(doc);
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
