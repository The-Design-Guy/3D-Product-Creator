// Turns a spoken / typed request (usually Hebrew) into actions on the 3D scene:
// add / move / turn / duplicate / delete products, change their settings, open bins and doors,
// set what goes inside the bins (for the realistic render), change the room.
// Admin only. The model only uses the product catalogue and the products listed with the request.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';

const TYPES = ['unit', 'stand', 'excl', 'part', 'quad', 'wall', 'tena', 'smart', 'tamb', 'mtamb', 'mdoor'];
const OPS = ['add', 'move', 'move_to', 'rotate', 'rotate_to', 'delete', 'duplicate', 'set', 'bins', 'doors', 'tambour', 'contents', 'select', 'room', 'clear', 'commit'];

const CATALOGUE = `
Product types (type key – Hebrew name – footprint width x depth in cm with rot 0 – what can be set):
- unit – "רב תא" – a single tilt-bin unit, 60 x 20 – unit_bins (2,3,4,5,6,9 = the model / number of bins).
- stand – "מעמד" / "עגלה ומעמד לרב תא" – 60 x 42 – stand_type (single / double sided), base (wheels / legs), height_cm (116, 180 or 200), comp.
- excl – "עגלת רב-תא EXCLUSIVE" / "עגלת אקסקלוסיב" – double-sided closed cart, 66 x 39, 110–150 cm high – comp (models 4,5,6,9), top (black / white ABS).
- part – "מחיצת EXCLUSIVE מודולרית" / "מחיצה" – double-sided room-divider, width 30 + cols x 63 cm (2 cols ≈ 129, 3 ≈ 192, 4 ≈ 255), depth ≈ 40–60, up to 215 cm high – cols (2,3,4), comp (models 3,4,5,6,9), top.
- quad – "מעמד 4 דפנות" – four-sided tilt-bin tower, ≈ 80 x 80 – comp (each level one model; 160–200 cm of bins), base (wheels / legs), top.
- wall – "מתלה קיר" – wall rack, 60 wide, 1 deep, hangs on a wall – height_cm (60, 120 or 200), comp.
- tena – "תא-נע DELUX" – closed gondola cabinet with sliding wings, 220 cm high; tena_size 4 → 127 x 63, 7 → 190 x 63, 10 → 250 x 63 – tena_size, doors (lockable sliding doors exist only for size 4 or 10).
- smart – "תא-נע SMART" – open steel gondola rack, 135 x 68, 210 cm high.
- tamb – "ארון מתכת מאובטח לרב תא" – 67 x 45, 195 high, tambour (roller shutter) front, a stack of tilt bins inside – comp (models 3,4,5,6,9), align (back / front).
- mtamb – "ארון תריס" – metal tambour cabinet with shelves, 90 x 45, 195 high.
- mdoor – "ארון 4 מדפים" – metal cabinet with 2 hinged doors, 90 x 40, 195 high – md_color (blue / 7035 = light grey).
comp = how many tilt-bin units of each model, e.g. [{model:4,count:9}] (model = number of bins in the unit: 2,3,4,5,6,9; bigger ones at the bottom automatically). For "add one more level of #5" give the FULL new comp.
Room coordinates: x_cm = distance of the product's CENTRE from the LEFT wall, z_cm = distance of its CENTRE from the BACK wall (as seen from the front of the room).
rot: 0 = the product's front faces the viewer (away from the back wall); 90 = turned a quarter clockwise seen from above (front faces the right wall); 180 = facing the back wall; 270 = facing the left wall.
Moving: dx_cm > 0 = to the right (as seen from the front of the room), dx_cm < 0 = left, dz_cm > 0 = toward the front / the viewer, dz_cm < 0 = toward the back wall, dy_cm = up / down.
Turning: deg > 0 = clockwise seen from above ("ימינה"), deg < 0 = counter-clockwise ("שמאלה").
`;

