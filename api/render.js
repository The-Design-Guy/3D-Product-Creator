import { TILTBIN_REF } from './_tiltbin_ref.js';
// Realistic product photo from the current 3D view, via the OpenAI Images "edits" endpoint.
// Admin only (it spends API credit). The key never leaves the server.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 300 };

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';
// model that checks the bin count of the result against the 3D view (any OpenAI model that reads images)
const CHECK_MODEL = process.env.OPENAI_CHECK_MODEL || 'gpt-4.1';
// second engine: Google Gemini image (Nano Banana) – used for shots it draws better (e.g. many steps). Key: GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1';
const G_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const gRatio = (w, h) => G_RATIOS.reduce((b, r) => { const [a, c] = r.split(':').map(Number); return Math.abs(Math.log(a / c / (w / h))) < Math.abs(Math.log(b.split(':')[0] / b.split(':')[1] / (w / h))) ? r : b; }, '1:1');
// the first inline image found anywhere in the response (the REST layout differs between API versions)
function gFindImage(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return null;
  const d = o.inlineData || o.inline_data;
  if (d && d.data && /^image\//.test(d.mimeType || d.mime_type || '')) return { data:d.data, mime:d.mimeType || d.mime_type };
  if (o.type === 'image' && typeof o.data === 'string' && o.data.length > 1000) return { data:o.data, mime:o.mime_type || o.mimeType || 'image/png' };
  for (const v of Array.isArray(o) ? o : Object.values(o)) { const f = gFindImage(v, depth + 1); if (f) return f; }
  return null;
}
async function geminiImage(text, images, w, h) {
  const parts = [{ text }, ...images.map(([mime, b64]) => ({ inline_data:{ mime_type:mime, data:b64 } }))];
  const big = Math.max(w || 0, h || 0);
  const body = { contents:[{ role:'user', parts }], generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio:gRatio(w || 1, h || 1), imageSize:big > 2400 ? '4K' : '2K' } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method:'POST', headers:{ 'x-goog-api-key':process.env.GEMINI_API_KEY, 'content-type':'application/json' }, body:JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini: ' + (j.error?.message || `error ${r.status}`));
  const img = gFindImage(j);
  if (!img) throw new Error('Gemini לא החזיר תמונה' + (j.candidates?.[0]?.finishReason ? ' (' + j.candidates[0].finishReason + ')' : ''));
  return `data:${img.mime};base64,${img.data}`;
}

// numbered list of the extra images after the first one: "image 2 = bin contents reference …"
const refLines = (labels, offset = 2) => labels.map((l, i) => `image ${i + offset} = ${l}`).join(', ');
const REF_TEXT = {
  contents:'a reference photo of the ITEMS that go inside the bins (copy the items, not the storage)',
  room:'a reference photo of the ROOM / SPACE for the background (copy the space, not any storage in it)',
  client:'a client reference file',
  tech:'a TECHNICAL DRAWING of this same product: front and side orthographic views, flat colour-coded parts (orange = aluminium profiles, blue = tilt-bin units, tan = base board) with dimensions in mm. Use it ONLY to understand the construction, the proportions and the true thickness and depth of every part – for example the aluminium profiles are only 30 mm thick and the depth comes from the tilt-bin units. NEVER copy its flat colours, lines, arrows, labels, numbers or text into the result',
};

const HOLES = 'BACK WALL: the back wall of every tilt-bin housing is SOLID, smooth grey plastic – no keyhole hanging slots, no holes, no openings, no screws, no rivets, no metal studs or circles anywhere on it. Keep the side walls as in the model.';
// stage 1 (or the single-stage render): photorealistic photo from the 3D view
function prompt(description, background, lighting, brief, labels, structure, productRef, stage, shadow) {
  const n = 1 + labels.length + (productRef ? 1 : 0);
  return [
    `You receive ${n} image${n > 1 ? 's' : ''}. The FIRST image is the 3D viewport render of the product: turn it into a photorealistic photograph of the exact same object.`,
    labels.length ? `Reference images: ${refLines(labels)}. Use each one ONLY for what it is labelled; never copy a product, shelf or storage unit from a reference image.` : '',
    productRef ? `The LAST image is an official catalogue photo of ONE real tilt-bin unit (a 5-bin unit). Use it ONLY as the construction and material reference for every tilt-bin unit in the result: the light grey housing with flat, solid side walls that run the full depth of the unit, its rounded edges, the clear angled bin fronts with their label window, and exactly how each clear bin sits INSIDE the housing between the side walls – a bin never sticks out past the side walls and its clear sides are hidden by the housing, only the clear front shows. Do NOT copy its number of bins, its size, angle or position: the units, their sizes and the number of bins come ONLY from the FIRST image.` : '',
    `Product: ${description}`,
    /tilt-bin/i.test(description) ? HOLES : '',
    'Keep EVERYTHING about the object identical: geometry, proportions, number of bins and units, their order, the camera angle, framing and perspective.',
    'Do not add, remove, move or redesign any part of the product. Do not add text or logos.',
    brief
      ? 'Client brief (may be in Hebrew). Apply it ONLY to what each section names – the bin contents, the background and surroundings, props around the product – never to the product\'s shape, size, colours or construction:\n<<' + brief + '>>'
      : 'Do not add extra objects.',
    stage === 'base' ? 'All bins stay EMPTY in this image: nothing inside any bin.' : '',
    brief && background === 'transparent' ? 'The background must stay fully transparent: ignore any background request, apply only what concerns the bin contents.' : '',
    // the structure lock comes AFTER the brief on purpose: the last instructions weigh the most
    'STRUCTURE LOCK – this overrides everything above, including the client brief:',
    structure ? `Exact layout from the CAD data:\n${structure}\nGo through this layout column by column and row by row: every row of the result must have exactly the number of bins listed (a 6-bin unit is a row of exactly 6 bins, never 5 or 7).` : '',
    'Before drawing, count in the FIRST image every unit, every column, every row and every single bin (drawer), from left to right and from top to bottom. The result must have EXACTLY the same number of units, columns, rows and bins, in the same arrangement and sizes. Never add, remove, merge, split, enlarge or shrink bins, rows, columns, shelves or units.',
    'PROFILES AND HARDWARE: every aluminium or steel profile, rail, band, upright and frame keeps exactly the cross-section, width, thickness, slots, rounded corners, colour and finish it has in the FIRST image, and the joints stay exactly as drawn. Do not add screws, bolts, rivets, brackets, connectors, wall plugs, end caps, holes, labels or any fitting that is not in the first image.',
    brief && stage !== 'base' ? 'Anything the brief puts "in the bins" goes INSIDE the bins that already exist, behind their clear fronts; it never creates new bins or changes how many there are. If something cannot be done without changing the count, leave it out.' : '',
    'Make the materials real: matte powder-coated / injection-moulded light grey RAL 7035 plastic, crystal-clear polystyrene bins with real refraction, subtle reflections and slightly brighter edges where the plastic is thick, brushed metal where there is metal.',
    background === 'transparent'
      ? (shadow ? 'Isolated product on a fully transparent background with a soft, natural, semi-transparent contact shadow on the ground directly under and just around it, cast from the light described (the shadow stays; no floor, no background – everything else fully transparent).'
        : 'Isolated product with a fully transparent background, no floor and no shadow outside the object.')
      : /BACKGROUND/.test(brief) ? 'Build the background and surroundings as the brief describes, around the product exactly where it stands, with natural contact shadows.'
      : 'Seamless light grey-white studio background with a soft natural contact shadow under the product.',
    `Lighting: ${lighting || 'soft, even professional catalogue lighting.'}`,
  ].filter(Boolean).join('\n');
}

// stage 2 of the two-stage render: the approved, empty base photo is edited – only additions from the brief
function editPrompt(description, background, brief, labels, structure, masked, itemsOnly) {
  const n = 1 + labels.length;
  return [
    `You receive ${n} image${n > 1 ? 's' : ''}. The FIRST image is an approved photorealistic photograph of the product(s) with EMPTY bins. EDIT this photograph: keep every product, unit, bin, profile, frame, wall and floor, the materials, the lighting, the camera angle, perspective and framing exactly as they are – the result must look like the same photograph with things added.`,
    labels.length ? `Reference images: ${refLines(labels)}. Use each one ONLY for what it is labelled; never copy a product, shelf or storage unit from a reference image.` : '',
    `Product: ${description}`,
    /tilt-bin/i.test(description) ? HOLES : '',
    brief
      ? 'Client brief (may be in Hebrew). Carry it out by ADDING things – contents inside the existing bins, and anything else the brief names. Never change, move, resize or recolour the products themselves, and keep the room as it is:\n<<' + brief + '>>'
      : 'Do not add anything.',
    brief && background === 'transparent' ? 'The background must stay fully transparent: apply only what concerns the bin contents.' : '',
    'STRUCTURE LOCK – this overrides everything above, including the client brief:',
    structure ? `Exact layout of the products in the photograph:\n${structure}\nEvery row of the result must keep exactly the number of bins listed (a 6-bin unit is a row of exactly 6 bins, never 5 or 7).` : '',
    'Keep EXACTLY the units, columns, rows and bins of the FIRST image: never add, remove, merge, split, enlarge or shrink bins, rows, columns, shelves or units. Every profile, rail, upright, side wall and frame keeps its shape, width, colour and finish; add no screws, brackets or fittings. The clear bins stay INSIDE their grey housings.',
    brief ? 'Anything the brief puts "in the bins" goes INSIDE the bins that already exist, behind their clear fronts; it never creates new bins or changes how many there are. If something cannot be done without changing the products, leave it out.' : '',
    'New items get the same lighting as the photograph, with natural contact shadows.',
    masked ? 'Only the inside of the bins may change (the masked area): fill it with the contents, sitting naturally inside each bin behind its clear front; everything outside stays exactly as it is.' : '',
    // items only (ארקליות): the page lays the items on the approved empty photo itself, so nothing of the bin can change
    itemsOnly ? 'OUTPUT ONLY THE ITEMS – this overrides everything above: draw ONLY the contents (the items), exactly where they lie inside the bin(s) of the input photograph – behind a clear front they are seen through it, with its slight tint and reflections – at the same scale, perspective and light. EVERYTHING ELSE MUST BE FULLY TRANSPARENT in the output: do NOT draw the bin itself – no walls, no inner walls, no floor, no rim, no dividers, no label, no background, no shadow outside the items. The result is a cut-out layer of the items alone that will be placed on the input photograph.' : '',
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });

  const { image, background = 'transparent', description = '' } = req.body || {};
  const lighting = String(req.body?.lighting || '').slice(0, 300);
  // stage: 'base' = photo from the 3D view with the room but EMPTY bins, 'edit' = the approved base gets the bin contents, none = one stage
  const stage = ['base', 'edit'].includes(req.body?.stage) ? req.body.stage : '';
  const txt = (k, n = 1500) => String(req.body?.[k] || '').replace(/[<>]/g, '').trim().slice(0, n);
  let contents = txt('contents'), bg = txt('backdrop'), extra = txt('extra', 3000);
  if (!contents && !bg && !extra) extra = txt('notes', 1200);               // older pages: free notes only
  // which part of the brief goes into which stage: the room in stage 1, the bin contents in stage 2, "extra" in both
  const useContents = stage !== 'base', useBg = stage !== 'edit';
  const brief = [
    useContents && contents ? `IN THE BINS: ${contents}` : '',
    useBg && (bg || (req.body?.roomRefs || []).length) ? `BACKGROUND AND SURROUNDINGS: ${bg || 'the room shown in the room reference photo'}` : '',
    useContents && !contents && (req.body?.contentRefs || []).length ? 'IN THE BINS: the items shown in the bin contents reference photo' : '',
    extra ? `ALSO IMPORTANT: ${extra}` : '',
  ].filter(Boolean).join('\n');
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

  // reference images, already shrunk by the browser: 2 for the bin contents, 2 for the room (older pages: 4 general)
  const refs = [], labels = [];
  const take = (arr, label, max) => {
    for (const r of (Array.isArray(arr) ? arr : []).slice(0, max)) {
      const rm = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(String(r || ''));
      if (!rm) return false;
      refs.push(rm); labels.push(REF_TEXT[label]);
    }
    return true;
  };
  const okRefs = (useContents ? take(req.body?.contentRefs, 'contents', 2) : true)
    && (useBg ? take(req.body?.roomRefs, 'room', 2) : true)
    && (stage === '' ? take(req.body?.refs, 'client', 4) : true)
    && (stage !== 'edit' && req.body?.tech ? take([req.body.tech], 'tech', 1) : true);
  if (!okRefs) return res.status(400).json({ error: 'קובץ ייחוס לא תקין (רק JPG, PNG, WebP)' });
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
    refs.forEach((rm, i) => form.append('image[]', blob(rm), `reference-${i + 1}.${ext(rm)}`));
    if (productRef) form.append('image[]', blob(pm), 'tilt-bin-reference.webp');
  } else {
    form.append('image', blob(m), `view.${ext(m)}`);
  }
  // a mask (PNG, same size as the first image): only its transparent part may change – the rest of the photo stays pixel for pixel
  const mk = /^data:image\/png;base64,(.+)$/.exec(String(req.body?.mask || ''));
  if (mk) form.append('mask', new Blob([Buffer.from(mk[1], 'base64')], { type:'image/png' }), 'mask.png');
  const promptText = stage === 'edit'
    ? editPrompt(String(description).slice(0, 2000), background, brief, labels, structure, !!mk, !!req.body?.itemsOnly)
    : prompt(String(description).slice(0, 2000), background, lighting, brief, labels, structure, productRef, stage, !!req.body?.shadow);
  form.append('prompt', promptText);
  const gImages = [[`image/${m[1]}`, m[2]], ...refs.map(rm => [`image/${rm[1]}`, rm[2]]), ...(productRef ? [[`image/${pm[1]}`, pm[2]]] : [])];
  // engine: 'gemini' (asked for) or 'auto-gemini' (the page's default for shots on steps: OpenAI when there is no Gemini key)
  const eng = String(req.body?.engine || '');
  const useGemini = (eng === 'gemini' || eng === 'auto-gemini') && background !== 'transparent' && !mk && (process.env.GEMINI_API_KEY || eng === 'gemini');
  if (useGemini && !process.env.GEMINI_API_KEY) return res.status(400).json({ error:'חסר מפתח GEMINI_API_KEY ב-Vercel – אי אפשר לרנדר עם Gemini' });
  form.append('background', background === 'transparent' ? 'transparent' : 'opaque');
  form.append('output_format', 'webp');          // smaller response than PNG, keeps transparency
  form.append('output_compression', '95');
  form.append('quality', QUALITY);
  form.append('size', size);
  form.append('input_fidelity', 'high');          // stay as close as possible to the input image (a model that does not know it: sent again without it)

  try {
    let out;
    if (useGemini) {
      const [zw, zh] = size === 'auto' ? [0, 0] : size.split('x').map(Number);
      out = await geminiImage(promptText, gImages, zw, zh);
    } else {
      const call = () => fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
      let r = await call(), j = await r.json();
      if (!r.ok && /input_fidelity/i.test(j.error?.message || '')) { form.delete('input_fidelity'); r = await call(); j = await r.json(); }
      if (!r.ok) return res.status(502).json({ error: j.error?.message || `OpenAI error ${r.status}` });
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) return res.status(502).json({ error: 'OpenAI returned no image' });
      out = `data:image/webp;base64,${b64}`;
    }
    // count check: compare the bins in the result with the 3D view (skipped when time is short)
    // with a list of the units expected (shots on steps): a second, BLIND count – it does not see the expected layout, so it cannot just repeat it
    const expect = Array.isArray(req.body?.expect) ? req.body.expect.map(n => Math.round(+n)).filter(n => n > 0 && n < 100).slice(0, 30) : [];
    const late = Date.now() - t0 >= 220000;
    const [check, blind] = late || req.body?.itemsOnly || req.body?.noCheck ? [{ ok:null, detail:late ? 'time' : 'items only' }, null] : await Promise.all([
      checkCount(image, out, structure, productRef ? TILTBIN_REF : null, stage === 'edit', !!req.body?.frame),
      expect.length > 1 ? blindCount(out) : null]);
    if (blind && blind.units) {
      const a = [...expect].sort((x, y) => x - y), b = [...blind.units].sort((x, y) => x - y);
      const same = a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) <= 1);
      check.blind = blind.units;
      if (!same) { check.ok = false; check.detail = [`בספירה עיוורת נמצאו ${b.length} יחידות (${blind.units.join(', ')}) במקום ${a.length} (${expect.join(', ')})`, check.ok === false ? check.detail : ''].filter(Boolean).join(' · '); }
    }
    // a big image (Gemini returns PNG) would pass Vercel's response limit: it goes to Blob storage and the page fetches it from there
    let outImg = out;
    if (out.length > 3_200_000 && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
      try { const mm = /^data:(image\/[a-z]+);base64,(.+)$/.exec(out); const { put } = await import('@vercel/blob');
        const b = await put(`scenes/render-${Date.now()}.${mm[1].split('/')[1]}`, Buffer.from(mm[2], 'base64'), { access:'public', contentType:mm[1], addRandomSuffix:true }); outImg = b.url; } catch (e) {}
    }
    return res.status(200).json({ image:outImg, check, engine: useGemini ? 'gemini' : 'openai' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ---- blind count: the result alone, no layout to lean on ----
async function blindCount(result) {
  const schema = { type:'object', additionalProperties:false, required:['units'], properties:{ units:{ type:'array', items:{ type:'object', additionalProperties:false, required:['where', 'bins'],
    properties:{ where:{ type:'string', description:'where the unit is, e.g. "lowest step, front"' }, bins:{ type:'integer', description:'number of clear bins (drawers) side by side in this unit' } } } } } };
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', signal:ctl.signal,
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({ model:CHECK_MODEL, temperature:0, response_format:{ type:'json_schema', json_schema:{ name:'blind_units', strict:true, schema } },
        messages:[{ role:'user', content:[
          { type:'text', text:'This photo shows storage units: each unit is one grey/white plastic housing with a single horizontal row of clear tilt-out bins (drawers). List EVERY unit you can see, from the lowest/front to the highest/back, and count the bins in each unit one by one, carefully. Do not guess and do not assume a pattern – count only what is actually in the photo.' },
          { type:'image_url', image_url:{ url:result, detail:'high' } } ] }] }) });
    clearTimeout(t);
    const j = await r.json(); if (!r.ok) return null;
    const v = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    return Array.isArray(v.units) ? { units:v.units.map(u => u.bins).filter(n => n > 0) } : null;
  } catch (e) { return null; }
}

