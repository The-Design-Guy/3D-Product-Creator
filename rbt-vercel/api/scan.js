// Room scan: the computer opens a session and shows a QR code; the phone films the room (8 photos in a circle),
// the photos go to Vercel Blob, the AI reads the room from them, the phone confirms, and the computer builds the scene.
//
//   POST ?a=new                      (admin)  → { id }                        a new session, 30 minutes
//   GET  ?a=status&id=…              (admin)  → the session                   the computer polls this
//   POST ?a=photo&id=…&n=0..7        (phone)  raw JPEG/WebP body → { url }    one photo
//   POST ?a=analyze&id=…             (phone)  → { result }                    the AI reads the room
//   POST ?a=confirm&id=…             (phone)  JSON { result } → { ok }        the (corrected) room goes to the computer
//   POST ?a=cancel&id=…              (either)
//
// The phone has no admin password: the session id (random, 20 characters, 30 minutes) is what lets it in.
import { randomBytes } from 'node:crypto';
import { isAdmin } from './_auth.js';
import { redis } from './_redis.js';

export const config = { maxDuration: 60 };
const TTL = 1800, MAX_PHOTOS = 8;
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1';
const TYPES = { 'image/webp':'webp', 'image/jpeg':'jpg', 'image/png':'png' };
const key = (id) => `scan:${id}`;

async function load(id) {
  if (!/^[a-z0-9]{20}$/.test(id || '')) return null;
  const raw = await redis(['GET', key(id)]);
  return raw ? JSON.parse(raw) : null;
}
const save = (id, s) => redis(['SET', key(id), JSON.stringify(s), 'EX', String(TTL)]);
async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse((await rawBody(req)).toString('utf8') || '{}'); } catch { return {}; }
}

const nul = (t) => ({ anyOf:[t, { type:'null' }] });
const SCHEMA = { type:'object', additionalProperties:false,
  required:['ok', 'problem', 'width_m', 'depth_m', 'height_m', 'confidence', 'walls', 'openings', 'floor', 'wall_color', 'style', 'description_he', 'description_en'],
  properties:{
    ok:{ type:'boolean', description:'false if the photos do not show a room clearly enough (too dark, blurred, the same view again and again)' },
    problem:{ type:'string', description:'Hebrew, short: what is wrong with the photos when ok is false; empty otherwise' },
    width_m:{ type:'number', description:'the length of the BACK wall (photo 1), in metres' },
    depth_m:{ type:'number', description:'the length of the side walls (photos 3 and 7), in metres' },
    height_m:{ type:'number' },
    confidence:{ type:'string', enum:['low', 'medium', 'high'] },
    walls:{ type:'object', additionalProperties:false, required:['back', 'left', 'right', 'front'], properties:{
      back:{ type:'boolean' }, left:{ type:'boolean' }, right:{ type:'boolean' }, front:{ type:'boolean' } }, description:'true = a solid wall (false = open to another space)' },
    openings:{ type:'array', items:{ type:'object', additionalProperties:false, required:['kind', 'type', 'wall', 'width_cm', 'height_cm', 'offset_cm', 'sill_cm'], properties:{
      kind:{ type:'string', enum:['door', 'window'] },
      type:{ type:'string', enum:['single', 'double', 'sliding', 'passage', 'std', 'shop', 'high'], description:'door: single / double / sliding (glass) / passage (an opening with no door). window: std / shop (large shop front) / high (high, narrow)' },
      wall:{ type:'string', enum:['back', 'left', 'right', 'front'] },
      width_cm:{ type:'number' }, height_cm:{ type:'number' },
      offset_cm:{ type:'number', description:'distance from the corner: on the back and front walls from the LEFT wall; on the side walls from the BACK wall' },
      sill_cm:{ type:'number', description:'window: height of its bottom above the floor; door: 0' } } } },
    floor:{ type:'string', description:'Hebrew: the floor, e.g. "פרקט עץ בהיר", "אריחים אפורים"' },
    wall_color:{ type:'string', description:'Hebrew: colour / finish of the walls' },
    style:{ type:'string', description:'Hebrew: what kind of place it is and its style, e.g. "חנות ממתקים צבעונית", "מחסן תעשייתי"' },
    description_he:{ type:'string', description:'Hebrew, 1–2 sentences describing the room for the realistic render (floor, walls, ceiling, light, atmosphere). No furniture that will be replaced.' },
    description_en:{ type:'string', description:'the same in English' },
  } };

