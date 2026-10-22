/** Rate limit simple en memoria (por proceso / IP). */

const buckets = new Map();

/**
 * @param {string} key
 * @param {{ limit: number, windowMs: number }} opts
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((b.start + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

export function clientKey(req, suffix) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local")
    .split(",")[0]
    .trim();
  return `${suffix}:${ip}`;
}
