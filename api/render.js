import { TILTBIN_REF } from './_tiltbin_ref.js';
// Realistic product photo from the current 3D view, via the OpenAI Images "edits" endpoint.
// Admin only (it spends API credit). The key never leaves the server.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 300 };

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';
// model that checks the bin count of the result against the 3D view (any OpenAI model that reads images)
const CHECK_MODEL = process.env.OPENAI_CHECK_MODEL || 'gpt-4.1';

function prompt(description, background, lighting, notes, refCount, structure, productRef) {
  return [
    refCount
      ? `You receive ${refCount + 1 + (productRef ? 1 : 0)} images. The FIRST image is the 3D viewport render of the product: turn it into a photorealistic studio product photograph of the exact same object. ${productRef ? 'The images between the first and the last one are client reference files' : 'The other images are client reference files'}, numbered in order: image 2 = "קובץ 1" (file 1)${refCount > 1 ? `, image 3 = "קובץ 2" (file 2)` : ''}${refCount > 2 ? `, image 4 = "קובץ 3" (file 3)` : ''}${refCount > 3 ? `, image 5 = "קובץ 4" (file 4)` : ''}. Use a reference file ONLY in the way the client notes ask (for example as a background, or as the items to show inside the bins). If the notes do not mention a file, ignore it. Never copy the product from a client file.`
      : `${productRef ? 'You receive 2 images. The FIRST image is the 3D viewport render of the product: turn' : 'Turn'} this 3D viewport render into a photorealistic studio product photograph of the exact same object.`,
    productRef ? `The LAST image is an official catalogue photo of ONE real tilt-bin unit (a 5-bin unit). Use it ONLY as the construction and material reference for every tilt-bin unit in the result: the light grey housing with flat, solid side walls that run the full depth of the unit, its rounded edges, the clear angled bin fronts with their label window and small screw, and exactly how each clear bin sits INSIDE the housing between the side walls – a bin never sticks out past the side walls and its clear sides are hidden by the housing, only the clear front shows. Do NOT copy its number of bins, its size, angle or position: the units, their sizes and the number of bins come ONLY from the FIRST image.` : '',
    `Product: ${description}`,
    'Keep EVERYTHING about the object identical: geometry, proportions, number of bins and units, their order, the camera angle, framing and perspective.',
    'Do not add, remove, move or redesign any part of the product. Do not add text or logos.',
    notes
      ? 'Client notes (may be in Hebrew). Apply them ONLY to the background, the surroundings, props around the product and the contents placed inside the bins/drawers; never to the product\'s shape, size, colours or construction:\n<<' + notes + '>>'
      : 'Do not add extra objects.',
    notes && background === 'transparent' ? 'The background must stay fully transparent: ignore any background request in the notes, apply only what concerns the bin contents.' : '',
    // the structure lock comes AFTER the notes on purpose: the last instructions weigh the most
    'STRUCTURE LOCK – this overrides everything above, including the client notes:',
    structure ? `Exact layout from the CAD data:\n${structure}\nGo through this layout column by column and row by row: every row of the result must have exactly the number of bins listed (a 6-bin unit is a row of exactly 6 bins, never 5 or 7).` : '',
    'Before drawing, count in the FIRST image every unit, every column, every row and every single bin (drawer), from left to right and from top to bottom. The result must have EXACTLY the same number of units, columns, rows and bins, in the same arrangement and sizes. Never add, remove, merge, split, enlarge or shrink bins, rows, columns, shelves or units.',
    'PROFILES AND HARDWARE: every aluminium or steel profile, rail, band, upright and frame keeps exactly the cross-section, width, thickness, slots, rounded corners, colour and finish it has in the FIRST image, and the joints stay exactly as drawn. Do not add screws, bolts, rivets, brackets, connectors, wall plugs, end caps, holes, labels or any fitting that is not in the first image.',
    notes ? 'Anything the notes ask to put "in the bins" goes INSIDE the bins that already exist, behind their clear fronts; it never creates new bins or changes how many there are. If a note cannot be done without changing the count, ignore that part of the note.' : '',
    'Make the materials real: matte powder-coated / injection-moulded light grey RAL 7035 plastic, crystal-clear polystyrene bins with real refraction, subtle reflections and slightly brighter edges where the plastic is thick, brushed metal where there is metal.',
    background === 'transparent'
      ? 'Isolated product with a fully transparent background, no floor and no shadow outside the object.'
      : 'Seamless light grey-white studio background with a soft natural contact shadow under the product.',
    `Lighting: ${lighting || 'soft, even professional catalogue lighting.'}`,
  ].filter(Boolean).join('\n');
}

