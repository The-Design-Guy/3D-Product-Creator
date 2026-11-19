// Inventory by phone: the computer opens a session (QR / this device / a link to send, valid an hour); the phone photographs
// the items one by one – each with the reference object next to it and how many there are (typed or dictated) –
// the AI turns them into the inventory table, the phone confirms, and the computer's planning wizard gets the rows.
//
//   POST ?a=new[&share=1]            (admin)  → { id, exp }
//   GET  ?a=check&id=…               (phone)  → { ok, share, exp, status }
//   GET  ?a=status&id=…              (admin)  → the session
//   POST ?a=photo&id=…&n=0..29       (phone)  raw JPEG / WebP body → { url }
//   POST ?a=meta&id=…                (phone)  JSON { n, ref, note, dims } → { ok }      what goes with photo n
//   POST ?a=remove&id=…              (phone)  JSON { n }
//   POST ?a=analyze&id=…             (phone)  → { rows, questions }
//   POST ?a=confirm&id=…             (phone)  JSON { rows } → { ok }
//   POST ?a=cancel&id=…              (either)
import { randomBytes } from 'node:crypto';
import { isAdmin } from './_auth.js';
import { redis } from './_redis.js';
import { analyzeInventory, REFS } from './_inv.js';

export const config = { maxDuration: 60 };
const TTL = 1800, SHARE_TTL = 3600, KEEP = 7 * 86400, MAX = 30;
const TYPES = { 'image/webp':'webp', 'image/jpeg':'jpg', 'image/png':'png' };
const key = (id) => `invscan:${id}`;
async function load(id) {
  if (!/^[a-z0-9]{20}$/.test(id || '')) return null;
  const raw = await redis(['GET', key(id)]);
  return raw ? JSON.parse(raw) : null;
}
const save = (id, s) => redis(['SET', key(id), JSON.stringify(s), 'EX', String(s.share ? KEEP : TTL)]);
async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse((await rawBody(req)).toString('utf8') || '{}'); } catch { return {}; }
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 10000 ? n : null; };

export default async function handler(req, res) {
  const a = String(req.query?.a || ''), id = String(req.query?.id || '');
  try {
    if (a === 'new') {
      if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
      if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
      if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return res.status(501).json({ error:'לא חובר אחסון תמונות (Vercel Blob) – ראו README' });
      const nid = randomBytes(15).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(20, '0').slice(0, 20);
      const share = String(req.query?.share || '') === '1', now = Date.now(), exp = now + (share ? SHARE_TTL : TTL) * 1000;
      await save(nid, { kind:'items', status:'waiting', created:now, exp, items:[], rows:null, questions:[], error:'', ...(share ? { share:true } : {}) });
      return res.status(200).json({ id:nid, exp });
    }
    const s = await load(id);
    if (!s) return res.status(404).json({ error:'הסשן לא נמצא או שפג תוקפו – בקשו קישור חדש' });
    const expired = Date.now() > s.exp && s.status !== 'done';
    if (a === 'check') return res.status(200).json({ ok:!expired && s.status !== 'cancelled' && s.status !== 'done', share:!!s.share, exp:s.exp, status:s.status, items:s.items, rows:s.rows });
    if (a === 'status') {
      if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
      return res.status(200).json(s);
    }
    if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
    if (s.status === 'cancelled') return res.status(410).json({ error:'הצילום בוטל במחשב' });
    if (expired && a !== 'cancel') return res.status(410).json({ error:'הקישור פג תוקף – בקשו קישור חדש' });

    if (a === 'photo') {
      const n = Number(req.query?.n);
      if (!Number.isInteger(n) || n < 0 || n >= MAX) return res.status(400).json({ error:`עד ${MAX} פריטים` });
      const type = String(req.headers['content-type'] || '').split(';')[0];
      if (!TYPES[type]) return res.status(400).json({ error:'רק JPG, WebP או PNG' });
      const buf = await rawBody(req);
      if (!buf.length || buf.length > 4_300_000) return res.status(413).json({ error:'התמונה גדולה מדי' });
      const { put } = await import('@vercel/blob');
      const r = await put(`invscans/${id}/${n + 1}.${TYPES[type]}`, buf, { access:'public', contentType:type, addRandomSuffix:true });
      const cur = await load(id) || s;
      cur.items[n] = { ...(cur.items[n] || {}), url:r.url }; cur.status = 'capturing'; cur.error = '';
      await save(id, cur);
      return res.status(200).json({ url:r.url });
    }
    if (a === 'meta' || a === 'remove') {
      const b = await jsonBody(req), n = Number(b.n);
      if (!Number.isInteger(n) || n < 0 || n >= MAX) return res.status(400).json({ error:'פריט לא תקין' });
      const cur = await load(id) || s;
      if (a === 'remove') cur.items[n] = null;
      else cur.items[n] = { ...(cur.items[n] || {}), ref:REFS[b.ref] ? b.ref : 'none', note:String(b.note || '').slice(0, 400),
        dims:{ l:num(b.dims?.l), w:num(b.dims?.w), h:num(b.dims?.h) } };
      await save(id, cur);
      return res.status(200).json({ ok:true });
    }
    if (a === 'analyze') {
      const items = (s.items || []).filter(x => x && x.url);
      if (!items.length) return res.status(400).json({ error:'עוד לא צולם אף פריט' });
      if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:'OPENAI_API_KEY is not set' });
      s.status = 'analyzing'; await save(id, s);
      try {
        const out = await analyzeInventory({ items });
        s.rows = out.rows; s.questions = out.questions; s.status = 'review'; await save(id, s);
        return res.status(200).json(out);
      } catch (e) { s.status = 'capturing'; s.error = e.message; await save(id, s); return res.status(502).json({ error:e.message }); }
    }
    if (a === 'confirm') {
      const b = await jsonBody(req), rows = Array.isArray(b.rows) ? b.rows.slice(0, 80) : s.rows;
      if (!rows || !rows.length) return res.status(400).json({ error:'אין עדיין טבלה לאישור' });
      s.rows = rows; s.status = 'done'; await save(id, s);
      return res.status(200).json({ ok:true });
    }
    if (a === 'cancel') { s.status = 'cancelled'; await save(id, s); return res.status(200).json({ ok:true }); }
    return res.status(400).json({ error:'unknown action' });
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
