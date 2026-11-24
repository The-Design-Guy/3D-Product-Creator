// Per-unit bin count: the page cuts every unit out of a render (where it stands in the 3D view) and sends the cut-outs here.
// The counter sees only the cut-outs – never the expected numbers – so it cannot just repeat them. Admin only.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const CHECK_MODEL = process.env.OPENAI_CHECK_MODEL || 'gpt-4.1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'נדרש מצב ניהול' });
  const crops = (Array.isArray(req.body?.crops) ? req.body.crops : []).filter(c => /^data:image\/(png|jpeg|webp);base64,/.test(c)).slice(0, 12);
  if (!crops.length) return res.status(400).json({ error: 'אין תמונות' });
  const schema = { type:'object', additionalProperties:false, required:['units'], properties:{ units:{ type:'array', items:{ type:'object', additionalProperties:false,
    required:['image', 'bins', 'sure'], properties:{ image:{ type:'integer' }, bins:{ type:'integer', description:'clear bins (drawers) side by side in the central unit' }, sure:{ type:'boolean' } } } } } };
  const content = [{ type:'text', text:`You get ${crops.length} cut-outs from one photo. Each cut-out is centred on ONE storage unit: a grey/white plastic housing holding a single horizontal row of clear tilt-out bins (drawers). Other units may show at the edges – ignore them. For every cut-out, count the bins of the CENTRAL unit one by one, from left to right, carefully; count the dividers too and make sure the number fits. If there is no such unit in the middle of a cut-out, bins = 0. Do not assume any pattern between the cut-outs.` }];
  crops.forEach((c, i) => { content.push({ type:'text', text:`Cut-out ${i + 1}:` }, { type:'image_url', image_url:{ url:c, detail:'high' } }); });
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 50000);
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', signal:ctl.signal,
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({ model:CHECK_MODEL, temperature:0, response_format:{ type:'json_schema', json_schema:{ name:'unit_bins', strict:true, schema } }, messages:[{ role:'user', content }] }) });
    clearTimeout(t);
    const j = await r.json(); if (!r.ok) return res.status(502).json({ error:j.error?.message || `error ${r.status}` });
    const v = JSON.parse(j.choices?.[0]?.message?.content || '{}'), out = crops.map(() => null);
    (v.units || []).forEach(u => { if (u.image >= 1 && u.image <= crops.length) out[u.image - 1] = u.bins; });
    return res.status(200).json({ bins:out });
  } catch (e) { return res.status(500).json({ error:e.name === 'AbortError' ? 'timeout' : e.message }); }
}