// stage 2 of the two-stage render: the approved, empty base photo is edited – only additions from the notes
function editPrompt(description, background, notes, refCount, structure) {
  return [
    `You receive ${refCount + 1} image${refCount ? 's' : ''}. The FIRST image is an approved photorealistic photograph of the product(s) with EMPTY bins. EDIT this photograph: keep every product, unit, bin, profile, frame, wall and floor, the materials, the lighting, the camera angle, perspective and framing exactly as they are – the result must look like the same photograph with things added.`,
    refCount ? `The other images are client reference files, numbered in order: image 2 = "קובץ 1" (file 1)${refCount > 1 ? `, image 3 = "קובץ 2" (file 2)` : ''}${refCount > 2 ? `, image 4 = "קובץ 3" (file 3)` : ''}${refCount > 3 ? `, image 5 = "קובץ 4" (file 4)` : ''}. Use a file ONLY in the way the client notes ask. If the notes do not mention a file, ignore it. Never copy a product from a client file.` : '',
    `Product: ${description}`,
    notes
      ? 'Client notes (may be in Hebrew). Carry them out by ADDING things: contents inside the existing bins, props and decoration around the products, items in the room. Never change, move, resize or recolour the products themselves:\n<<' + notes + '>>'
      : 'Do not add anything.',
    notes && background === 'transparent' ? 'The background must stay fully transparent: ignore any background request in the notes, apply only what concerns the bin contents.' : '',
    'STRUCTURE LOCK – this overrides everything above, including the client notes:',
    structure ? `Exact layout of the products in the photograph:\n${structure}\nEvery row of the result must keep exactly the number of bins listed (a 6-bin unit is a row of exactly 6 bins, never 5 or 7).` : '',
    'Keep EXACTLY the units, columns, rows and bins of the FIRST image: never add, remove, merge, split, enlarge or shrink bins, rows, columns, shelves or units. Every profile, rail, upright, side wall and frame keeps its shape, width, colour and finish; add no screws, brackets or fittings. The clear bins stay INSIDE their grey housings.',
    notes ? 'Anything the notes ask to put "in the bins" goes INSIDE the bins that already exist, behind their clear fronts; it never creates new bins or changes how many there are. If a note cannot be done without changing the products, ignore that part of the note.' : '',
    'New items get the same lighting as the photograph, with natural contact shadows.',
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });

  const { image, background = 'transparent', description = '' } = req.body || {};
  const lighting = String(req.body?.lighting || '').slice(0, 300);
  // stage: 'base' = empty photo from the 3D view (notes and files are left for stage 2), 'edit' = edit the approved base, none = one stage
  const stage = ['base', 'edit'].includes(req.body?.stage) ? req.body.stage : '';
  const notes = stage === 'base' ? '' : String(req.body?.notes || '').replace(/[<>]/g, '').slice(0, 1200);
  const structure = String(req.body?.structure || '').replace(/[<>]/g, '').slice(0, 4000);
  const t0 = Date.now();
  // output size: WIDTHxHEIGHT, edges multiple of 16, each ≤ 3840, ratio ≤ 3:1, 655,360–8,294,400 pixels
  let size = 'auto';
  const sm = /^(\d{3,4})x(\d{3,4})$/.exec(String(req.body?.size || ''));
  if (sm) {
    const w = +sm[1], h = +sm[2];
    const ok = w % 16 === 0 && h % 16 === 0 && Math.max(w, h) <= 3840 && Math.max(w, h) / Math.min(w, h) <= 3 && w*h >= 655360 && w*h <= 8294400;
    if (!ok) return res.status(400).json({ error: 'גודל תמונה לא חוקי' });
    size = `${w}x${h}`;
  }
  const m = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(image || '');
  if (!m) return res.status(400).json({ error: 'expected a data:image/... base64 image' });

  // reference images (up to 4), already shrunk by the browser
  const refs = [];
  for (const r of (stage !== 'base' && Array.isArray(req.body?.refs) ? req.body.refs : []).slice(0, 4)) {
    const rm = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(String(r || ''));
    if (!rm) return res.status(400).json({ error: 'קובץ ייחוס לא תקין (רק JPG, PNG, WebP)' });
    refs.push(rm);
  }
  const blob = (mm) => new Blob([Buffer.from(mm[2], 'base64')], { type: `image/${mm[1]}` });
  const ext = (mm) => (mm[1] === 'jpeg' ? 'jpg' : mm[1]);

  // with tilt bins in the picture, a real catalogue photo of one unit goes last, as the construction reference
  const productRef = !!structure && stage !== 'edit';
  const pm = TILTBIN_REF.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  const form = new FormData();
  form.append('model', MODEL);
  if (refs.length || productRef) {
    // several input images: the view first, then the client files in order, then the product reference
    form.append('image[]', blob(m), stage === 'edit' ? `base.${ext(m)}` : `view.${ext(m)}`);
    refs.forEach((rm, i) => form.append('image[]', blob(rm), `file-${i + 1}.${ext(rm)}`));
    if (productRef) form.append('image[]', blob(pm), 'tilt-bin-reference.webp');
  } else {
    form.append('image', blob(m), `view.${ext(m)}`);
  }
  form.append('prompt', stage === 'edit'
    ? editPrompt(String(description).slice(0, 2000), background, notes, refs.length, structure)
    : prompt(String(description).slice(0, 2000), background, lighting, notes, refs.length, structure, productRef));
  form.append('background', background === 'transparent' ? 'transparent' : 'opaque');
  form.append('output_format', 'webp');          // smaller response than PNG, keeps transparency
  form.append('output_compression', '95');
  form.append('quality', QUALITY);
  form.append('size', size);

  try {
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || `OpenAI error ${r.status}` });
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'OpenAI returned no image' });
    const out = `data:image/webp;base64,${b64}`;
    // count check: compare the bins in the result with the 3D view (skipped when time is short)
    const check = Date.now() - t0 < 220000 ? await checkCount(image, out, structure, productRef ? TILTBIN_REF : null, stage === 'edit') : { ok:null, detail:'time' };
    return res.status(200).json({ image: out, check });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ---- bin count check ----
