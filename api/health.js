// Quick setup check: open /api/health after deploying.
// Shows which settings are in place (never their values).
import { redis } from './_redis.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const out = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst (ברירת מחדל)',
    redis_connected: false,
  };
  try { await redis(['PING']); out.redis_connected = true; } catch (e) { out.redis_error = e.message; }
  out.ready = out.OPENAI_API_KEY && out.ADMIN_PASSWORD && out.redis_connected;
  res.status(200).json(out);
}
