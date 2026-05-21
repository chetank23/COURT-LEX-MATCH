/**
 * Observability routes: /api/health, /api/metrics, /api/audit
 */

import { sendJson } from "../lib/config.mjs";
import { serverStartedAt, buildMetricsSnapshot, auditTrail } from "../middleware/requestLog.mjs";

export function handleHealth(res) {
  sendJson(res, 200, {
    ok: true,
    service: "lexmatch-api",
    uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
  });
}

export function handleMetrics(res) {
  sendJson(res, 200, buildMetricsSnapshot());
}

export function handleAudit(url, res) {
  const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
  sendJson(res, 200, auditTrail.slice(-safeLimit).reverse());
}
