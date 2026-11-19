// Planning wizard – step "what do you store": turns the client's own description (typed or dictated, usually Hebrew)
// and / or photos of the items into a table: item, size, quantity, how often it is picked, its kind.
// Admin only. The model reads and estimates – sizes from photos are rough and the user confirms them.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1';

const KINDS = ['small_parts', 'electronics', 'hand_tools', 'power_tools', 'boxed_goods', 'heavy', 'long_items', 'personal', 'consumables', 'chemicals', 'documents', 'mobile', 'other'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  const text = String(req.body?.text || '').slice(0, 6000);
  const images = (Array.isArray(req.body?.images) ? req.body.images : []).filter(u => typeof u === 'string' && /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(u)).slice(0, 6);
  const have = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 80) : [];
  if (!text.trim() && !images.length) return res.status(400).json({ error: 'אין טקסט או תמונה לנתח' });

  const num = { type:['number', 'null'] };
  const schema = {
    type:'object', additionalProperties:false, required:['rows', 'questions'],
    properties:{
      rows:{ type:'array', items:{ type:'object', additionalProperties:false,
        required:['name', 'kind', 'length_cm', 'width_cm', 'height_cm', 'qty', 'unit', 'weight_kg', 'freq', 'notes', 'from_photo'],
        properties:{
          name:{ type:'string', description:'the item, in the user\'s language (Hebrew), short' },
          kind:{ type:'string', enum:KINDS, description:'small_parts = screws / nuts / washers / small spare parts; electronics = components, boards; hand_tools; power_tools; boxed_goods = cartons / packed goods; heavy = heavy items (motors, castings); long_items = pipes, profiles, rods; personal = workers\' personal gear / clothes / bags; consumables = gloves, tape, sprays; chemicals = oils, lubricants, chemicals; documents = files / binders; mobile = gear that moves between workstations; other' },
          length_cm:num, width_cm:num, height_cm:num,
          qty:{ type:['number', 'null'], description:'how many – only if the user said it (never guess a quantity from a photo)' },
          unit:{ type:'string', enum:['pcs', 'boxes', 'bags', 'packs', 'sets', 'other'] },
          weight_kg:num,
          freq:{ type:['string', 'null'], enum:['daily', 'weekly', 'rare', null], description:'how often it is taken out, only if said' },
          notes:{ type:'string', description:'anything else the user said about it (locked, sensitive, kept together…), short; empty if nothing' },
          from_photo:{ type:'boolean', description:'true when the sizes are your estimate from a photo (rough)' },
        } } },
      questions:{ type:'array', items:{ type:'string' }, description:'at most 3 short questions in Hebrew about what is missing and matters for planning (mainly quantities); empty if nothing' },
    },
  };
  const system = [
    'You build an inventory table for planning a storage space (workshop / warehouse / lab) from the client\'s description and / or photos of the items.',
    'One row per kind of item. Keep the client\'s words for the names. Sizes: from the text when given (convert to cm); from a photo estimate them from what is visible (a hand, a standard box, a pallet) and set from_photo true; otherwise null.',
    'Never invent quantities: qty only when the client said it. Merge with the rows that already exist (given below): update a row that is the same item instead of adding it again, and return the FULL table.',
    'Write names, notes and questions in Hebrew.',
  ].join('\n');
  const content = [{ type:'text', text:`Existing rows: ${JSON.stringify(have)}\n\nClient text:\n${text || '(none – photos only)'}` }];
  images.forEach((u, k) => content.push({ type:'text', text:`Photo ${k + 1}:` }, { type:'image_url', image_url:{ url:u, detail:'high' } }));
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({
        model:VISION_MODEL, temperature:0,
        response_format:{ type:'json_schema', json_schema:{ name:'inventory', strict:true, schema } },
        messages:[{ role:'system', content:system }, { role:'user', content }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:j.error?.message || `OpenAI error ${r.status}` });
    const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    out.rows = (out.rows || []).slice(0, 80); out.questions = (out.questions || []).slice(0, 3);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