const SYSTEM = `You read a room from 8 photos taken by someone standing near the middle of it and turning clockwise (to the right), 45° between photos.
Photo 1 faces the BACK wall. Photo 3 faces the RIGHT wall, photo 5 the FRONT wall (behind the starting direction), photo 7 the LEFT wall; photos 2, 4, 6, 8 show the corners between them.
Estimate the room's size from things of known size: doors are about 200–210 cm high and 80–90 cm wide, ceilings about 260–300 cm, floor tiles 60 cm, power sockets about 30 cm above the floor, a kitchen counter 90 cm.
List every door, doorway and window you can see, on the wall it is in, with its size and position. Keep the same wall names (back / right / front / left) as defined above.
Be honest about how sure you are (confidence). Answer only with the JSON.`;

export default async function handler(req, res) {
  const a = String(req.query?.a || ''), id = String(req.query?.id || '');
  try {
    if (a === 'new') {
      if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
      if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
      if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(501).json({ error:'לא חובר אחסון תמונות (Vercel Blob) – ראו README' });
      const nid = randomBytes(15).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(20, '0').slice(0, 20);
      await save(nid, { status:'waiting', created:Date.now(), photos:Array(MAX_PHOTOS).fill(null), result:null, error:'' });
      return res.status(200).json({ id:nid, ttl:TTL });
    }
    const s = await load(id);
    if (!s) return res.status(404).json({ error:'הסשן לא נמצא או שפג תוקפו – סרקו שוב את הברקוד מהמחשב' });

    if (a === 'status') {
      if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
      return res.status(200).json(s);
    }
    if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
    if (s.status === 'cancelled') return res.status(410).json({ error:'הצילום בוטל במחשב' });

    if (a === 'photo') {
      const n = Number(req.query?.n);
      if (!Number.isInteger(n) || n < 0 || n >= MAX_PHOTOS) return res.status(400).json({ error:'מספר תמונה לא תקין' });
      const type = String(req.headers['content-type'] || '').split(';')[0];
      if (!TYPES[type]) return res.status(400).json({ error:'רק JPG, WebP או PNG' });
      const buf = await rawBody(req);
      if (!buf.length || buf.length > 4_300_000) return res.status(413).json({ error:'התמונה גדולה מדי' });
      const { put } = await import('@vercel/blob');
      const r = await put(`scans/${id}/${n + 1}.${TYPES[type]}`, buf, { access:'public', contentType:type, addRandomSuffix:true });
      const cur = await load(id) || s;                                   // photos may arrive close together
      cur.photos[n] = r.url; cur.status = 'capturing'; cur.error = '';
      await save(id, cur);
      return res.status(200).json({ url:r.url, count:cur.photos.filter(Boolean).length });
    }
    if (a === 'analyze') {
      const urls = s.photos.filter(Boolean);
      if (urls.length < 4) return res.status(400).json({ error:'צריך לפחות 4 תמונות' });
      if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:'OPENAI_API_KEY is not set' });
      s.status = 'analyzing'; await save(id, s);
      const content = [{ type:'text', text:`The photos, in order (${s.photos.map((u, k) => u ? 'photo ' + (k + 1) : '').filter(Boolean).join(', ')}):` }];
      s.photos.forEach((u, k) => { if (u) content.push({ type:'text', text:`Photo ${k + 1}:` }, { type:'image_url', image_url:{ url:u, detail:'high' } }); });
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
        body:JSON.stringify({ model:VISION_MODEL, temperature:0, response_format:{ type:'json_schema', json_schema:{ name:'room_scan', strict:true, schema:SCHEMA } },
          messages:[{ role:'system', content:SYSTEM }, { role:'user', content }] }),
      });
      const j = await r.json();
      if (!r.ok) { s.status = 'capturing'; s.error = j.error?.message || `OpenAI ${r.status}`; await save(id, s); return res.status(502).json({ error:s.error }); }
      const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
      s.result = out; s.status = out.ok ? 'review' : 'capturing'; s.error = out.ok ? '' : out.problem;
      await save(id, s);
      return res.status(200).json({ result:out });
    }
    if (a === 'confirm') {
      const b = await jsonBody(req), r = b.result || s.result;
      if (!r) return res.status(400).json({ error:'אין עדיין ניתוח של החדר' });
      s.result = r; s.status = 'done'; await save(id, s);
      return res.status(200).json({ ok:true });
    }
    if (a === 'cancel') { s.status = 'cancelled'; await save(id, s); return res.status(200).json({ ok:true }); }
    return res.status(400).json({ error:'unknown action' });
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