const nul = (t) => ({ anyOf:[t, { type:'null' }] });
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  const text = String(req.body?.text || '').slice(0, 4000);
  if (!text.trim()) return res.status(400).json({ error: 'אין טקסט לפרש' });
  const room = req.body?.room || {};
  const existing = Array.isArray(req.body?.items) ? req.body.items.slice(0, 60) : [];
  const models = req.body?.models && typeof req.body.models === 'object' ? req.body.models : {};
  const selected = req.body?.selected ?? null;
  const editor = req.body?.context === 'product_editor';

  const settings = nul({
    type:'object', additionalProperties:false,
    required:['stand_type', 'base', 'height_cm', 'comp', 'cols', 'top', 'tena_size', 'doors', 'unit_bins', 'md_color', 'align'],
    properties:{
      stand_type:nul({ type:'string', enum:['single', 'double'] }),
      base:nul({ type:'string', enum:['wheels', 'legs'] }),
      height_cm:nul({ type:'number' }),
      comp:nul({ type:'array', items:{ type:'object', additionalProperties:false, required:['model', 'count'], properties:{ model:{ type:'integer', enum:[2, 3, 4, 5, 6, 9] }, count:{ type:'integer' } } } }),
      cols:nul({ type:'integer', enum:[2, 3, 4] }),
      top:nul({ type:'string', enum:['black', 'white'] }),
      tena_size:nul({ type:'integer', enum:[4, 7, 10] }),
      doors:nul({ type:'boolean' }),
      unit_bins:nul({ type:'integer', enum:[2, 3, 4, 5, 6, 9] }),
      md_color:nul({ type:'string', enum:['blue', '7035'] }),
      align:nul({ type:'string', enum:['back', 'front'] }),
    },
  });
  const bins = nul({ type:'object', additionalProperties:false, required:['face', 'rows', 'cols', 'random', 'all'], properties:{
    face:{ type:'string', enum:['front', 'back', 'left', 'right', 'all'], description:'which side of the product (as listed in its faces); "front" when not said' },
    rows:{ type:'array', items:{ type:'integer' }, description:'row numbers counted from the TOP (1 = top row); negative counts from the bottom (-1 = bottom row); empty = every row' },
    cols:{ type:'array', items:{ type:'integer' }, description:'bin numbers in the row counted from the LEFT as you face that side (1 = leftmost); negative from the right; empty = every bin' },
    random:{ type:'integer', description:'>0: open / close only this many bins chosen at random among the selected ones' },
    all:{ type:'boolean', description:'true = every bin of the product on every side' } } });
  const op = { type:'object', additionalProperties:false,
    required:['op', 'target', 'type', 'saved_model', 'count', 'name', 'settings', 'x_cm', 'z_cm', 'rot', 'row', 'dx_cm', 'dz_cm', 'dy_cm', 'deg', 'open', 'bins', 'which', 'text', 'room'],
    properties:{
      op:{ type:'string', enum:OPS },
      target:nul({ type:'integer', description:'id of the product the action is about; null = the selected product (or, right after an add, the product just added)' }),
      type:nul({ type:'string', enum:TYPES }),
      saved_model:nul({ type:'string', description:'exact name of one of the user\'s saved models (add only)' }),
      count:nul({ type:'integer' }),
      name:nul({ type:'string' }),
      settings,
      x_cm:nul({ type:'number' }), z_cm:nul({ type:'number' }), rot:nul({ type:'number' }),
      row:nul({ type:'string', enum:['x', 'z'], description:'add with count > 1: copies side by side along x or along z' }),
      dx_cm:nul({ type:'number' }), dz_cm:nul({ type:'number' }), dy_cm:nul({ type:'number' }),
      deg:nul({ type:'number' }),
      open:nul({ type:'boolean' }),
      bins,
      which:nul({ type:'string', enum:['all', 'left', 'right'], description:'doors: which door(s)' }),
      text:nul({ type:'string', description:'contents: what goes inside the bins of this product (for the realistic render), in the user\'s words' }),
      room:nul({ type:'object', additionalProperties:false, required:['width_m', 'depth_m', 'back', 'left', 'right'], properties:{
        width_m:{ type:'number' }, depth_m:{ type:'number' }, back:{ type:'boolean' }, left:{ type:'boolean' }, right:{ type:'boolean' } } }),
    } };
  const schema = { type:'object', additionalProperties:false, required:['understood', 'ops'], properties:{
    understood:{ type:'string', description:'one short sentence, in the language of the request, saying what you did' },
    ops:{ type:'array', items:op } } };

  const system = [
    'You control a 3D showroom scene of storage furniture (tilt-bin units and the stands, carts and cabinets that hold them). Turn the user\'s request into a list of actions (ops), in order.',
    CATALOGUE,
    'Ops:',
    '- add: type (+ saved_model, settings, count, name), x_cm, z_cm, rot, row. Place sensibly inside the room, not overlapping other products, with walking space between them unless asked otherwise.',
    '- move: dx_cm / dz_cm / dy_cm relative. move_to: x_cm / z_cm absolute. rotate: deg relative. rotate_to: rot absolute.',
    '- duplicate: count copies (default 1). delete. select (make it the selected product). clear: remove every product.',
    '- set: change settings of an existing product (only the settings the user mentioned; the rest null).',
    '- bins: open (true/false) bins / drawers of a product – bins.all, or a face with rows / cols, or random. "תפתח את התאים / הידיות / המגירות" = bins.',
    '- doors: open (true/false) the doors (mdoor hinged doors, tena sliding doors), which = all / left / right. tambour: open (true/false) the roller shutter of tamb / mtamb.',
    '- contents: text = what is inside the bins of that product for the realistic render ("שים ברגים ירוקים" → contents "ברגים ירוקים"). The 3D model does not show contents.',
    '- room: change the room size / walls.',
    '"המתקן הזה / המוצר הזה / זה" = the selected product (target null). Products can also be named by their name, type or position ("המחיצה השנייה", "זה שליד הקיר").',
    ...(editor ? [
      'CONTEXT: the user is in the PRODUCT EDITOR, setting up ONE product before it goes into the scene (it is the selected product, if any). There is no room here: never use move / rotate / room / clear / select / duplicate / delete.',
      'Use: set (change its settings), bins, doors, tambour, contents; "add" (with type, saved_model, settings) only to switch to / pick another product to set up; "commit" = add the product being set up to the scene (count = how many times, e.g. "תוסיף שלושה כאלה לסצנה" → commit count 3).',
    ] : ['Never use commit.']),
    'Every field that is not used by an op is null. Use only the product ids listed. Do not invent things the user did not ask for.',
  ].join('\n');
  const user = `Room now: ${JSON.stringify(room)}\nSelected product id: ${selected === null ? 'none' : selected}\nProducts in the scene: ${JSON.stringify(existing)}\nSaved models per type: ${JSON.stringify(models)}\n\nRequest:\n${text}`;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({
        model:TEXT_MODEL, temperature:0,
        response_format:{ type:'json_schema', json_schema:{ name:'scene_ops', strict:true, schema } },
        messages:[{ role:'system', content:system }, { role:'user', content:user }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:j.error?.message || `OpenAI error ${r.status}` });
    const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    out.ops = (out.ops || []).filter(o => OPS.includes(o.op)).slice(0, 40)
      .map(o => ({ ...o, count:o.count === null ? null : Math.max(1, Math.min(12, Math.round(o.count))) }));
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
