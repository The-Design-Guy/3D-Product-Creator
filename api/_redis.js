// Minimal Upstash Redis REST client (no dependencies).
// Works with the env vars the Vercel Marketplace integration adds (KV_* or UPSTASH_*).
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export async function redis(cmd) {
  if (!URL_ || !TOKEN) throw new Error('Redis is not connected (missing UPSTASH/KV env vars)');
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
