// Recreate a real space from photos (often poor ones): the room, its doors / windows, and the storage that stands in it –
// matched to the closest catalogue products, wall by wall and in order – so the app can rebuild it as a clean 3D scene
// (and a high-end render that stays true to the original). It also lists what it saw and what has no match in the catalogue.
// Admin only. Same plan shape as /api/design, so the app's layout engine places the products.
import { isAdmin } from './_auth.js';
import { KNOWLEDGE, planSchema } from './design.js';

export const config = { maxDuration: 60 };
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1';
const PTYPES = ['unit', 'stand', 'excl', 'part', 'quad', 'wall', 'tena', 'smart', 'tamb', 'mtamb', 'mdoor', 'tech', 'arc', 'furn', 'lock', 'wb'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:'OPENAI_API_KEY is not set' });
  const images = (Array.isArray(req.body?.images) ? req.body.images : []).filter(u => typeof u === 'string' && /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(u)).slice(0, 4);
  const note = String(req.body?.note || '').slice(0, 1500);
  if (!images.length) return res.status(400).json({ error:'העלו לפחות תמונה אחת של החלל' });

  const { schema } = planSchema();
  schema.required = [...schema.required, 'seen', 'look'];
  schema.properties.seen = { type:'array', description:'everything storage-related you see, one line per kind of thing', items:{ type:'object', additionalProperties:false,
    required:['what', 'count', 'where', 'match_type', 'match', 'confidence'],
    properties:{
      what:{ type:'string', description:'Hebrew: what it is in the photo, short (e.g. "ארון כחול גבוה עם 2 דלתות")' },
      count:{ type:'integer' },
      where:{ type:'string', description:'Hebrew: where (e.g. "קיר אחורי, משמאל")' },
      match_type:{ anyOf:[{ type:'string', enum:PTYPES }, { type:'null' }], description:'the catalogue product you used for it; null = nothing in the catalogue is close' },
      match:{ type:'string', description:'Hebrew: the catalogue product name, or why there is no match (e.g. "מידוף כבד – אין בקטלוג")' },
      confidence:{ type:'string', enum:['high', 'medium', 'low'] },
    } } };
  schema.properties.look = { type:'object', additionalProperties:false, required:['style', 'floor', 'wall_color', 'description_en', 'description_he'], properties:{
    style:{ type:'string', description:'one or two words: industrial / clinic / office / store …' },
    floor:{ type:'string', description:'English: the floor material and colour' },
    wall_color:{ type:'string', description:'English: the wall colour / finish' },
    description_en:{ type:'string', description:'English, 2–4 sentences: the space as it is (light, ceiling, materials, what is around the storage) – used to keep the realistic render true to the original' },
    description_he:{ type:'string', description:'Hebrew, one sentence: the background of the space' },
  } };

  const system = [
    KNOWLEDGE,
    'NOW YOU RECREATE A REAL SPACE FROM PHOTOS (they may be dark, blurry, partial or from bad angles). Be faithful: rebuild what is THERE, not a better design.',
    'Room: estimate width (along the back wall, the wall you face in the main photo) and depth in metres. Use known sizes as rulers: our cabinets are 195 cm high, tilt-bin units 60 cm wide, doors ~90 x 210 cm, ceilings ~280–300 cm, floor tiles 60 cm. Walls you cannot see: assume they exist unless the space is clearly open. Doors and windows you see go in openings, with offset_cm from the left end (back / front wall) or from the back end (side walls).',
    'Storage: for every group of products that stand together, one zone of kind wall_storage (against a wall) or island (free-standing in the middle), with the CLOSEST catalogue product (mdoor is light grey only, tech is blue; a blue 2-door cabinet with shelves is closest to tech) and the count you see. Give offset_cm = where the run starts along its wall, so the order of things along each wall stays as in the photos; split a wall into several zones when different products stand there. Workbenches → benches zone with wb; desks / workstations → workstations zone with furn station; carts → carts zone. Things that only hang on a wall with bins → wall (rack).',
    'Things with no close catalogue product (heavy pallet racking, a fridge, machines, generic shelving units): do NOT invent a product – list them in seen with match_type null, and in notes say what was left out. Shelving units that look like 2-door / open steel cabinets may use mdoor.',
    'clear_scene true (this is a new scene). understood: one Hebrew sentence of what you recreate. notes: Hebrew, short – what was uncertain and what was left out.',
    'Fill look from the photos (the realistic render uses it to stay true to the original).',
  ].join('\n\n');
  const content = [{ type:'text', text:`Photos of the space (${images.length}).${note ? ` The user says: ${note}` : ''}` }];
  images.forEach((u, k) => content.push({ type:'text', text:`Photo ${k + 1}:` }, { type:'image_url', image_url:{ url:u, detail:'high' } }));
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({ model:VISION_MODEL, temperature:0.1, response_format:{ type:'json_schema', json_schema:{ name:'scene_recreate', strict:true, schema } },
        messages:[{ role:'system', content:system }, { role:'user', content }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:j.error?.message || `OpenAI error ${r.status}` });
    const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    out.zones = (out.zones || []).slice(0, 30); out.seen = (out.seen || []).slice(0, 40);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
