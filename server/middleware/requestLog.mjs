/**
 * Request logging, metrics collection, and audit trail.
 */

import crypto from "node:crypto";
import { readEnvInt, DEFAULT_AUDIT_MAX_EVENTS, DEFAULT_ENABLE_REQUEST_LOGS } from "../lib/config.mjs";

export const requestMetrics = {
  total: 0,
  byMethod: new Map(),
  byStatusClass: new Map(),
  byPath: new Map(),
  latencyMsTotal: 0,
  latencyMsMax: 0,
};

export const auditTrail = [];
export const serverStartedAt = Date.now();

export function createRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

export function logRequest(req, res, { requestId, startedAt, path, clientAddress }) {
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const status = res.statusCode || 0;
  const method = (req.method || "GET").toUpperCase();

  requestMetrics.total += 1;
  requestMetrics.byMethod.set(method, (requestMetrics.byMethod.get(method) || 0) + 1);

  const statusClass = `${Math.floor(status / 100)}xx`;
  requestMetrics.byStatusClass.set(statusClass, (requestMetrics.byStatusClass.get(statusClass) || 0) + 1);

  const pathKey = path.replace(/\/[a-f0-9-]{8,}/g, "/:id");
  requestMetrics.byPath.set(pathKey, (requestMetrics.byPath.get(pathKey) || 0) + 1);

  requestMetrics.latencyMsTotal += durationMs;
  if (durationMs > requestMetrics.latencyMsMax) {
    requestMetrics.latencyMsMax = durationMs;
  }

  const enableLogs = readEnvInt("LEXMATCH_ENABLE_REQUEST_LOGS", DEFAULT_ENABLE_REQUEST_LOGS ? 1 : 0) !== 0;

  if (enableLogs) {
    console.log(
      JSON.stringify({
        type: "request",
        requestId,
        method,
        path,
        status,
        durationMs: Math.round(durationMs * 100) / 100,
        clientAddress,
        ts: new Date().toISOString(),
      }),
    );
  }
}

export function recordAuditEvent(event) {
  const maxEvents = readEnvInt("LEXMATCH_AUDIT_MAX_EVENTS", DEFAULT_AUDIT_MAX_EVENTS);
  auditTrail.push({ ...event, ts: new Date().toISOString() });
  if (auditTrail.length > maxEvents) {
    auditTrail.splice(0, auditTrail.length - maxEvents);
  }
}

export function buildMetricsSnapshot() {
  const avg =
    requestMetrics.total > 0
      ? requestMetrics.latencyMsTotal / requestMetrics.total
      : 0;

  return {
    uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
    requests: {
      total: requestMetrics.total,
      byMethod: Object.fromEntries(requestMetrics.byMethod),
      byStatusClass: Object.fromEntries(requestMetrics.byStatusClass),
      topPaths: Array.from(requestMetrics.byPath.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([path, count]) => ({ path, count })),
    },
    latency: {
      avgMs: Math.round(avg * 100) / 100,
      maxMs: Math.round(requestMetrics.latencyMsMax * 100) / 100,
    },
  };
}
