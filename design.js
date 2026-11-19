// Designs a whole space from one request ("a 10 x 10 m assembly hall in an electronics plant, with computer
// workstations divided by EXCLUSIVE partitions of 4"): the room, its doors / windows and a list of ZONES.
// The model never places single products – the app's layout engine places every product inside its zone,
// keeps the aisles and the doors clear and reports what did not fit.
// Admin only. Answers in the language of the request (usually Hebrew).
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const TEXT_MODEL = process.env.OPENAI_DESIGN_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';

const PTYPES = ['unit', 'stand', 'excl', 'part', 'quad', 'wall', 'tena', 'smart', 'tamb', 'mtamb', 'mdoor', 'tech', 'arc', 'furn', 'lock', 'wb'];

const KNOWLEDGE = `
You are an interior / industrial layout designer for Huliot / Medikup storage products. You plan a space as ZONES; the app places the products.

PRODUCTS (type – Hebrew name – footprint W x D cm, height – what it is good for):
- part – "מחיצת EXCLUSIVE" – double-sided tilt-bin partition on castors; cols 2 → 129 wide, 3 → 192, 4 → 255; ~50 deep; up to 215 high. Divides workstations: it stands on the floor PERPENDICULAR to the wall, between two desks, bins on both sides (as in the reference photo: partition, desk, partition, desk …).
- excl – "עגלת EXCLUSIVE" – double-sided closed tilt-bin cart 66 x 39, 110–150 high – next to workstations, mobile parts supply.
- stand – "מעמד / עגלה לרב תא" – 60 x 42, 116 / 180 / 200 high, single or double sided, wheels or legs – picking, line-side supply.
- quad – "מעמד 4 דפנות" – 80 x 80 tower, bins on 4 sides – centre of a room, shops, small parts.
- tena – "תא-נע DELUXE" – closed gondola with sliding wings, 220 high, size 4 → 127 x 63, 7 → 190 x 63, 10 → 250 x 63 – high density storage, stores, pharmacies, spare parts.
- smart – "תא-נע SMART" – open steel gondola 135 x 68, 210 high – stores, spare parts.
- wall – "מתלה קיר" – tilt-bin wall rack, 60 wide, hangs on a wall (height 60 / 120 / 200).
- tamb – "ארון מאובטח לרב תא" – 67 x 45 x 195, tambour + lock, tilt bins inside – medicine, controlled items, clinics.
- mtamb – "ארון תריס" – 90 x 45 x 195, tambour, shelves (pick bins can stand on them: bin_layout).
- mdoor – "ארון 4 מדפים" – 90 x 40 x 195, 2 doors, grey or blue (pick bins: bin_layout).
- tech – "ארון עבודה טכני" – 100 x 56 x 195 blue workshop cabinet; tech_variant 1 = 4 shelves, 2 = 32 pick bins, 3 = 1 drawer, 4 = 3 drawers (tools / bins on the doors) – workshops, maintenance, electronics.
- wb – "שולחן עבודה מאסיבי" – heavy-duty workbench 150 x 75, green anti-static (ESD) top, drawers; wb_variant 1 = 2 drawers, 2 = 2 drawers + perforated back with shelves (170 high), 3 = 4-drawer cabinet + back; wb_tools = tools on the back. THE workbench for electronics, assembly, labs and workshops – use it for benches zones (product type wb) rather than the generic furn bench.
- lock – "לוקר 6 דלתות" – staff locker 90 x 45 x 195, 6 lockable doors – changing rooms, staff areas of plants / clinics / warehouses (wall_storage along a wall, usually 2–6 side by side).
- arc – "ארקליות" – single open pick bins (not a floor product – leave them for cabinets).
- unit – a single tilt-bin unit (not a floor product).
- furn – generic furniture / props: furn_kind station (computer workstation: desk + pedestal + monitor + office chair, desk 160 or 120 wide, 128 deep with the chair), desk, chair, bench (industrial workbench with a pegboard, 150 / 200 wide, 75 deep), plant.

TYPICAL SPACES (pick products that fit; the user's words always win):
- electronics / assembly hall: workstations (furn station) in rows divided by part (cols 3 or 4) with comp of small bins (#4, #5, #6, #9), excl carts next to the stations, tech cabinets (variant 4 or 2) and mdoor / mtamb with pick bins along a wall, a few wb workbenches (variant 2 or 3), lockers for the staff.
- spare-parts store / warehouse: tena / smart rows in the middle (back to back or single rows with aisles), stands and wall racks on the walls, a desk station near the door.
- workshop / maintenance: benches along walls, tech cabinets, wall racks, a quad.
- clinic / pharmacy / lab: tamb cabinets, wall racks, mdoor, a desk station, quad or excl carts.
- shop / showroom: quad towers and stands in the middle, wall racks on the walls, a plant or two.

LAYOUT RULES (the engine applies them; plan with them in mind):
- Main aisle 120–150 cm, side aisles ≥ 90 cm. Nothing in front of a door (1 m clear). Tall cabinets not under windows.
- Cabinets, racks, benches and workstation rows go against walls (back to the wall). Gondolas / stands / quads / back-to-back workstation islands go in the free middle.
- A workstation row: desks side by side along the wall with a partition between every two desks (partition.ends true = also one at each end of the row).
- room.obstacles: columns, pipes and gypsum walls (boxes in cm from the left / back wall). Nothing may stand on them; the engine routes around them. Take them into account when choosing zones and counts (a column in the middle splits the free floor). A gypsum wall with to_build true is a NEW wall built for the storage: cabinets and racks may stand against both of its faces. One with removable true may be mentioned in notes as an option to remove if it blocks a better layout. A tap (water_point) is an opportunity: keep its wall area reachable, and mention in notes that a profile system with a sink (3 cm profiles) could go there – that product is not in the catalogue yet.
- Do not overfill: leave the room usable. If the user gives counts, use them; otherwise choose sensible counts for the room size (e.g. 10 x 10 m assembly hall → ~6–10 stations, 2–4 tall cabinets, 2–4 carts).
`;