// ---- bin count check ----
// Reads the 3D view and the result, counts the bins in both, and says whether they match.
// ok: true (match) | false (mismatch) | null (the check could not run – never blocks the render)
async function checkCount(view, result, structure, ref, fromPhoto, frame) {
  const schema = {
    type:'object', additionalProperties:false,
    required:['view_counts', 'result_counts', 'match', 'problem', 'parts_ok', 'parts_problem', 'frame_ok', 'frame_problem'],
    properties:{
      view_counts:{ type:'string', description:'bins in each row, top to bottom, per column left to right, in the 3D view, e.g. "col1: 9,6,6,5 | col2: ..."' },
      result_counts:{ type:'string', description:'the same, row by row, counted in the realistic result' },
      match:{ type:'boolean' },
      problem:{ type:'string', description:'empty if they match; otherwise a short Hebrew description of the difference, naming the column and the row from the top' },
      parts_ok:{ type:'boolean', description:'true if the profiles/rails/frames in B keep the shape, width and colour of A and B adds no screws, bolts, brackets, connectors or other hardware that A does not have' },
      parts_problem:{ type:'string', description:'empty if parts_ok; otherwise a short Hebrew description of what changed or was added' },
      frame_ok:{ type:'boolean', description:'true if B keeps the camera of A: the same viewpoint and angle, and every product at about the same place and size in the frame (not zoomed in or out, not shifted or re-cropped by more than a few percent)' },
      frame_problem:{ type:'string', description:'empty if frame_ok; otherwise a short Hebrew description (e.g. "התמונה התקרבה", "המוצרים זזו שמאלה")' },
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
    frame ? 'Also compare the framing: B must keep the camera of A – same viewpoint, same angle, every product at the same place and size in the frame. A zoom, a re-crop, a shift or a different viewpoint = frame_ok false.' : 'frame_ok: always true here.',
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
    const ok = !!v.match && v.parts_ok !== false && (!frame || v.frame_ok !== false);
    return { ok, frameOk:frame ? v.frame_ok !== false : null, detail:[v.problem, v.parts_ok === false ? v.parts_problem : '', frame && v.frame_ok === false ? v.frame_problem : ''].filter(Boolean).join(' · '), view:v.view_counts || '', result:v.result_counts || '' };
  } catch (e) {
    return { ok:null, detail:e.name === 'AbortError' ? 'timeout' : e.message };
  }
}
