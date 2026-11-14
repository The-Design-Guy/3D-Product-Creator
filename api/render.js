// Realistic product photo from the current 3D view, via the OpenAI Images "edits" endpoint.
// Admin only (it spends API credit). The key never leaves the server.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 180 };

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';

function prompt(description, background, lighting, notes, refCount) {
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
  form.append('prompt', prompt(String(description).slice(0, 2000), background, lighting, notes, refs.length));
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
    return res.status(200).json({ image: `data:image/webp;base64,${b64}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
