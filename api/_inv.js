// Shared by /api/inventory (typed / dictated / uploaded photos in the wizard) and /api/invscan (photos item by item from a phone):
// the reference objects people put next to an item, and the AI call that turns everything into the inventory table.
export const REFS = {
  none:{ he:'בלי חפץ ייחוס', en:null },
  card:{ he:'כרטיס אשראי', en:'a bank / credit card, exactly 85.60 x 53.98 mm' },
  ruler:{ he:'סרגל', en:'a ruler – read its centimetre markings' },
  a4:{ he:'דף A4', en:'an A4 sheet, 210 x 297 mm' },
  can:{ he:'פחית 330 מ"ל', en:'a 330 ml drink can, about 115 mm high and 66 mm in diameter' },
  bic:{ he:'עט BIC', en:'a BIC Cristal ballpoint pen, about 149 mm long' },
  ils1:{ he:'מטבע 1 ש"ח', en:'an Israeli 1 shekel coin, 18 mm in diameter' },
  ils_half:{ he:'מטבע חצי שקל', en:'an Israeli half shekel coin, about 26 mm in diameter' },
  ils5:{ he:'מטבע 5 ש"ח', en:'an Israeli 5 shekel coin, 24 mm in diameter' },
  ils10:{ he:'מטבע 10 ש"ח', en:'an Israeli bi-metallic 10 shekel coin, 23 mm in diameter' },
  quarter:{ he:'Quarter', en:'a US quarter dollar coin, 24.26 mm in diameter' },
  usd:{ he:'שטר דולר', en:'a US dollar bill (any value), 156 x 66 mm' },
  ils20:{ he:'שטר 20 ש"ח', en:'an Israeli 20 shekel banknote, 129 x 71 mm' },
  ils50:{ he:'שטר 50 ש"ח', en:'an Israeli 50 shekel banknote, 136 x 71 mm' },
  ils100:{ he:'שטר 100 ש"ח', en:'an Israeli 100 shekel banknote, 143 x 71 mm' },
  ils200:{ he:'שטר 200 ש"ח', en:'an Israeli 200 shekel banknote, 150 x 71 mm' },
  eur5:{ he:'שטר 5 יורו', en:'a 5 euro banknote, 120 x 62 mm' },
  eur10:{ he:'שטר 10 יורו', en:'a 10 euro banknote, 127 x 67 mm' },
  eur20:{ he:'שטר 20 יורו', en:'a 20 euro banknote, 133 x 72 mm' },
  eur50:{ he:'שטר 50 יורו', en:'a 50 euro banknote, 140 x 77 mm' },
};
export const KINDS = ['small_parts', 'electronics', 'hand_tools', 'power_tools', 'boxed_goods', 'heavy', 'long_items', 'personal', 'consumables', 'chemicals', 'documents', 'mobile', 'other'];
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1';

const num = { type:['number', 'null'] };
const SCHEMA = {
  type:'object', additionalProperties:false, required:['rows', 'questions'],
  properties:{
    rows:{ type:'array', items:{ type:'object', additionalProperties:false,
      required:['name', 'kind', 'length_cm', 'width_cm', 'height_cm', 'qty', 'unit', 'weight_kg', 'freq', 'notes', 'from_photo', 'size_basis'],
      properties:{
        name:{ type:'string', description:'the item, in Hebrew, short' },
        kind:{ type:'string', enum:KINDS, description:'small_parts = screws / nuts / washers / small spare parts; electronics = components, boards; hand_tools; power_tools; boxed_goods = cartons / packed goods; heavy = heavy items (motors, castings); long_items = pipes, profiles, rods; personal = workers\' personal gear / clothes / bags; consumables = gloves, tape, sprays; chemicals = oils, lubricants, chemicals; documents = files / binders; mobile = gear that moves between workstations; other' },
        length_cm:num, width_cm:num, height_cm:num,
        qty:{ type:['number', 'null'], description:'how many – only if the user said / wrote it (never guess a quantity from a photo)' },
        unit:{ type:'string', enum:['pcs', 'boxes', 'bags', 'packs', 'sets', 'other'] },
        weight_kg:num,
        freq:{ type:['string', 'null'], enum:['daily', 'weekly', 'rare', null], description:'how often it is taken out, only if said' },
        notes:{ type:'string', description:'anything else the user said about it (locked, sensitive, kept together…), short; empty if nothing' },
        from_photo:{ type:'boolean', description:'true when the sizes are your estimate from a photo' },
        size_basis:{ type:'string', description:'Hebrew, very short: what the size is based on – "לפי כרטיס אשראי", "לפי סרגל", "הערכה גסה (אין חפץ ייחוס)", "לפי מה שנכתב"' },
      } } },
    questions:{ type:'array', items:{ type:'string' }, description:'at most 3 short questions in Hebrew about what is missing and matters for planning (mainly quantities); empty if nothing' },
  },
};
const SYSTEM = [
  'You build an inventory table for planning a storage space (workshop / warehouse / lab) from the client\'s description and / or photos of the items.',
  'One row per kind of item. Keep the client\'s words for the names. Sizes: from the text when given (convert to cm). From a photo, measure the item against the REFERENCE OBJECT named for that photo (its exact size is given): compare the item to it in the same plane, mind perspective, and set from_photo true. With no reference object, estimate from what is visible and say it is rough in size_basis.',
  'Sizes given by the user for a photo override your estimate. Never invent quantities: qty only when the client said / wrote it.',
  'Merge with the rows that already exist (given below): update a row that is the same item instead of adding it again, and return the FULL table.',
  'Write names, notes, size_basis and questions in Hebrew.',
].join('\n');

// items: [{ url, ref, note, dims:{ l, w, h } }] – photos with what was said about each; text: free text; rows: the table so far
export async function analyzeInventory({ text = '', items = [], rows = [] }) {
  const content = [{ type:'text', text:`Existing rows: ${JSON.stringify(rows.slice(0, 80))}\n\nClient text:\n${text || '(none)'}` }];
  items.forEach((it, k) => {
    const R = REFS[it.ref] || REFS.none, d = it.dims || {};
    content.push({ type:'text', text:`Photo ${k + 1}. Reference object next to the item: ${R.en || 'none'}.${it.note ? ` The user said about it: "${String(it.note).slice(0, 400)}".` : ''}${d.l || d.w || d.h ? ` The user measured it: ${[d.l, d.w, d.h].map(v => v || '?').join(' x ')} cm.` : ''}` });
    content.push({ type:'image_url', image_url:{ url:it.url, detail:'high' } });
  });
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
    body:JSON.stringify({ model:VISION_MODEL, temperature:0, response_format:{ type:'json_schema', json_schema:{ name:'inventory', strict:true, schema:SCHEMA } },
      messages:[{ role:'system', content:SYSTEM }, { role:'user', content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `OpenAI error ${r.status}`);
  const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
  return { rows:(out.rows || []).slice(0, 80), questions:(out.questions || []).slice(0, 3) };
}
export const INV_SCHEMA = SCHEMA;
