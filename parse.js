// Splits the free text (typed or dictated, usually Hebrew) of the render notes into the render brief fields.
// Admin only. The model only sorts and tidies the client's own words – it never invents.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  const text = String(req.body?.text || '').slice(0, 4000);
  const cur = req.body?.fields || {};
  const clip = (v) => String(v || '').slice(0, 1500);
  const current = { contents:clip(cur.contents), background:clip(cur.background), extra:clip(cur.extra) };
  if (!text.trim()) return res.status(400).json({ error: 'אין טקסט לפרש' });

  const schema = {
    type:'object', additionalProperties:false, required:['contents', 'background', 'extra'],
    properties:{
      contents:{ type:'string', description:'what goes INSIDE the tilt bins / drawers (items, colours, how full, which bins hold what)' },
      background:{ type:'string', description:'the room and surroundings: walls, what hangs on nearby walls, floor, furniture and props around the products, the kind of space' },
      extra:{ type:'string', description:'anything else to pay attention to: mood, lighting, style, people, things to avoid, emphasis' },
    },
  };
  const system = [
    'You sort a client brief for a product photo of storage units with clear tilt-out bins (the products themselves come from a 3D model and are never described here).',
    'Split the client text into three fields: contents (inside the bins), background (room and surroundings), extra (everything else that matters).',
    'Write every field in the language of the client text (usually Hebrew), in short clear phrases, keeping the client\'s own words and every detail. Do NOT invent anything. A field with nothing for it stays an empty string.',
    'The client may already have edited the current fields: keep what is there, and merge the new text into it without repeating what is already written. If the new text contradicts a current field, the new text wins.',
    'Ignore requests to change the products (their size, colour, number of bins): those come from the 3D model; mention such a request in extra as "לא ניתן לשנות את המוצר מההערות" only if the client asked for it.',
  ].join('\n');
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({
        model:TEXT_MODEL, temperature:0,
        response_format:{ type:'json_schema', json_schema:{ name:'render_brief', strict:true, schema } },
        messages:[
          { role:'system', content:system },
          { role:'user', content:`Current fields:\n${JSON.stringify(current, null, 1)}\n\nNew client text:\n${text}` },
        ],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:j.error?.message || `OpenAI error ${r.status}` });
    const v = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    return res.status(200).json({ fields:{ contents:clip(v.contents), background:clip(v.background), extra:clip(v.extra) } });
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
