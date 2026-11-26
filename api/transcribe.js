// Speech to text for the voice commands: the browser records, this sends the audio to OpenAI's transcription model
// with the product words as a hint (the browser's own Hebrew recognition does not know "רב תא", "ארקלית"...).
//
//   POST /api/transcribe?lang=he|en   (admin)  raw audio body (webm / mp4 / ogg / wav) → { text }
import { isAdmin } from './_auth.js';

export const config = { maxDuration: 60 };
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
const EXT = { 'audio/webm':'webm', 'audio/mp4':'mp4', 'audio/x-m4a':'m4a', 'audio/m4a':'m4a', 'audio/ogg':'ogg', 'audio/wav':'wav', 'audio/mpeg':'mp3', 'audio/aac':'mp4' };
const HINT_HE = 'שיחה על תכנון אחסון ב-HISTORGIC של MEDIKUP. מילים שיכולות להופיע: רב תא, רב-תא 2, 3, 4, 5, 6, 9, מגירות מתהפכות, ארקלית, ארקליות, '
  + 'מעמד, מעמד 4 דפנות, עגלה, עגלת רב תא, ארון, ארון תריס, ארון 2 דלתות, ארון מנעול, תא נע, מדפים, מדף בעומס בינוני, מתקן קיר, '
  + 'שולחן עבודה, עמדת מחשב, כיסא, עציץ, קיר אחורי, קיר שמאלי, קיר ימני, קיר קדמי, ויטרינה, דלת הזזה, מעבר, עמוד, צינור, קיר גבס, '
  + 'רצפה, אפוקסי, בטון חשוף, גומי כחול, פח מרוג, דק עץ, אריחים, קירות, פח גלי, איסכורית, בלוקים, לבנים, בטון יצוק, גובה תקרה, '
  + 'חלון נטוי, קיפ, קלרסטורי, טרנסום, חלון גבוה, דלת כפולה, דלת אלון, דלת זכוכית, משקוף, קשת, ארון חשמל, לוח חשמל, עמדת כיבוי אש, '
  + 'רדיאטור, תעלת מיזוג, צינור אופקי, צינור אנכי, קורת I, ברז, מדרגות, במה, חצי קיר, אנתרציט, אגוז, כסוף, תפתח, תסגור, '
  + 'רב תא שתיים, רב תא שלוש, רב תא ארבע, רב תא חמש, רב תא שש, רב תא תשע, ארקלית אחת, ארקלית שתיים, ארקלית שלוש, ארקלית ארבע, שתי ארקליות, שלוש ארקליות, '
  + 'אחסונית, ארגז ליקוט, תא נע סמארט, תא נע דלוקס, לה פורטצה, טונון, טופ, ארון משרדי, ארון טכני, ארון טכני עם מגירה, ארון טכני עם 3 מגירות, מדפים לעומס בינוני, מדפי רשת, '
  + 'לוקר, לוקר 6 תאים, לוקר כפול, מתלה קיר 60, 120, 200, מעמד חד צדדי, עגלה חד צדדית, על עמודים, על גלגלים, עגלת אקסקלוסיב, מחיצת אקסקלוסיב, שולחן טכני, מודול 60 על 40, מעמד ארבע דפנות, מעמד 180, מעמד 200, לה פורטצה עם ארקליות, '
  + 'עגלות רפואיות, עגלת החייאה, שולחן אלון, שולחן לבן, שולחן סקנדינבי, שולחן תעשייתי, עם מגירות, כיסא מנהלים, כיסא רשת, כיסא בד אפור, מסך, מוניטור, מסך מעוקל, מסך רחב, שני מסכים, שולחן בר, כיסא בר, שרפרף, טלוויזיה, מלגזה, מקרר, מכונת חטיפים, מכונת שתייה, כוס קפה, ספל, דקל, מונסטרה, קקטוס, סנסווריה, שרך, סוקולנטים, צבעונים, שורה, טור, עמודה, קבוצה, מחיצה, אורך, רוחב, עומק, '
  + 'סנטימטר, מטר, מילימטר, תוסיף, תמחק, תזיז, תסובב, תקרב, תרחיק, צמוד, ליד, מול, באמצע, בפינה, מתחת ל, מעל.';
const HINT_EN = 'Storage planning in HISTORGIC by MEDIKUP: tilt-bin units, tilt bin unit two, three, four, five, six, nine, pick bin one, two, three, four, pick bins, stands, carts, cabinets, tambour cabinet, shelving, wall rack, desk, back wall, left wall, right wall, front wall, shop window, storefront, epoxy floor, exposed concrete, diamond plate, wood deck, corrugated metal, cinder block, brick, tilt window, clerestory, transom, double door, sliding door, archway, electrical cabinet, breaker panel, fire hose cabinet, radiator, HVAC duct, I-beam, faucet, steps, half wall, drywall, anthracite, walnut, pick bin, gondola, La Fortezza, Smart, Deluxe, office cabinet, technical cabinet, single drawer, three drawer, mid-weight shelf system, wire shelving, 6 door locker, 2 door locker, wall mount tilt bin unit, one sided stand, one sided cart, on legs, on wheels, exclusive cart, exclusive partition, technical table, four sided stand, Top tray, 60x40 module, medical carts, emergency cart, oak desk, white desk, Scandinavian desk, executive chair, mesh chair, monitor, curved monitor, dual monitors, bar table, bar stool, TV, forklift, fridge, vending machine, coffee cup, mug, palm, monstera, cactus, snake plant, fern, succulents, tulips, row, column, group, partition, length, width, height, depth.';

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'method not allowed' });
    if (!isAdmin(req)) return res.status(401).json({ error:'נדרש מצב ניהול' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:'OPENAI_API_KEY is not set' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!EXT[type]) return res.status(400).json({ error:'פורמט שמע לא נתמך: ' + type });
    const buf = await rawBody(req);
    if (buf.length < 800) return res.status(200).json({ text:'' });                 // nothing was said
    if (buf.length > 4_300_000) return res.status(413).json({ error:'ההקלטה ארוכה מדי' });
    const en = String(req.query?.lang || '') === 'en';
    const f = new FormData();
    f.append('file', new Blob([buf], { type }), 'speech.' + EXT[type]);
    f.append('model', MODEL);
    f.append('language', en ? 'en' : 'he');
    f.append('prompt', en ? HINT_EN : HINT_HE);
    f.append('response_format', 'json');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` }, body:f });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error:j.error?.message || `OpenAI ${r.status}` });
    return res.status(200).json({ text:String(j.text || '').trim() });
  } catch (e) {
    return res.status(500).json({ error:e.message || 'transcribe failed' });
  }
}
