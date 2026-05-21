/**
 * In-memory rate limiter.
 * Keys are "{bucket}:{clientAddress}".
 */

import { readEnvInt } from "../lib/config.mjs";

const rateLimitBuckets = new Map();

/**
 * @param {string} bucket  - Logical bucket name (e.g. "search", "analyze-pdf")
 * @param {string} clientId - Client identifier (IP address)
 * @param {number} maxRequests
 * @param {number} windowMs
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function consumeRateLimit(bucket, clientId, maxRequests, windowMs) {
  const key = `${bucket}:${clientId}`;
  const now = Date.now();
  let entry = rateLimitBuckets.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitBuckets.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}

/** Prune stale buckets periodically to avoid memory growth. */
export function pruneRateLimitBuckets() {
  const now = Date.now();
  for (const [key, entry] of rateLimitBuckets) {
    if (now >= entry.resetAt) rateLimitBuckets.delete(key);
  }
}

export function getClientAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}