const nul = (t) => ({ anyOf:[t, { type:'null' }] });
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:'OPENAI_API_KEY is not set' });
  const text = String(req.body?.text || '').slice(0, 4000);
  if (!text.trim()) return res.status(400).json({ error:'אין טקסט לפרש' });
  const room = req.body?.room || {};
  const zones = Array.isArray(req.body?.zones) ? req.body.zones.slice(0, 30) : [];
  const others = Array.isArray(req.body?.others) ? req.body.others.slice(0, 60) : [];

  const settings = { type:'object', additionalProperties:false,
    required:['comp', 'cols', 'top', 'base', 'stand_type', 'height_cm', 'tena_size', 'doors', 'md_color', 'bin_layout', 'tech_variant', 'door_acc', 'furn_kind', 'width_cm', 'wb_variant', 'wb_tools', 'wb_top'],
    properties:{
      comp:nul({ type:'array', items:{ type:'object', additionalProperties:false, required:['model', 'count'], properties:{ model:{ type:'integer', enum:[2, 3, 4, 5, 6, 9] }, count:{ type:'integer' } } }, description:'tilt-bin units per model (part / excl / stand / quad / tamb)' }),
      cols:nul({ type:'integer', enum:[2, 3, 4], description:'part: columns' }),
      top:nul({ type:'string', enum:['black', 'white'] }),
      base:nul({ type:'string', enum:['wheels', 'legs'] }),
      stand_type:nul({ type:'string', enum:['single', 'double'] }),
      height_cm:nul({ type:'number', description:'stand 116/180/200, wall rack 60/120/200' }),
      tena_size:nul({ type:'integer', enum:[4, 7, 10] }),
      doors:nul({ type:'boolean', description:'tena sliding doors (size 4 / 10 only)' }),
      md_color:nul({ type:'string', enum:['blue', '7035'] }),
      bin_layout:nul({ type:'string', enum:['mixed', 'full'], description:'mtamb / mdoor with pick bins on the shelves' }),
      tech_variant:nul({ type:'integer', enum:[1, 2, 3, 4] }),
      door_acc:nul({ type:'string', enum:['tools', 'bins', 'both', 'none'] }),
      furn_kind:nul({ type:'string', enum:['station', 'desk', 'chair', 'bench', 'plant'] }),
      width_cm:nul({ type:'integer', enum:[120, 150, 160, 200], description:'furn: desk / station 120 or 160, bench 150 or 200' }),
      wb_variant:nul({ type:'integer', enum:[1, 2, 3] }),
      wb_tools:nul({ type:'boolean' }),
      wb_top:nul({ type:'string', enum:['green', 'white'], description:'wb: the work top – green anti-static (default) or white' }),
    } };
  const product = { type:'object', additionalProperties:false, required:['type', 'settings'], properties:{ type:{ type:'string', enum:PTYPES }, settings } };
  const zone = { type:'object', additionalProperties:false,
    required:['id', 'name', 'kind', 'wall', 'align', 'count', 'rows', 'product', 'partition', 'desk_cm', 'near', 'contents'],
    properties:{
      id:{ type:'string', description:'short stable id, e.g. "z1"; keep the ids of zones that already exist' },
      name:{ type:'string', description:'Hebrew name of the zone, e.g. "עמדות הרכבה"' },
      kind:{ type:'string', enum:['workstations', 'workstation_island', 'wall_storage', 'island', 'benches', 'carts', 'decor'],
        description:'workstations: a row of desks along a wall with partitions between them · workstation_island: two rows of desks back to back in the middle, partitions across · wall_storage: cabinets / racks / gondolas side by side along a wall · island: products in rows in the free middle of the room with aisles · benches: workbenches along a wall (product wb, or furn bench) · carts: mobile carts / stands next to another zone (near) · decor: plants in free corners' },
      wall:nul({ type:'string', enum:['back', 'left', 'right', 'front'], description:'workstations / wall_storage / benches: the wall (as seen from the front of the room: back = facing the viewer)' }),
      align:nul({ type:'string', enum:['start', 'center', 'end'], description:'where along the wall: start = the left end (back / front wall) or the back end (side walls); null = center' }),
      count:nul({ type:'integer', description:'how many products (stations for workstation zones); null = as many as fit' }),
      rows:nul({ type:'integer', description:'island: number of rows (null = the app decides)' }),
      product:nul(product),
      partition:nul({ type:'object', additionalProperties:false, required:['cols', 'ends', 'comp'], properties:{
        cols:nul({ type:'integer', enum:[2, 3, 4] }), ends:{ type:'boolean' },
        comp:nul({ type:'array', items:{ type:'object', additionalProperties:false, required:['model', 'count'], properties:{ model:{ type:'integer', enum:[2, 3, 4, 5, 6, 9] }, count:{ type:'integer' } } } }) },
        description:'workstation zones: the EXCLUSIVE partitions between the desks (null = no partitions)' }),
      desk_cm:nul({ type:'integer', enum:[120, 160], description:'workstation zones: desk width' }),
      near:nul({ type:'string', description:'carts / decor: id of the zone to stand next to' }),
      contents:nul({ type:'string', description:'what is in the bins of this zone, for the realistic render (in the user\'s words or fitting the kind of space)' }),
    } };
  const schema = { type:'object', additionalProperties:false, required:['understood', 'room', 'openings', 'clear_scene', 'zones', 'notes'],
    properties:{
      understood:{ type:'string', description:'one or two short sentences in the language of the request: what you are going to build' },
      room:nul({ type:'object', additionalProperties:false, required:['width_m', 'depth_m', 'back', 'left', 'right', 'front'], properties:{
        width_m:{ type:'number' }, depth_m:{ type:'number' }, back:{ type:'boolean' }, left:{ type:'boolean' }, right:{ type:'boolean' }, front:{ type:'boolean' } },
        description:'the room – null keeps the current room' }),
      openings:nul({ type:'array', description:'the FULL list of doors / windows when the request sets them (null keeps the current ones)', items:{ type:'object', additionalProperties:false,
        required:['kind', 'type', 'wall', 'width_cm', 'offset_cm'], properties:{
          kind:{ type:'string', enum:['door', 'window'] }, type:{ type:'string', enum:['single', 'double', 'sliding', 'passage', 'std', 'shop', 'high'] },
          wall:{ type:'string', enum:['back', 'left', 'right', 'front'] }, width_cm:nul({ type:'number' }), offset_cm:nul({ type:'number', description:'from the left wall (back / front) or the back wall (sides); null = middle' }) } } }),
      clear_scene:{ type:'boolean', description:'true when the request is a new space ("תיצור לי מרחב…"): every product not in a zone is removed' },
      zones:{ type:'array', items:zone, description:'the FULL list of zones after this request (keep the existing ones that the request does not change)' },
      notes:{ type:'string', description:'short design notes for the user in the language of the request (why this layout); can be empty' },
    } };

  const system = [
    KNOWLEDGE,
    'Answer with the room, the openings, and the FULL list of zones. Zones that exist now are given with their ids: keep them as they are unless the request changes them ("תזיז את העמדות לקיר השמאלי" → change that zone\'s wall; "עוד 2 עמדות" → count + 2; "בלי העגלות" → drop that zone).',
    'A new space ("תיצור לי…", "תכנן לי…", a size of a room) → clear_scene true, set the room (all four walls true unless the user says open), add a door on the front wall (double, 160) if the user did not mention doors, and plan zones for the whole space.',
    'Every zone needs a product (except workstation zones: product = the furn station / desk, partition = the partitions). Keep settings minimal: only what matters; the rest null.',
    'Write names, understood and notes in the language of the request. Never invent products that are not in the list.',
  ].join('\n');
  const user = `Room now: ${JSON.stringify(room)}\nZones now: ${JSON.stringify(zones)}\nOther products in the scene (not in zones): ${JSON.stringify(others)}\n\nRequest:\n${text}`;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({
        model:TEXT_MODEL, temperature:0.2,
        response_format:{ type:'json_schema', json_schema:{ name:'scene_design', strict:true, schema } },
        messages:[{ role:'system', content:system }, { role:'user', content:user }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:j.error?.message || `OpenAI error ${r.status}` });
    const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    out.zones = (out.zones || []).slice(0, 20).map(z => ({ ...z, count:z.count === null ? null : Math.max(1, Math.min(40, Math.round(z.count))) }));
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
