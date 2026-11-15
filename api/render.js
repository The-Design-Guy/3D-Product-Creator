// Realistic product photo from the current 3D view, via the OpenAI Images "edits" endpoint.
// Admin only (it spends API credit). The key never leaves the server.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 300 };

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';
// model that checks the bin count of the result against the 3D view (any OpenAI model that reads images)
const CHECK_MODEL = process.env.OPENAI_CHECK_MODEL || 'gpt-4.1';

function prompt(description, background, lighting, notes, refCount, structure) {
  return [
    refCount
      ? `You receive ${refCount + 1} images. The FIRST image is the 3D viewport render of the product: turn it into a photorealistic studio product photograph of the exact same object. The other images are client reference files, numbered in order: image 2 = "קובץ 1" (file 1)${refCount > 1 ? `, image 3 = "קובץ 2" (file 2)` : ''}${refCount > 2 ? `, image 4 = "קובץ 3" (file 3)` : ''}${refCount > 3 ? `, image 5 = "קובץ 4" (file 4)` : ''}. Use a reference file ONLY in the way the client notes ask (for example as a background, or as the items to show inside the bins). If the notes do not mention a file, ignore it. Never copy the product from a reference file.`
      : 'Turn this 3D viewport render into a photorealistic studio product photograph of the exact same object.',
    `Product: ${description}`,
    'Keep EVERYTHING about the object identical: geometry, proportions, number of bins and units, their order, the camera angle, framing and perspective.',
    'Do not add, remove, move or redesign any part of the product. Do not add text or logos.',
    notes
      ? 'Client notes (may be in Hebrew). Apply them ONLY to the background, the surroundings, props around the product and the contents placed inside the bins/drawers; never to the product\'s shape, size, colours or construction:\n<<' + notes + '>>'
      : 'Do not add extra objects.',
    notes && background === 'transparent' ? 'The background must stay fully transparent: ignore any background request in the notes, apply only what concerns the bin contents.' : '',
    // the structure lock comes AFTER the notes on purpose: the last instructions weigh the most
    'STRUCTURE LOCK – this overrides everything above, including the client notes:',
    structure ? `Exact counts from the CAD data: ${structure}` : '',
    'Before drawing, count in the FIRST image every unit, every column, every row and every single bin (drawer), from left to right and from top to bottom. The result must have EXACTLY the same number of units, columns, rows and bins, in the same arrangement and sizes. Never add, remove, merge, split, enlarge or shrink bins, rows, columns, shelves or units.',
    notes ? 'Anything the notes ask to put "in the bins" goes INSIDE the bins that already exist, behind their clear fronts; it never creates new bins or changes how many there are. If a note cannot be done without changing the count, ignore that part of the note.' : '',
    'Make the materials real: matte powder-coated / injection-moulded light grey RAL 7035 plastic, crystal-clear polystyrene bins with real refraction, subtle reflections and slightly brighter edges where the plastic is thick, brushed metal where there is metal.',
    background === 'transparent'
      ? 'Isolated product with a fully transparent background, no floor and no shadow outside the object.'
      : 'Seamless light grey-white studio background with a soft natural contact shadow under the product.',
    `Lighting: ${lighting || 'soft, even professional catalogue lighting.'}`,
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });

  const { image, background = 'transparent', description = '' } = req.body || {};
  const lighting = String(req.body?.lighting || '').slice(0, 300);
  const notes = String(req.body?.notes || '').replace(/[<>]/g, '').slice(0, 1200);
  const structure = String(req.body?.structure || '').replace(/[<>]/g, '').slice(0, 800);
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
  for (const r of (Array.isArray(req.body?.refs) ? req.body.refs : []).slice(0, 4)) {
    const rm = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(String(r || ''));
    if (!rm) return res.status(400).json({ error: 'קובץ ייחוס לא תקין (רק JPG, PNG, WebP)' });
    refs.push(rm);
  }
  const blob = (mm) => new Blob([Buffer.from(mm[2], 'base64')], { type: `image/${mm[1]}` });
  const ext = (mm) => (mm[1] === 'jpeg' ? 'jpg' : mm[1]);

  const form = new FormData();
  form.append('model', MODEL);
  if (refs.length) {
    // several input images: the view first, then the reference files in order
    form.append('image[]', blob(m), `view.${ext(m)}`);
    refs.forEach((rm, i) => form.append('image[]', blob(rm), `file-${i + 1}.${ext(rm)}`));
  } else {
    form.append('image', blob(m), `view.${ext(m)}`);
  }
  form.append('prompt', prompt(String(description).slice(0, 2000), background, lighting, notes, refs.length, structure));
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
    const check = Date.now() - t0 < 220000 ? await checkCount(image, out, structure) : { ok:null, detail:'time' };
    return res.status(200).json({ image: out, check });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ---- bin count check ----
// Reads the 3D view and the result, counts the bins in both, and says whether they match.
// ok: true (match) | false (mismatch) | null (the check could not run – never blocks the render)
async function checkCount(view, result, structure) {
  const schema = {
    type:'object', additionalProperties:false,
    required:['view_counts', 'result_counts', 'match', 'problem'],
    properties:{
      view_counts:{ type:'string', description:'bins per unit/column in the 3D view, left to right, e.g. "col1: 5,5,4 | col2: ..."' },
      result_counts:{ type:'string', description:'the same, counted in the realistic result' },
      match:{ type:'boolean' },
      problem:{ type:'string', description:'empty if they match; otherwise a short Hebrew description of the difference' },
    },
  };
  const instructions = [
    'Image A is a 3D CAD viewport of a storage product built from tilt-bin units: grey plastic frames holding clear tilt-out bins (drawers). Image B is a photo-realistic rendering that must show exactly the same product.',
    'Count carefully in BOTH images, unit by unit and column by column, left to right and top to bottom: the number of units, and the number of bins in each unit. Count only bins that are visible in each image.',
    structure ? `For reference, the CAD data says: ${structure} (some bins may be hidden from this camera angle).` : '',
    'Items placed inside the bins, props, background and lighting do not matter. Only the number and arrangement of bins, units, columns, rows and shelves matter.',
    'match = true only if every count in B equals the count in A. If anything differs, match = false and describe it in Hebrew in "problem".',
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
          { type:'text', text:'Image A (3D view):' }, { type:'image_url', image_url:{ url:view, detail:'high' } },
          { type:'text', text:'Image B (realistic result):' }, { type:'image_url', image_url:{ url:result, detail:'high' } },
        ] }],
      }),
    });
    clearTimeout(t);
    const j = await r.json();
    if (!r.ok) return { ok:null, detail:j.error?.message || `check error ${r.status}` };
    const v = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    return { ok:!!v.match, detail:v.problem || '', view:v.view_counts || '', result:v.result_counts || '' };
  } catch (e) {
    return { ok:null, detail:e.name === 'AbortError' ? 'timeout' : e.message };
  }
}
