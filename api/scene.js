// Turns a spoken / typed request (usually Hebrew) into actions on the 3D scene:
// add / move / turn / duplicate / delete products, change their settings, open bins and doors,
// set what goes inside the bins (for the realistic render), change the room.
// Admin only. The model only uses the product catalogue and the products listed with the request.
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';

const TYPES = ['unit', 'stand', 'excl', 'part', 'quad', 'wall', 'tena', 'smart', 'tamb', 'mtamb', 'mdoor', 'tech', 'arc', 'furn', 'lock', 'wb', 'shelf'];
const OPS = ['add', 'move', 'move_to', 'rotate', 'rotate_to', 'delete', 'duplicate', 'set', 'bins', 'doors', 'tambour', 'contents', 'labels', 'select', 'room', 'light', 'opening', 'obstacle', 'photo', 'clear', 'commit', 'design'];

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
- arc – "ארקליות" / "ארקלית" – ONE single open-front plastic pick bin (like Huliot's "אחסוניות"): settings.arc = model (1: 50.4 deep x 30.7 wide x 19.4 high cm, 2: 35 x 21 x 19.6, 3: 23.8 x 14.5 x 12.9, 4: 17 x 9.6 x 8), color blue (default) / grey, divider (one lengthwise divider, models 1–2 only); cols, rows, height_cm stay null. Several bins = count (side by side with row), or more adds; a bin on top of something = y_cm.
- Pick bins (ארקליות 2, 3, 4 – not 1, too deep) can stand on the shelves of mtamb and mdoor: settings.shelf_bins. "ארון תריס עם ארקליות" / "ארון 2 דלתות עם ארקליות" = that cabinet with shelf_bins (no layout given → bin_layout 'mixed'; "מלא בארקליות 3" / "רק ארקלית 3" → bin_layout 'full'; shelf_bins changes single shelves after it): model 2, cols 4, rows 1).
- mdoor – "ארון 4 מדפים" – metal cabinet with 2 hinged doors, 90 x 40, 195 high – light grey RAL 7035 only (md_color always 7035 or null).
- tech – "ארון עבודה טכני" – blue workshop cabinet 100 x 56 x 195 with 2 hinged doors – tech_variant: 1 = 4 shelves, 2 = 8 levels with 4 x ארקלית 2 each (32 bins), 3 = one drawer + 2 shelves, 4 = 3 drawers + 2 shelves. Variants 3 / 4 have a pegboard back and perforated / louvre doors with ארקלית 4 hanging on them – door_bins {left, right} (default 2 and 1, 0–3 each); door_acc = what hangs inside the doors: tools ("כלי עבודה"), bins ("ארקליות"), both ("גם וגם", default) or none ("כלום", "דלתות ריקות"). shelf_bins work here too (a deep bin can't sit at the height of the door bins).
- lock – "לוקר 6 דלתות" – staff locker 90 x 45 x 195, light grey body, 6 blue lockable doors (3 columns x 2 rows), shelf + hanging rod in each compartment. Doors: op doors with door = 1–6 (1 = top-left, 2 = top-middle, 3 = top-right, 4 = bottom-left, 5 = bottom-middle, 6 = bottom-right) or door null = all. Names: "לוקר", "לוקרים", "ארון לוקרים", "ארון הלבשה", "ארון עובדים".
- wb – "שולחן עבודה מאסיבי" – heavy-duty workbench 150 x 75, green anti-static top at 84 cm; wb_variant 1 = hanging 2-drawer unit, 2 = 2 drawers + blue perforated back with 2 shelves (170 high), 3 = 4-drawer floor cabinet + the back; wb_tools true = tools hanging on the back; wb_top green (anti-static, default) or white. Names: "שולחן עבודה", "שולחן עבודה טכני", "שולחן מאסיבי", "שולחן אנטי סטטי". (furn bench is only a generic prop.)
- shelf – "מידוף לעומס בינוני" / "מדפים" / "מדף מחסן" (MEDIKUP medium-duty shelving): blue perforated uprights, orange beams, galvanised decks; bays 120 / 150 / 180 / 210 / 240 cm clear (a run of bays shares frames), depth 50 / 60 / 80, height 200 / 250, 4 levels by default; back_to_back = double-depth block. THE product for cartons, boxed goods, long items and general warehouse storage.
- furn – generic furniture / props (not catalogue products): furn_kind station ("עמדת מחשב": desk + pedestal + monitor + chair, 160 x 128), desk ("שולחן"), chair ("כיסא"), bench ("שולחן עבודה", industrial workbench with a pegboard), plant ("עציץ", "צמח"); furn_w_cm = width (desk / station 120 or 160, bench 150 or 200).
comp = how many tilt-bin units of each model, e.g. [{model:4,count:9}] (model = number of bins in the unit: 2,3,4,5,6,9; bigger ones at the bottom automatically). For "add one more level of #5" give the FULL new comp.
The context room.obstacles lists columns, pipes and gypsum walls as boxes (cm from the left / back wall, from_floor_cm..to_cm). Never place or move a product into one (the app also refuses it); place products next to them instead. Obstacles are set by the user in the scene settings, not by ops.

Names people use (Hebrew speech, also with transcription mistakes):
- unit: "רב תא", "רב-תא 5", "רבתא", "יחידה", "מגירות מתהפכות". The number after it is the model: "רב תא 6" = model 6.
- stand: "מעמד", "מתקן", "מתקן חד צדדי" (stand_type single), "עגלה דו צדדית" / "מתקן דו צדדי" (double), "מעמד רב תא".
- excl: "עגלת אקסקלוסיב", "עגלת EXCLUSIVE", "אקסקלוסיב" (a cart). part: "מחיצה", "מחיצת אקסקלוסיב", "מחיצת EXCLUSIVE" ("טורים" = cols; "משני הצדדים" = it is double-sided anyway).
- quad: "מעמד 4 דפנות", "מגדל", "ארבע צדדי". wall: "מתלה קיר", "מתלי קיר" (also mis-heard as "מתחי קיר", "מטלה קיר"). "של שני מטר" / "2 מ'" = height_cm 200.
- arc: "ארקליות", "ארקלית 2", "אחסונית", "ארגז ליקוט". "4 ארקליות 3 בשורה" → add arc model 3, count 4, row x.
- tena: "תא נע", "תא-נע דלוקס", "דלוקס", "DELUXE" – sized by WINGS: "דלוקס 4 כנפיים" = tena_size 4, "7 כנפיים" = 7, "10 כנפיים" = 10.
- smart: "תא נע סמארט", "סמארט", "SMART". tamb: "ארון מאובטח", "ארון רב תא מאובטח". mtamb: "ארון תריס". mdoor: "ארון מדפים", "ארון 4 מדפים", "ארון דלתות". tech: "ארון עבודה טכני", "ארון טכני", "ארון עבודה", "ארון מגירות", "ארון סדנה".
Rows of tilt bins: "השורות הראשונות" / "השורה הראשונה" = the BOTTOM rows (counted from the floor up). Bigger models always sit lower.
To fill up to a height: give the fixed part in comp (e.g. "three first rows #5" → comp [{model:5,count:3}]) and fill_model = the model for "the rest" + fill_to_cm = the total height asked ("עד גובה 2 מטר" → 200). The app computes how many fit. Use fill_model also for "full of #6" / "רק רב תא 6" (comp empty, fill_model 6).
Wings of a tena / smart: settings.wings = [{layer:'rear'|'middle'|'front', model, count}] – "הכנפיים האחוריות רק רב תא 3" → {layer:'rear', model:3, count:null} (null = as many as fit). Wings not mentioned are left as they are.
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
  const light = req.body?.light || null;
  const editor = req.body?.context === 'product_editor';

  const settings = nul({
    type:'object', additionalProperties:false,
    required:['stand_type', 'base', 'height_cm', 'comp', 'arc', 'bin_layout', 'shelf_bins', 'fill_model', 'fill_to_cm', 'wings', 'cols', 'top', 'tena_size', 'doors', 'unit_bins', 'md_color', 'align', 'tech_variant', 'door_bins', 'door_acc', 'furn_kind', 'furn_w_cm', 'wb_variant', 'wb_tools', 'wb_top', 'shelving'],
    properties:{
      stand_type:nul({ type:'string', enum:['single', 'double'] }),
      base:nul({ type:'string', enum:['wheels', 'legs'] }),
      height_cm:nul({ type:'number' }),
      comp:nul({ type:'array', items:{ type:'object', additionalProperties:false, required:['model', 'count'], properties:{ model:{ type:'integer', enum:[2, 3, 4, 5, 6, 9] }, count:{ type:'integer' } } } }),
      arc:nul({ type:'object', additionalProperties:false, required:['model', 'cols', 'rows', 'height_cm', 'color', 'divider'], properties:{
        model:nul({ type:'integer', enum:[1, 2, 3, 4] }), cols:nul({ type:'integer' }), rows:nul({ type:'integer' }), height_cm:nul({ type:'number' }),
        color:nul({ type:'string', enum:['blue', 'grey'] }), divider:nul({ type:'boolean' }) } }),
      bin_layout:nul({ type:'string', enum:['mixed', 'full'], description:'mtamb / mdoor: a ready layout of pick bins (moves the shelves): mixed = floor 4 x #2, 4x2 #2, 6x2 #3, 6x3 #3, top 4x2 #2; full = only ארקלית 3, 6 across on the floor and every shelf' }),
      shelf_bins:nul({ type:'array', description:'mtamb / mdoor / tech: ארקליות standing on the shelves', items:{ type:'object', additionalProperties:false, required:['shelf', 'model', 'cols', 'rows'], properties:{
        shelf:{ type:'integer', description:'1 = the top shelf, 2 the one under it …; 0 = the floor of the cabinet' }, model:nul({ type:'integer', enum:[2, 3, 4], description:'null = take the bins off this shelf' }),
        cols:nul({ type:'integer', description:'null = as many as fit across' }), rows:nul({ type:'integer', description:'how many stacked; null = as many as fit' }) } } }),
      fill_model:nul({ type:'integer', enum:[2, 3, 4, 5, 6, 9], description:'"the rest" / "only" this model: the app adds as many as fit (up to fill_to_cm, or the product\'s height)' }),
      fill_to_cm:nul({ type:'number', description:'total height of the product asked for, in cm' }),
      wings:nul({ type:'array', items:{ type:'object', additionalProperties:false, required:['layer', 'model', 'count'], properties:{
        layer:{ type:'string', enum:['rear', 'middle', 'front'] }, model:{ type:'integer', enum:[2, 3, 4, 5, 6, 9] }, count:nul({ type:'integer' }) } } }),
      cols:nul({ type:'integer', enum:[2, 3, 4] }),
      top:nul({ type:'string', enum:['black', 'white'] }),
      tena_size:nul({ type:'integer', enum:[4, 7, 10] }),
      doors:nul({ type:'boolean' }),
      unit_bins:nul({ type:'integer', enum:[2, 3, 4, 5, 6, 9] }),
      md_color:nul({ type:'string', enum:['7035'] }),
      tech_variant:nul({ type:'integer', enum:[1, 2, 3, 4], description:'tech: 1 = 4 shelves, 2 = 8 levels with ארקליות 2, 3 = one drawer, 4 = 3 drawers' }),
      door_acc:nul({ type:'string', enum:['tools', 'bins', 'both', 'none'], description:'tech (variants 3 / 4): what hangs inside the doors – tools = hand tools (screwdrivers, spanners), bins = ארקליות 4, both (default), none' }),
      door_bins:nul({ type:'object', additionalProperties:false, required:['left', 'right'], description:'tech (variants 3 / 4): ארקלית 4 hanging on each door', properties:{ left:{ type:'integer' }, right:{ type:'integer' } } }),
      align:nul({ type:'string', enum:['back', 'front'] }),
      furn_kind:nul({ type:'string', enum:['station', 'desk', 'chair', 'bench', 'plant'] }),
      furn_w_cm:nul({ type:'integer', enum:[120, 150, 160, 200] }),
      wb_variant:nul({ type:'integer', enum:[1, 2, 3] }),
      wb_tools:nul({ type:'boolean' }),
      wb_top:nul({ type:'string', enum:['green', 'white'], description:'wb: the work top – green anti-static (default) or white' }),
      shelving:nul({ type:'object', additionalProperties:false, required:['bays_cm', 'depth_cm', 'height_cm', 'levels', 'back_to_back', 'corner'], description:'shelf (medium-duty shelving) only', properties:{
        bays_cm:{ type:'array', items:{ type:'integer', enum:[120, 150, 180, 210, 240] }, description:'the bays of the run, left to right: clear width between the uprights (a starter + extensions sharing frames); [] = keep' },
        depth_cm:nul({ type:'integer', enum:[50, 60, 80] }), height_cm:nul({ type:'integer', enum:[200, 250] }),
        levels:nul({ type:'integer', description:'number of shelf levels (default 4), spread evenly' }),
        back_to_back:nul({ type:'boolean', description:'a second identical run back to back behind it (double depth) – very common' }),
        corner:nul({ type:'string', enum:['none', 'left', 'right'], description:'a second run turning 90° toward the front at that end (L shape); its bays = the first bay' }) } }),
    },
  });
  const bins = nul({ type:'object', additionalProperties:false, required:['face', 'rows', 'cols', 'random', 'all'], properties:{
    face:{ type:'string', enum:['front', 'back', 'left', 'right', 'all'], description:'which side of the product (as listed in its faces); "front" when not said' },
    rows:{ type:'array', items:{ type:'integer' }, description:'row numbers counted from the TOP (1 = top row); negative counts from the bottom (-1 = bottom row); empty = every row' },
    cols:{ type:'array', items:{ type:'integer' }, description:'bin numbers in the row counted from the LEFT as you face that side (1 = leftmost); negative from the right; empty = every bin' },
    random:{ type:'integer', description:'>0: open / close only this many bins chosen at random among the selected ones' },
    all:{ type:'boolean', description:'true = every bin of the product on every side' } } });
  const op = { type:'object', additionalProperties:false,
    required:['op', 'target', 'type', 'saved_model', 'count', 'name', 'settings', 'x_cm', 'z_cm', 'rot', 'row', 'wall', 'fill', 'y_cm', 'dx_cm', 'dz_cm', 'dy_cm', 'deg', 'open', 'bins', 'which', 'door', 'text', 'labels', 'room', 'light', 'opening', 'obstacle', 'photo'],
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
      wall:nul({ type:'string', enum:['back', 'left', 'right', 'front'], description:'add: put the products against this wall (their back to it, side by side); the app places and turns them – leave x_cm, z_cm, rot null' }),
      fill:nul({ type:'boolean', description:'add with wall: as many as fit along the whole wall ("על שלושה קירות" → one add per wall, each fill true)' }),
      y_cm:nul({ type:'number', description:'add: height of the bottom of the product above the floor ("20 ס\"מ מעל הרצפה" → 20)' }),
      dx_cm:nul({ type:'number' }), dz_cm:nul({ type:'number' }), dy_cm:nul({ type:'number' }),
      deg:nul({ type:'number' }),
      open:nul({ type:'boolean' }),
      bins,
      which:nul({ type:'string', enum:['all', 'left', 'right'], description:'doors: which door(s)' }),
      door:nul({ type:'integer', description:'doors on a lock (locker): door number 1–6 (top row 1–3 from the left, bottom row 4–6); null = all its doors' }),
      text:nul({ type:'string', description:'contents (and add): what goes inside the bins of this product (for the realistic render), in the user\'s words' }),
      labels:nul({ type:'object', additionalProperties:false, required:['mode', 'texts', 'per_label', 'clear_texts'], description:'labels op: the paper labels on the bin / drawer fronts of the product', properties:{
        mode:{ type:'string', enum:['none', 'blank', 'text'], description:'none = no labels, blank = plain white labels, text = labels with writing' },
        texts:{ type:'array', items:{ type:'string' }, description:'what to write, in the user\'s words (Hebrew as said), short (≤ 40 chars each); empty = keep the texts it has (with mode text and no texts the labels show the product\'s contents)' },
        per_label:{ type:'boolean', description:'true = texts[0] on label 1, texts[1] on label 2 … ("על התא הראשון…"); false = the texts are spread over all its labels, each over a run of neighbours' },
        clear_texts:{ type:'boolean', description:'true = erase the texts written before' } } }),
      room:nul({ type:'object', additionalProperties:false, required:['width_m', 'depth_m', 'back', 'left', 'right', 'front'], properties:{
        width_m:{ type:'number' }, depth_m:{ type:'number' }, back:{ type:'boolean' }, left:{ type:'boolean' }, right:{ type:'boolean' }, front:nul({ type:'boolean' }) } }),
      opening:nul({ type:'object', additionalProperties:false, required:['action', 'index', 'kind', 'type', 'wall', 'width_cm', 'height_cm', 'offset_cm', 'sill_cm'], properties:{
        action:{ type:'string', enum:['add', 'set', 'remove'] },
        index:nul({ type:'integer', description:'set / remove: the opening\'s index from room.openings (null = the last one of that kind / wall)' }),
        kind:nul({ type:'string', enum:['door', 'window'] }),
        type:nul({ type:'string', enum:['single', 'double', 'sliding', 'passage', 'std', 'shop', 'high'], description:'door: single (דלת רגילה), double (כפולה), sliding (הזזה / זכוכית), passage (מעבר פתוח). window: std (חלון רגיל), shop (ויטרינה), high (חלון גבוה צר)' }),
        wall:nul({ type:'string', enum:['back', 'left', 'right', 'front'] }),
        width_cm:nul({ type:'number' }), height_cm:nul({ type:'number' }),
        offset_cm:nul({ type:'number', description:'distance from the corner: on the back / front wall from the LEFT wall, on the side walls from the BACK wall; null = in the middle of the wall' }),
        sill_cm:nul({ type:'number', description:'window: height of its bottom above the floor' }) } }),
      obstacle:nul({ type:'object', additionalProperties:false, required:['action', 'index', 'kind', 'x_cm', 'z_cm', 'width_cm', 'depth_cm', 'height_cm'], properties:{
        action:{ type:'string', enum:['add', 'set', 'remove', 'clear'], description:'clear = remove every obstacle of that kind (kind null = all)' },
        index:nul({ type:'integer', description:'set / remove: its index from room.obstacles (1-based; null = the last one of that kind)' }),
        kind:nul({ type:'string', enum:['step', 'column', 'pipe', 'gypsum', 'tap'], description:'step = a floor-coloured display step / plinth (הגבהה, מדרגה, במה, פודסט) that products stand on; column = עמוד; pipe = vertical צינור; gypsum = new gypsum wall (קיר גבס); tap = ברז' }),
        x_cm:nul({ type:'number', description:'its CENTRE from the left wall' }), z_cm:nul({ type:'number', description:'its CENTRE from the back wall' }),
        width_cm:nul({ type:'number', description:'size along x (gypsum: its length, running across the room)' }), depth_cm:nul({ type:'number', description:'size along z' }),
        height_cm:nul({ type:'number' }) } }),
      photo:nul({ type:'object', additionalProperties:false, required:['ratio', 'view'], properties:{
        ratio:nul({ type:'string', enum:['1:1', '3:4', '4:3', '5:4', '4:5', '2:3', '3:2', '9:16', '16:9'], description:'the picture ratio for the realistic render' }),
        view:nul({ type:'string', enum:['front', 'three_quarter', 'top'], description:'front = straight on, slightly from above (catalogue); three_quarter = from the front-right corner' }) } }),
      light:nul({ type:'object', additionalProperties:false, required:['type', 'clock', 'elevation_deg', 'power_pct', 'power_change_pct', 'soft', 'soft_level'], properties:{
        type:nul({ type:'string', enum:['studio', 'sun', 'cloudy', 'fluor', 'bulb'], description:'סטודיו / שמש / מעונן-חלון / פלורסנט / נורה חמה' }),
        clock:nul({ type:'number', description:'where the light comes from, as a clock seen from above: 12 = from the back wall, 3 = from the right, 6 = from the front (the viewer), 9 = from the left' }),
        elevation_deg:nul({ type:'number', description:'height of the light: 90 = straight above, 10 = low' }),
        power_pct:nul({ type:'number', description:'absolute strength, 100 = normal (30–200)' }),
        power_change_pct:nul({ type:'number', description:'relative change: "פחות חזק ב-20%" → -20, "חזק יותר" → +20' }),
        soft:nul({ type:'string', enum:['softer', 'sharper'], description:'"צל רך יותר" → softer, "צל חד יותר" → sharper' }),
        soft_level:nul({ type:'number', description:'absolute shadow softness 1 (sharp) – 20 (very soft)' }) } }),
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
    '- doors: open (true/false) the doors (mdoor / tech hinged doors, tena sliding doors), which = all / left / right. tambour: open (true/false) the roller shutter of tamb / mtamb.',
    '- contents: text = what is inside the bins of that product for the realistic render ("שים ברגים ירוקים" → contents "ברגים ירוקים"). The 3D model does not show contents.',
    '- room: change the room size / walls. "החדר שלי 4 על 6" = width 4, depth 6 (the first number is the width, across the front, unless the user says otherwise); keep the walls that are on and switch on any wall that products are put against.',
    '- add with wall: "על הקיר הימני", "צמוד לקיר האחורי", "על שלושה קירות" (= back, left, right – one add per wall). Several identical products on one wall = ONE add with count; "מלא את הקיר" / "על כל הקיר" / "על שלושה קירות" without a number → fill true. "מימין" for one more product = against the right wall. Height above the floor → y_cm.',
    '- opening: doors and windows in the walls (room.openings lists the ones there are). "תוסיף דלת כפולה ברוחב 1.6 בקיר השמאלי" → add, kind door, type double, wall left, width_cm 160. Sizes the user did not say stay null (the app uses the type\'s standard size). The app never places products in front of doors or windows.',
    '- obstacle: columns, pipes, gypsum walls, taps and display STEPS (room.obstacles lists them, 1-based). A step ("הגבהה", "מדרגה", "במה", "פודסט", "על הגבהה של הרצפה") is a box in the floor\'s own colour that products stand ON – for catalogue photos. To put a product on a step give its add / move_to x_cm, z_cm INSIDE the step (the app lifts it onto the top). "חלקן על הגבהה" → 2–3 steps of different heights (e.g. 10, 20, 35 cm), each a little wider / deeper than the products on it, some products on them and the rest on the floor next to / in front of them, all close together as one composition.',
    '- photo: a catalogue / product picture ("תמונה לקטלוג", "בתמונה 4:5", "צילום מוצר") → photo with the ratio (default 4:5) and view (default front); it frames the camera on the products and presets the render ratio. Put it LAST, after the products. For a catalogue shot also clear the scene first if the user asks for only these products, keep the room with no side walls, and use light type studio.',
    '- light: the lighting of the scene (only the fields the user mentioned; the rest null). "תאורת סטודיו משעה 5" → type studio, clock 5. "פחות חזקה ב-20%" → power_change_pct -20. "צל רך יותר" / "צל רק יותר" (a common mis-hearing of רך) → soft softer.',
    '- design: planning a WHOLE space or AREAS / ZONES – "תיצור לי מרחב / אולם / חנות / מחסן…", "תעשה לי אזור של עמדות עם מחיצות", "תכנן לי את החדר", "תסדר את החדר", or changing such zones ("תזיז את אזור העמדות לקיר השמאלי", "עוד שתי עמדות", "בלי העגלות" when the products are in a zone). Then return ONE op design with text = the user\'s full request, and no other op. Single products ("תוסיף מחיצה", "תזיז את זה") are NOT design.',
    '- labels: the paper labels on the fronts of bins, pick bins and drawers (tilt-bin products, ארקליות, the workbench and technical-cabinet drawers). "תשים תוויות" → mode blank; "תוויות עם כיתוב" / "תכתוב על התוויות ברגים, אומים" → mode text with texts ["ברגים","אומים"] (per_label false); "בלי תוויות" → none. With mode text and no texts, the labels show what the product holds (its contents). Each product in the scene lists its labels mode.',
    '- contents also fits the kind of shop: "זו חנות ממתקים" → contents "ממתקים" on every product added (or the add\'s text field).',
    '"המתקן הזה / המוצר הזה / זה" = the selected product (target null). Products can also be named by their name, type or position ("המחיצה השנייה", "זה שליד הקיר").',
    ...(editor ? [
      'CONTEXT: the user is in the PRODUCT EDITOR, setting up ONE product before it goes into the scene (it is the selected product, if any). There is no room here: never use move / rotate / room / clear / select / duplicate / delete.',
      'Use: set (change its settings), bins, doors, tambour, contents; "add" (with type, saved_model, settings) only to switch to / pick another product to set up; "commit" = add the product being set up to the scene (count = how many times, e.g. "תוסיף שלושה כאלה לסצנה" → commit count 3).',
    ] : ['Never use commit.']),
    'Every field that is not used by an op is null. Use only the product ids listed. Do not invent things the user did not ask for.',
  ].join('\n');
  const user = `Room now: ${JSON.stringify(room)}\nLighting now: ${JSON.stringify(light)}\nSelected product id: ${selected === null ? 'none' : selected}\nProducts in the scene: ${JSON.stringify(existing)}\nSaved models per type: ${JSON.stringify(models)}\n\nRequest:\n${text}`;
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
