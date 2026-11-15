// Admin check: the page sends the password in the x-admin-key header.
import { timingSafeEqual } from 'node:crypto';

export function isAdmin(req) {
  const want = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers['x-admin-key'] || '');
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
