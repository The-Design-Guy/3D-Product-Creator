// Minimal Upstash Redis REST client (no dependencies).
// Finds the REST URL + read/write token under any of the names the Vercel / Upstash integrations use:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL / KV_REST_API_TOKEN
//   <PREFIX>_KV_REST_API_URL / <PREFIX>_KV_REST_API_TOKEN   (custom prefix, e.g. UPSTASH_REDIS_REST_KV_REST_API_URL)
// The read-only token (…_READ_ONLY_TOKEN) and the redis:// URLs (…_KV_URL, …_REDIS_URL) are never used.

const URL_NAMES = ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_KV_REST_API_URL'];
const TOKEN_NAMES = ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_KV_REST_API_TOKEN'];

function pick(names, suffix) {
  for (const n of names) if (process.env[n]) return n;
  // any other custom prefix the integration may have used
  return Object.keys(process.env).find(n => n.endsWith(suffix) && !n.includes('READ_ONLY') && process.env[n]) || null;
}

// names only – never the values
export function redisEnvNames() {
  return { url: pick(URL_NAMES, '_KV_REST_API_URL'), token: pick(TOKEN_NAMES, '_KV_REST_API_TOKEN') };
}

export async function redis(cmd) {
  const { url, token } = redisEnvNames();
  if (!url || !token) throw new Error('Redis is not connected (no REST API URL / TOKEN env vars found)');
  const r = await fetch(process.env[url], {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env[token]}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
