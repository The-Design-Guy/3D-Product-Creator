// Quick setup check: open /api/health after deploying.
// Shows which settings are in place – variable NAMES only, never their values.
import { redis, redisEnvNames } from './_redis.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const names = redisEnvNames();
  const out = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    OPENAI_IMAGE_MODEL: !process.env.OPENAI_IMAGE_MODEL ? 'gpt-image-2.5-sunburst (ברירת מחדל)' : /^[a-z0-9.\-]{2,60}$/i.test(process.env.OPENAI_IMAGE_MODEL) && !/^(sk-|AIza|AQ\.)/.test(process.env.OPENAI_IMAGE_MODEL) ? process.env.OPENAI_IMAGE_MODEL : '⚠ הערך כאן אינו שם מודל',
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    // never echo a value that is not plainly a model name (a key pasted into the wrong variable must not show here)
    GEMINI_IMAGE_MODEL: !process.env.GEMINI_IMAGE_MODEL ? 'gemini-nano-banana-2.1 (ברירת מחדל)' : /^gemini-[a-z0-9.\-]{2,60}$/.test(process.env.GEMINI_IMAGE_MODEL) ? process.env.GEMINI_IMAGE_MODEL : '⚠ הערך כאן אינו שם מודל',
    redis_url_var: names.url || 'לא נמצא',
    redis_token_var: names.token || 'לא נמצא',
    redis_connected: false,
  };
  try { await redis(['PING']); out.redis_connected = true; } catch (e) { out.redis_error = e.message; }
  out.ready = out.OPENAI_API_KEY && out.ADMIN_PASSWORD && out.redis_connected;
  res.status(200).json(out);
}