// Reads the 3D view and the result, counts the bins in both, and says whether they match.
// ok: true (match) | false (mismatch) | null (the check could not run – never blocks the render)
async function checkCount(view, result, structure, ref, fromPhoto) {
  const schema = {
    type:'object', additionalProperties:false,
    required:['view_counts', 'result_counts', 'match', 'problem', 'parts_ok', 'parts_problem'],
    properties:{
      view_counts:{ type:'string', description:'bins in each row, top to bottom, per column left to right, in the 3D view, e.g. "col1: 9,6,6,5 | col2: ..."' },
      result_counts:{ type:'string', description:'the same, row by row, counted in the realistic result' },
      match:{ type:'boolean' },
      problem:{ type:'string', description:'empty if they match; otherwise a short Hebrew description of the difference, naming the column and the row from the top' },
      parts_ok:{ type:'boolean', description:'true if the profiles/rails/frames in B keep the shape, width and colour of A and B adds no screws, bolts, brackets, connectors or other hardware that A does not have' },
      parts_problem:{ type:'string', description:'empty if parts_ok; otherwise a short Hebrew description of what changed or was added' },
    },
  };
  const instructions = [
    fromPhoto
      ? 'Image A is an approved photograph of storage products built from tilt-bin units (grey plastic housings holding clear tilt-out bins), with empty bins. Image B is an edited version of A with items added; the products themselves must be exactly the same as in A.'
      : 'Image A is a 3D CAD viewport of a storage product built from tilt-bin units: grey plastic frames holding clear tilt-out bins (drawers). Image B is a photo-realistic rendering that must show exactly the same product.',
    'Count carefully in BOTH images, unit by unit and column by column, left to right and top to bottom: the number of units, and the number of bins in each unit. Count only bins that are visible in each image.',
    structure ? `The CAD data gives this layout (some bins may be hidden from this camera angle):\n${structure}\nIn image B, count the bins in EVERY horizontal row of EVERY column separately and compare each row with the layout and with image A. A single row with one bin more or less is a mismatch.` : '',
    'Items placed inside the bins, props, background and lighting do not matter. Only the number and arrangement of bins, units, columns, rows and shelves matter.',
    'match = true only if every count in B equals the count in A. If anything differs, match = false and describe it in Hebrew in "problem".',
    ref ? 'Image C is an official photo of one real tilt-bin unit. Every unit in B must be built like C: flat solid grey side walls over the full depth, clear bins sitting INSIDE the housing between the side walls (never sticking out past them, their clear sides hidden). If units in B are built differently (e.g. bins protruding past the side walls with visible clear sides, shortened side walls), parts_ok = false. The number of bins in C is irrelevant.' : '',
    'Also compare the construction: the tilt-bin housings (side walls over the full depth, bins inside them) and the stand, cabinet, rack or frame they sit on – its profiles, rails, bands, uprights, panels, base and feet – must have the same shape, width, slots and colour in B as in A, and B must not add screws, bolts, rivets, brackets, connectors, end caps or other hardware that A does not show. If B changes them or adds any, parts_ok = false and describe it in Hebrew in "parts_problem".',
  ].filter(Boolean).join('\n');
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', signal:ctl.signal,
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({
        model:CHECK_MODEL, temperature:0,
        response_format:{ type:'json_schema', json_schema:{ name:'bin_count_check', strict:true, schema } },
        messages:[{ role:'user', content:[
          { type:'text', text:instructions },
          { type:'text', text:fromPhoto ? 'Image A (approved base photo):' : 'Image A (3D view):' }, { type:'image_url', image_url:{ url:view, detail:'high' } },
          { type:'text', text:'Image B (realistic result):' }, { type:'image_url', image_url:{ url:result, detail:'high' } },
          ...(ref ? [{ type:'text', text:'Image C (real tilt-bin unit, construction reference only):' }, { type:'image_url', image_url:{ url:ref, detail:'low' } }] : []),
        ] }],
      }),
    });
    clearTimeout(t);
    const j = await r.json();
    if (!r.ok) return { ok:null, detail:j.error?.message || `check error ${r.status}` };
    const v = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    const ok = !!v.match && v.parts_ok !== false;
    return { ok, detail:[v.problem, v.parts_ok === false ? v.parts_problem : ''].filter(Boolean).join(' · '), view:v.view_counts || '', result:v.result_counts || '' };
  } catch (e) {
    return { ok:null, detail:e.name === 'AbortError' ? 'timeout' : e.message };
  }
}
