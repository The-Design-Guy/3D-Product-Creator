// Quick setup check: open /api/health after deploying.
// Shows which settings are in place – variable NAMES only, never their values.
import { redis, redisEnvNames } from './_redis.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const names = redisEnvNames();
  const out = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst (ברירת מחדל)',
    redis_url_var: names.url || 'לא נמצא',
    redis_token_var: names.token || 'לא נמצא',
    redis_connected: false,
  };
  try { await redis(['PING']); out.redis_connected = true; } catch (e) { out.redis_error = e.message; }
  out.ready = out.OPENAI_API_KEY && out.ADMIN_PASSWORD && out.redis_connected;
  res.status(200).json(out);
}
