import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// ── Load .env file early (before any other imports use env vars) ──────────
try {
  const __envDir = path.dirname(fileURLToPath(import.meta.url));
  const envPaths = [
    path.join(__envDir, ".env"),
    path.join(__envDir, "..", ".env"),
  ];
  for (const envPath of envPaths) {
    const raw = await readFile(envPath, "utf8").catch(() => null);
    if (!raw) continue;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
    break;
  }
} catch {
  /* .env is optional */
}
import {
  listJudges,
  getJudgeById,
  createJudge,
  updateJudge,
  deleteJudge,
  listHearings,
  getHearingById,
  createHearing,
  updateHearing,
  deleteHearing,
  listHistory,
  createHistoryEvent,
  listManagedCases,
  upsertManagedCase,
  updateManagedCase,
  deleteManagedCase,
  createPriorityOverride,
  listPriorityOverrides,
  checkDbHealth,
} from "./db/store.mjs";
import { generateSummary } from "./services/summarizer.mjs";
import { mapJudgement } from "./services/judgementMapper.mjs";
import { buildMatchExplanation } from "./services/explanationGenerator.mjs";
import { getMatchLevel } from "./services/similarity.mjs";
import {
  buildRagIndex,
  queryRag,
  hydrateRagIndex,
} from "./services/ragService.mjs";
import { generateDeepSeekGroundedAnswer } from "./services/deepseekClient.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "public", "data", "cases_import.json");

const DEFAULT_PDF_OCR_TIMEOUT_MS = 15000;
const DEFAULT_PDF_OCR_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_PDF_OCR_WIDTH = 1400;
const DEFAULT_MAX_JSON_BODY_BYTES = 28 * 1024 * 1024;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_SEARCH_MAX = 120;
const DEFAULT_RATE_LIMIT_ANALYZE_MAX = 20;
const DEFAULT_ENABLE_REQUEST_LOGS = true;
const DEFAULT_AUDIT_MAX_EVENTS = 3000;
const LOCAL_EMBEDDING_DIMS = 192;
const VERDICT_RULES = [
  {
    label: "Convicted",
    pattern: /\b(convicted|guilty|found guilty|sentenced)\b/i,
  },
  { label: "Acquitted", pattern: /\b(acquitted|not guilty|acquittal)\b/i },
  { label: "Dismissed", pattern: /\b(dismissed|rejected|declined)\b/i },
  {
    label: "Allowed",
    pattern:
      /\b(allowed|granted|relief granted|petition allowed|appeal allowed)\b/i,
  },
  {
    label: "Partly Allowed",
    pattern:
      /\b(partly allowed|partially allowed|allowed in part|partly granted)\b/i,
  },
  { label: "Disposed", pattern: /\b(disposed(?: of)?|closed)\b/i },
  { label: "Remanded", pattern: /\b(remanded|remand)\b/i },
  { label: "Bail Granted", pattern: /\b(bail granted|released on bail)\b/i },
  {
    label: "Bail Rejected",
    pattern: /\b(bail (?:rejected|denied|dismissed))\b/i,
  },
];

const DEFAULT_FIR_ROSTER = {
  Criminal: ["Justice N. Rao", "Justice P. Mehta", "Justice S. Khan"],
  Civil: ["Justice R. Iyer", "Justice K. Banerjee", "Justice V. Sen"],
  Other: ["Justice A. Menon", "Justice D. Kapoor", "Justice T. Joseph"],
};

let caseCache = null;
let caseSearchIndex = null;
let caseSearchIndexMap = null;
let ragIndexCache = null;
const queryEmbeddingCache = new Map();
const rateLimitBuckets = new Map();
const serverStartedAt = Date.now();
const requestMetrics = {
  total: 0,
  byMethod: new Map(),
  byStatusClass: new Map(),
  byPath: new Map(),
  latencyMsTotal: 0,
  latencyMsMax: 0,
};
const auditTrail = [];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function buildHumanizedNarrative(caseItem) {
  const title = `${caseItem.title || "This case"}`.trim();
  const court = `${caseItem.court || "the court"}`.trim();
  const year = caseItem.year || "recently";
  const summary = `${caseItem.summary || ""}`.trim();
  const decision = `${caseItem.finalVerdict || caseItem.judgment || ""}`.trim();

  const intro = `${title} was heard in ${court} in ${year}.`;
  const facts = summary
    ? `In simple terms, the dispute was about ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`
    : "In simple terms, the court examined the core facts, legal rights, and applicable rules.";
  const outcome = decision
    ? `The final outcome was: ${decision}.`
    : "The court issued a final ruling after reviewing arguments from all sides.";

  return `${intro} ${facts} ${outcome}`.replace(/\s+/g, " ").trim();
}

/**
 * Build a dedicated Judgment Narrative for the "Judgment Text" UI section.
 * This is distinct from the case summary: it focuses on what the court held,
 * the verdict, issues decided, and key precedents — not the background facts.
 */
function buildJudgmentNarrative(caseItem) {
  const title = `${caseItem.title || "This case"}`.trim();
  const court = `${caseItem.court || "the court"}`.trim();
  const year = caseItem.year || "";
  const verdict = `${caseItem.finalVerdict || caseItem.final_verdict || ""}`.trim();
  const issues = `${caseItem.issues || ""}`.trim();
  const rawJudgment = `${caseItem._rawJudgment || ""}`.trim();

  const parts = [];

  // Sentence 1 — the court's pronouncement
  if (verdict && verdict !== "Judgement unavailable") {
    parts.push(`The ${court} pronounced its judgment in ${year || "this matter"}, ruling: "${verdict}"`);
  } else {
    parts.push(`The ${court} delivered its judgment in this matter${year ? " (" + year + ")" : ""}.`);
  }

  // Sentence 2 — what issues / law were decided
  if (issues) {
    const issueList = issues
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 4)
      .slice(0, 3);
    if (issueList.length > 0) {
      parts.push(
        `The court adjudicated the following legal provision${
          issueList.length > 1 ? "s" : ""
        }: ${issueList.join("; ")}.`
      );
    }
  }

  // Sentence 3 — core holding from raw judgment text (first meaningful sentence)
  if (rawJudgment && rawJudgment.length > 30) {
    const cleaned = rawJudgment
      .replace(/Cited\s+Cases\s*:\s*\{[^}]*\}?/gi, "")
      .replace(/\bDecision\s*:\s*[01](?:\.0)?\b/gi, "")
      .replace(/\bJudges?\s*:\s*[^\n;]*/gi, "")
      .replace(/[{}[\]]/g, "")
      .replace(/'\s*,\s*'/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();
    // Take a meaningful excerpt (first ≤200 chars, ending at sentence boundary)
    const excerpt = cleaned.slice(0, 220);
    const sentenceEnd = Math.max(
      excerpt.lastIndexOf("."),
      excerpt.lastIndexOf("!"),
      excerpt.lastIndexOf("?")
    );
    const snippet = sentenceEnd > 20 ? excerpt.slice(0, sentenceEnd + 1) : excerpt;
    if (snippet.length > 20 && !/^[\d\s.,;'"{}\[\]]+$/.test(snippet)) {
      parts.push(snippet);
    }
  }

  if (parts.length === 0) {
    return `The court delivered its ruling in ${title}.`;
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function loadCases() {
  if (caseCache) return caseCache;

  const payload = await readFile(DATA_PATH, "utf8");
  const rawCases = JSON.parse(payload);

  caseCache = rawCases.map((raw) => {
    const issues = extractSegment(raw.full_text, "Issues:");
    const decision = extractSegment(raw.full_text, "Decision:");
    const judgment = extractJudgmentText(raw.full_text, decision, raw.summary);
    const cleanedSummary = generateSummary(
      raw.full_text || raw.summary || raw.title || "",
    );
    const mappedJudgement = mapJudgement(judgment, cleanedSummary);
    const finalVerdict = toClearFinalJudgment(mappedJudgement, raw.title || "");
    const year =
      Number.parseInt((raw.decision_date || "").slice(0, 4), 10) || 2000;

    const similarity = computeSimilarity({
      title: raw.title,
      issues,
      decision,
      citation: raw.citation,
    });

    const priorityScore = computePriority({
      title: raw.title,
      issues,
      decision,
      citation: raw.citation,
      decision_date: raw.decision_date,
    });

    const caseItemForNarrative = {
      title: raw.title,
      court: raw.court,
      year,
      finalVerdict,
      final_verdict: finalVerdict,
      issues,
      _rawJudgment: judgment,
    };

    return {
      id: raw.case_id,
      title: raw.title,
      court: raw.court,
      year,
      citation: raw.citation || "",
      similarity,
      priorityScore,
      priorityBand: toPriorityBand(priorityScore),
      summary: cleanedSummary,
      judgment: generateSummary(judgment),
      judgmentNarrative: buildJudgmentNarrative(caseItemForNarrative),
      _rawJudgment: judgment,
      finalVerdict,
      final_verdict: finalVerdict,
      whyMatch: deriveWhyMatch({ issues, decision, citation: raw.citation }),
      type: raw.case_type || "General",
      tags: buildTags({
        issues,
        citation: raw.citation,
        jurisdiction: raw.jurisdiction,
      }),
    };
  });
  caseSearchIndex = buildCaseSearchIndex(caseCache);
  caseSearchIndexMap = new Map(caseSearchIndex.map((item) => [item.id, item]));

  const ragIndexPath = path.join(ROOT, "public", "data", "rag_index.json");
  try {
    const rawIndex = await readFile(ragIndexPath, "utf8").catch(() => null);
    if (rawIndex) {
      ragIndexCache = hydrateRagIndex(JSON.parse(rawIndex));
    }
  } catch (err) {
    console.error("Failed to hydrate RAG index, rebuilding...", err);
  }

  if (!ragIndexCache) {
    ragIndexCache = buildRagIndex(caseCache);
  }

  return caseCache;
}

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

async function readJsonBody(req) {
  const maxBytes = readEnvInt(
    "LEXMATCH_MAX_JSON_BODY_BYTES",
    DEFAULT_MAX_JSON_BODY_BYTES,
  );
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new HttpError(
        413,
        `Request body exceeds limit (${maxBytes} bytes)`,
      );
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON request body");
  }
}

function parseUrl(reqUrl = "/") {
  return new URL(reqUrl, "http://127.0.0.1");
}

function buildInsights(cases) {
  const similarityDistribution = [
    { range: "90-100%", count: 0 },
    { range: "80-89%", count: 0 },
    { range: "70-79%", count: 0 },
    { range: "60-69%", count: 0 },
    { range: "50-59%", count: 0 },
    { range: "<50%", count: 0 },
  ];

  for (const item of cases) {
    const s = item.similarity;
    if (s >= 90) similarityDistribution[0].count += 1;
    else if (s >= 80) similarityDistribution[1].count += 1;
    else if (s >= 70) similarityDistribution[2].count += 1;
    else if (s >= 60) similarityDistribution[3].count += 1;
    else if (s >= 50) similarityDistribution[4].count += 1;
    else similarityDistribution[5].count += 1;
  }

  const typeMap = new Map();
  for (const item of cases) {
    typeMap.set(item.type, (typeMap.get(item.type) || 0) + 1);
  }

  const caseClusters = Array.from(typeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count], idx) => ({
      name,
      cases: count,
      color: [
        "hsl(238, 70%, 55%)",
        "hsl(270, 60%, 60%)",
        "hsl(200, 70%, 50%)",
        "hsl(160, 60%, 45%)",
        "hsl(30, 70%, 55%)",
      ][idx],
    }));

  const topicMap = new Map();
  for (const item of cases) {
    for (const tag of item.tags) {
      topicMap.set(tag, (topicMap.get(tag) || 0) + 1);
    }
  }

  const trendingTopics = Array.from(topicMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, searches], idx) => ({
      topic,
      growth: 40 + (6 - idx) * 12,
      searches,
    }));

  const monthlySearches = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(
    (month, i) => ({
      month,
      searches: 120 + i * 45 + Math.round((cases.length / 5127) * 60),
    }),
  );

  return {
    similarityDistribution,
    caseClusters,
    trendingTopics,
    monthlySearches,
  };
}

export async function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const requestId = createRequestId();
    const startedAt = process.hrtime.bigint();
    let requestPath = req.url || "/";
    const clientAddress = getClientAddress(req);

    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      logRequest(req, res, {
        requestId,
        startedAt,
        path: requestPath,
        clientAddress,
      });
    });

    try {
      const url = parseUrl(req.url);
      const pathname = url.pathname;
      requestPath = pathname;
      const allCases = await loadCases();
      const explainMatch = pathname.match(/^\/api\/cases\/([^/]+)\/explain$/);
      const humanizeMatch = pathname.match(/^\/api\/cases\/([^/]+)\/humanize$/);
      const caseMatch = pathname.match(/^\/api\/cases\/([^/]+)$/);
      const judgeMatch = pathname.match(/^\/api\/judges\/([^/]+)$/);
      const hearingMatch = pathname.match(/^\/api\/hearings\/([^/]+)$/);

      if (pathname === "/api/cases/search" && req.method === "GET") {
        const rateWindowMs = readEnvInt(
          "LEXMATCH_RATE_LIMIT_WINDOW_MS",
          DEFAULT_RATE_LIMIT_WINDOW_MS,
        );
        const maxRequests = readEnvInt(
          "LEXMATCH_RATE_LIMIT_SEARCH_MAX",
          DEFAULT_RATE_LIMIT_SEARCH_MAX,
        );
        const limit = consumeRateLimit(
          "search",
          clientAddress,
          maxRequests,
          rateWindowMs,
        );
        if (!limit.allowed) {
          sendJson(res, 429, {
            error: "Rate limit exceeded for case search. Please retry shortly.",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(limit.retryAfterMs / 1000),
            ),
          });
          return;
        }
      }

      if (pathname === "/api/rag/query") {
        const rateWindowMs = readEnvInt(
          "LEXMATCH_RATE_LIMIT_WINDOW_MS",
          DEFAULT_RATE_LIMIT_WINDOW_MS,
        );
        const maxRequests = readEnvInt(
          "LEXMATCH_RATE_LIMIT_SEARCH_MAX",
          DEFAULT_RATE_LIMIT_SEARCH_MAX,
        );
        const limit = consumeRateLimit(
          "rag-query",
          clientAddress,
          maxRequests,
          rateWindowMs,
        );
        if (!limit.allowed) {
          sendJson(res, 429, {
            error: "Rate limit exceeded for RAG query. Please retry shortly.",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(limit.retryAfterMs / 1000),
            ),
          });
          return;
        }
      }

      if (pathname === "/api/analyze-pdf" && req.method === "POST") {
        const rateWindowMs = readEnvInt(
          "LEXMATCH_RATE_LIMIT_WINDOW_MS",
          DEFAULT_RATE_LIMIT_WINDOW_MS,
        );
        const maxRequests = readEnvInt(
          "LEXMATCH_RATE_LIMIT_ANALYZE_MAX",
          DEFAULT_RATE_LIMIT_ANALYZE_MAX,
        );
        const limit = consumeRateLimit(
          "analyze-pdf",
          clientAddress,
          maxRequests,
          rateWindowMs,
        );
        if (!limit.allowed) {
          sendJson(res, 429, {
            error:
              "Rate limit exceeded for PDF analysis. Please retry shortly.",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(limit.retryAfterMs / 1000),
            ),
          });
          return;
        }
      }

      if (pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          service: "lexmatch-api",
          uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
        });
        return;
      }

      if (pathname === "/api/metrics") {
        sendJson(res, 200, buildMetricsSnapshot());
        return;
      }

      if (pathname === "/api/audit") {
        const limit = Number.parseInt(
          url.searchParams.get("limit") || "50",
          10,
        );
        const safeLimit = Number.isFinite(limit)
          ? Math.min(Math.max(limit, 1), 200)
          : 50;
        sendJson(res, 200, auditTrail.slice(-safeLimit).reverse());
        return;
      }

      if (pathname === "/api/cases") {
        const court = url.searchParams.get("court");
        const type = url.searchParams.get("type");
        let result = allCases;

        if (court && court !== "All Courts") {
          result = result.filter((item) => item.court === court);
        }
        if (type && type !== "All Types") {
          result = result.filter((item) => item.type === type);
        }

        result = result
          .slice()
          .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
        sendJson(res, 200, result);
        return;
      }

      if (pathname === "/api/cases/search") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const limit = Number.parseInt(url.searchParams.get("limit") || "5", 10);
        const safeLimit = Number.isFinite(limit)
          ? Math.min(Math.max(limit, 1), 10)
          : 5;
        if (!q) {
          const fallbackResults = allCases.slice(0, safeLimit).map((item) => {
            const mappedJudgement = mapJudgement(
              item.judgment || item.finalVerdict || "",
              item.summary || "",
            );
            const clearFinalJudgment = toClearFinalJudgment(
              mappedJudgement,
              item.title || "",
            );
            return {
              id: item.id,
              title: item.title,
              court: item.court,
              year: item.year,
              similarity: item.similarity,
              matchLevel: getMatchLevel(item.similarity / 100),
              summary: item.summary,
              judgement: clearFinalJudgment,
              whyMatched: item.whyMatch,
              whyMatch: item.whyMatch,
              matchedTerms: item.tags.slice(0, 4),
              judgment: item.judgment,
              judgmentNarrative: item.judgmentNarrative || buildJudgmentNarrative(item),
              finalVerdict: clearFinalJudgment,
              final_verdict: clearFinalJudgment,
              type: item.type,
              tags: item.tags,
            };
          });
          sendJson(res, 200, { results: fallbackResults });
          return;
        }

        const cached = queryEmbeddingCache.get(q);
        const queryVec =
          cached?.vector || buildHashedEmbedding(q, LOCAL_EMBEDDING_DIMS);
        const queryNorm = vectorNorm(queryVec);
        if (!cached) {
          queryEmbeddingCache.set(q, { vector: queryVec, at: Date.now() });
          if (queryEmbeddingCache.size > 500) {
            const oldestKey = queryEmbeddingCache.keys().next().value;
            queryEmbeddingCache.delete(oldestKey);
          }
        }

        const ranked = allCases
          .map((item) => {
            const blob =
              `${item.title} ${item.summary} ${item.judgment || ""} ${item.finalVerdict || ""} ${item.whyMatch} ${item.tags.join(" ")} ${item.citation || ""}`.toLowerCase();
            const keywordHits = q
              .split(/\s+/)
              .filter((term) => term && blob.includes(term)).length;
            const row = caseSearchIndexMap?.get(item.id);
            const vectorScore = row
              ? Math.max(
                  0,
                  cosineSimilarity(queryVec, row.vector, row.norm, queryNorm),
                )
              : 0;
            const verdictSignalBoost = computeVerdictSignalBoost(
              item.judgment || item.summary || "",
            );
            const rankScore =
              keywordHits * 14 +
              vectorScore * 100 * 0.85 +
              item.similarity * 0.35 +
              (item.priorityScore || 0) * 0.2 +
              verdictSignalBoost;
            return { item, rankScore };
          })
          .filter((x) => x.rankScore > 0)
          .sort((a, b) => b.rankScore - a.rankScore)
          .slice(0, safeLimit)
          .map((x) => ({
            ...x,
          }));

        const formatted = ranked.map(({ item, rankScore }) => {
          const { whyMatched, matchedTerms } = buildMatchExplanation(q, item);
          const mappedJudgement = mapJudgement(
            item.judgment || item.finalVerdict || "",
            item.summary || "",
          );
          const clearFinalJudgment = toClearFinalJudgment(
            mappedJudgement,
            item.title || "",
          );

          return {
            id: item.id,
            title: item.title,
            court: item.court,
            year: item.year,
            similarity: Math.min(99, Math.max(40, Math.round(rankScore))),
            matchLevel: getMatchLevel(rankScore / 100),
            summary: generateSummary(
              `${item.summary || ""} ${item._rawJudgment || ""}`,
            ),
            judgement: clearFinalJudgment,
            whyMatched,
            whyMatch: whyMatched,
            matchedTerms,
            judgment: item.judgment,
            judgmentNarrative: item.judgmentNarrative || buildJudgmentNarrative({
              ...item,
              finalVerdict: clearFinalJudgment,
            }),
            finalVerdict: clearFinalJudgment,
            final_verdict: clearFinalJudgment,
            type: item.type,
            tags: item.tags,
          };
        });

        sendJson(res, 200, { results: formatted });
        return;
      }

      if (pathname === "/api/rag/query") {
        let query = "";
        let topK = 4;

        if (req.method === "GET") {
          query = `${url.searchParams.get("q") || ""}`;
          const parsedTopK = Number.parseInt(
            url.searchParams.get("topK") || "4",
            10,
          );
          if (Number.isFinite(parsedTopK)) topK = parsedTopK;
        } else if (req.method === "POST") {
          const payload = await readJsonBody(req);
          query = `${payload.query || ""}`;
          const parsedTopK = Number.parseInt(`${payload.topK || 4}`, 10);
          if (Number.isFinite(parsedTopK)) topK = parsedTopK;
        } else {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        if (!ragIndexCache) {
          ragIndexCache = buildRagIndex(allCases);
        }

        const response = queryRag({
          query,
          index: ragIndexCache,
          topK,
          minScore: 0.22,
        });

        const deepSeekAnswer = await generateDeepSeekGroundedAnswer({
          query: response.query,
          localAnswer: response.answer,
          sources: response.sources,
          retrievedChunks: response.retrievedChunks,
          mode: "rag",
        });

        if (deepSeekAnswer) {
          response.answer = deepSeekAnswer;
          response.grounded = true;
          response.confidence = Math.min(99, Math.max(response.confidence, 85));
        }

        recordAuditEvent({
          action: "rag_query",
          entity: "rag",
          requestId,
          clientAddress,
          details: {
            topK,
            grounded: response.grounded,
            query: `${response.query || ""}`.slice(0, 160),
          },
        });

        sendJson(res, 200, response);
        return;
      }

      // ── Structured Case Analysis (Concrete Legal Reasoning Engine) ──────────
      if (pathname === "/api/case-analysis" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const context = `${payload.context || ""}`.trim();
        if (!context) {
          sendJson(res, 400, { error: "context field is required" });
          return;
        }

        // 1. Run RAG retrieval
        if (!ragIndexCache) ragIndexCache = buildRagIndex(allCases);
        const ragResult = queryRag({
          query: context,
          index: ragIndexCache,
          topK: 4,
          minScore: 0.18,
        });
        const grounded = ragResult.grounded && ragResult.sources.length > 0;
        const src = ragResult.sources;

        // 2. Build concrete legal analysis (no generic placeholders)
        const report = buildConcreteAnalysis(context, ragResult, grounded, src);

        recordAuditEvent({
          action: "case_analysis",
          entity: "case_analysis",
          requestId,
          clientAddress,
          details: {
            contextLen: context.length,
            grounded,
            priorityLevel: report.priorityLevel,
            priorityScore: report.priorityScore,
          },
        });

        sendJson(res, 200, report);
        return;
      }

      if (pathname === "/api/cases/priority") {
        const limit = Number.parseInt(
          url.searchParams.get("limit") || "20",
          10,
        );
        const sorted = allCases
          .slice()
          .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
          .slice(0, Number.isFinite(limit) ? limit : 20);
        sendJson(res, 200, sorted);
        return;
      }

      if (pathname === "/api/cases/priority-matrix") {
        const matrix = {
          bands: [
            {
              band: "P0",
              label: "Critical",
              threshold: 85,
              count: allCases.filter((c) => (c.priorityBand || "P3") === "P0")
                .length,
            },
            {
              band: "P1",
              label: "High",
              threshold: 70,
              count: allCases.filter((c) => (c.priorityBand || "P3") === "P1")
                .length,
            },
            {
              band: "P2",
              label: "Medium",
              threshold: 50,
              count: allCases.filter((c) => (c.priorityBand || "P3") === "P2")
                .length,
            },
            {
              band: "P3",
              label: "Low",
              threshold: 0,
              count: allCases.filter((c) => (c.priorityBand || "P3") === "P3")
                .length,
            },
          ],
          topCritical: allCases
            .filter((c) => c.priorityBand === "P0")
            .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
            .slice(0, 5)
            .map((c) => ({
              id: c.id,
              title: c.title,
              priorityScore: c.priorityScore,
              type: c.type,
            })),
          severitySignals: {
            murderHomicide: allCases.filter((c) =>
              /murder|homicide/i.test(c.title + c.summary),
            ).length,
            sexualOffences: allCases.filter((c) =>
              /rape|sexual|pocso/i.test(c.title + c.summary),
            ).length,
            terrorism: allCases.filter((c) =>
              /terror|uapa|sedition/i.test(c.title + c.summary),
            ).length,
            fraud: allCases.filter((c) =>
              /fraud|laundering|corruption/i.test(c.title + c.summary),
            ).length,
          },
        };
        sendJson(res, 200, matrix);
        return;
      }

      if (explainMatch && req.method === "GET") {
        const id = decodeURIComponent(explainMatch[1]);
        const query = (url.searchParams.get("q") || "").trim();
        const match = allCases.find((item) => item.id === id) || null;
        if (!match) {
          sendJson(res, 404, { error: "Case not found" });
          return;
        }

        const localExplanation = buildMatchExplanation(query, match).whyMatched;
        const deepSeekExplanation = await generateDeepSeekGroundedAnswer({
          query,
          localAnswer: localExplanation,
          sources: [
            {
              caseId: match.id,
              title: match.title,
              court: match.court,
              year: match.year,
              type: match.type,
              finalVerdict: match.finalVerdict,
              section: "Case Summary",
              score: 1,
              excerpt: `${match.summary || ""} ${match.judgment || ""}`.slice(
                0,
                400,
              ),
            },
          ],
          retrievedChunks: [
            {
              chunkId: `case-${match.id}`,
              caseId: match.id,
              score: 1,
              section: "Case Summary",
              text: `${match.summary || ""} ${match.judgment || ""}`.slice(
                0,
                500,
              ),
            },
          ],
          mode: "explain",
          caseTitle: match.title,
          localExplanation,
        });

        sendJson(res, 200, {
          explanation: deepSeekExplanation || localExplanation,
        });
        return;
      }

      if (humanizeMatch && req.method === "GET") {
        const id = decodeURIComponent(humanizeMatch[1]);
        const match = allCases.find((item) => item.id === id) || null;
        if (!match) {
          sendJson(res, 404, { error: "Case not found" });
          return;
        }

        const localNarrative = buildHumanizedNarrative(match);
        const deepSeekNarrative = await generateDeepSeekGroundedAnswer({
          query:
            "Create a plain-language, human-friendly case brief in 3-5 sentences.",
          localAnswer: localNarrative,
          sources: [
            {
              caseId: match.id,
              title: match.title,
              court: match.court,
              year: match.year,
              type: match.type,
              finalVerdict: match.finalVerdict,
              section: "Case Summary",
              score: 1,
              excerpt: `${match.summary || ""} ${match.judgment || ""}`.slice(
                0,
                400,
              ),
            },
          ],
          retrievedChunks: [
            {
              chunkId: `case-humanize-${match.id}`,
              caseId: match.id,
              score: 1,
              section: "Case Summary",
              text: `${match.summary || ""} ${match.judgment || ""}`.slice(
                0,
                500,
              ),
            },
          ],
          mode: "explain",
          caseTitle: match.title,
          localExplanation: localNarrative,
        });

        sendJson(res, 200, {
          narrative: deepSeekNarrative || localNarrative,
        });
        return;
      }

      if (caseMatch && req.method === "GET") {
        const id = decodeURIComponent(caseMatch[1]);
        const match = allCases.find((item) => item.id === id) || null;
        if (!match) {
          sendJson(res, 404, { error: "Case not found" });
          return;
        }
        sendJson(res, 200, match);
        return;
      }

      if (pathname === "/api/insights") {
        sendJson(res, 200, buildInsights(allCases));
        return;
      }

      if (pathname === "/api/analyze-pdf" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const fileName =
          `${payload.filename || "uploaded-document.pdf"}`.trim();
        const contentBase64 =
          typeof payload.contentBase64 === "string"
            ? payload.contentBase64
            : "";
        const extractedTextOverride =
          typeof payload.extractedText === "string"
            ? normalizeText(payload.extractedText)
            : "";
        const sections = await buildPdfSections(fileName, allCases, {
          contentBase64,
          extractedTextOverride,
        });
        recordAuditEvent({
          action: "analyze_pdf",
          entity: "pdf",
          requestId,
          clientAddress,
          details: {
            fileName,
            extractionOverride: Boolean(extractedTextOverride),
          },
        });
        sendJson(res, 200, { sections });
        return;
      }

      if (pathname === "/api/history") {
        const persisted = await listHistory();
        sendJson(res, 200, persisted);
        return;
      }

      if (pathname === "/api/history/search" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const event = await createHistoryEvent({
          type: "search",
          title: `${payload.query || "Search"}`,
          results: Number.parseInt(`${payload.results || 0}`, 10) || 0,
          metadata: { query: payload.query || "" },
        });
        recordAuditEvent({
          action: "create_history_search",
          entity: "history",
          requestId,
          clientAddress,
          details: { query: `${payload.query || ""}`.slice(0, 120) },
        });
        sendJson(res, 201, event);
        return;
      }

      if (pathname === "/api/history/upload" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const event = await createHistoryEvent({
          type: "upload",
          title: `${payload.filename || "Uploaded Document"}`,
          results: Number.parseInt(`${payload.matchesFound || 0}`, 10) || 0,
          metadata: { filename: payload.filename || "" },
        });
        recordAuditEvent({
          action: "create_history_upload",
          entity: "history",
          requestId,
          clientAddress,
          details: { fileName: `${payload.filename || ""}`.slice(0, 120) },
        });
        sendJson(res, 201, event);
        return;
      }

      if (pathname === "/api/history/view" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const event = await createHistoryEvent({
          type: "view",
          title: `${payload.caseTitle || "Case View"}`,
          metadata: { caseId: payload.caseId || "" },
        });
        recordAuditEvent({
          action: "create_history_view",
          entity: "history",
          requestId,
          clientAddress,
          details: { caseId: `${payload.caseId || ""}`.slice(0, 120) },
        });
        sendJson(res, 201, event);
        return;
      }

      if (pathname === "/api/judges") {
        if (req.method === "GET") {
          sendJson(res, 200, await listJudges());
          return;
        }

        if (req.method === "POST") {
          const payload = await readJsonBody(req);
          const created = await createJudge(payload);
          recordAuditEvent({
            action: "create_judge",
            entity: "judge",
            requestId,
            clientAddress,
            details: { id: created.id, name: created.name },
          });
          sendJson(res, 201, created);
          return;
        }
      }

      if (judgeMatch) {
        const id = decodeURIComponent(judgeMatch[1]);

        if (req.method === "GET") {
          const judge = await getJudgeById(id);
          if (!judge) {
            sendJson(res, 404, { error: "Judge not found" });
            return;
          }
          sendJson(res, 200, judge);
          return;
        }

        if (req.method === "PUT") {
          const payload = await readJsonBody(req);
          const updated = await updateJudge(id, payload);
          if (!updated) {
            sendJson(res, 404, { error: "Judge not found" });
            return;
          }
          recordAuditEvent({
            action: "update_judge",
            entity: "judge",
            requestId,
            clientAddress,
            details: { id: updated.id, name: updated.name },
          });
          sendJson(res, 200, updated);
          return;
        }

        if (req.method === "DELETE") {
          const removed = await deleteJudge(id);
          if (!removed) {
            sendJson(res, 404, { error: "Judge not found" });
            return;
          }
          recordAuditEvent({
            action: "delete_judge",
            entity: "judge",
            requestId,
            clientAddress,
            details: { id },
          });
          sendJson(res, 204, {});
          return;
        }
      }

      if (pathname === "/api/hearings") {
        if (req.method === "GET") {
          const caseId = url.searchParams.get("caseId") || undefined;
          const judgeId = url.searchParams.get("judgeId") || undefined;
          sendJson(res, 200, await listHearings({ caseId, judgeId }));
          return;
        }

        if (req.method === "POST") {
          const payload = await readJsonBody(req);
          let created;
          try {
            created = await createHearing(payload);
          } catch (createErr) {
            const msg =
              createErr instanceof Error
                ? createErr.message
                : "Unable to schedule hearing.";
            // Distinguish scheduling conflicts (409) from other errors (500)
            const isConflict = msg
              .toLowerCase()
              .includes("scheduling conflict");
            sendJson(res, isConflict ? 409 : 500, { error: msg });
            return;
          }
          recordAuditEvent({
            action: "create_hearing",
            entity: "hearing",
            requestId,
            clientAddress,
            details: { id: created.id, caseId: created.caseId },
          });
          sendJson(res, 201, created);
          return;
        }
      }

      if (hearingMatch) {
        const id = decodeURIComponent(hearingMatch[1]);

        if (req.method === "GET") {
          const hearing = await getHearingById(id);
          if (!hearing) {
            sendJson(res, 404, { error: "Hearing not found" });
            return;
          }
          sendJson(res, 200, hearing);
          return;
        }

        if (req.method === "PUT") {
          const payload = await readJsonBody(req);
          const updated = await updateHearing(id, payload);
          if (!updated) {
            sendJson(res, 404, { error: "Hearing not found" });
            return;
          }
          recordAuditEvent({
            action: "update_hearing",
            entity: "hearing",
            requestId,
            clientAddress,
            details: { id: updated.id, caseId: updated.caseId },
          });
          sendJson(res, 200, updated);
          return;
        }

        if (req.method === "DELETE") {
          const removed = await deleteHearing(id);
          if (!removed) {
            sendJson(res, 404, { error: "Hearing not found" });
            return;
          }
          recordAuditEvent({
            action: "delete_hearing",
            entity: "hearing",
            requestId,
            clientAddress,
            details: { id },
          });
          sendJson(res, 204, {});
          return;
        }
      }

      if (pathname === "/api/fir/assess-priority" && req.method === "GET") {
        const text = `${url.searchParams.get("filename") || ""} ${url.searchParams.get("text") || ""}`;
        const assessment = buildFirAssessment(text);
        sendJson(res, 200, assessment);
        return;
      }

      if (pathname === "/api/fir/assess-priority" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const text = buildFirText(
          payload.filename || "",
          payload.sections || [],
          payload.extractedText || "",
        );
        const assessment = buildFirAssessment(text);
        sendJson(res, 200, assessment);
        return;
      }

      if (pathname === "/api/fir/assign-judge" && req.method === "GET") {
        const text = `${url.searchParams.get("filename") || ""} ${url.searchParams.get("text") || ""}`;
        const assessment = buildFirAssessment(text);
        const judges = await listJudges();
        const assignment = buildFirAssignment(assessment, judges, text);
        sendJson(res, 200, assignment);
        return;
      }

      if (pathname === "/api/fir/assign-judge" && req.method === "POST") {
        const payload = await readJsonBody(req);
        const text = buildFirText(
          payload.filename || "",
          payload.sections || [],
          payload.extractedText || "",
        );
        const assessment = payload.assessment || buildFirAssessment(text);
        const judges = await listJudges();
        const assignment = buildFirAssignment(assessment, judges, text);
        sendJson(res, 200, assignment);
        return;
      }

      // ── DB health check ──────────────────────────────────────────────────
      if (pathname === "/api/db/health" && req.method === "GET") {
        const health = await checkDbHealth();
        sendJson(res, health.ok ? 200 : 503, health);
        return;
      }

      // ── Managed Cases ────────────────────────────────────────────────────
      const managedCaseMatch = pathname.match(
        /^\/api\/managed-cases\/([^/]+)$/,
      );

      if (pathname === "/api/managed-cases" && req.method === "GET") {
        const cases = await listManagedCases();
        sendJson(res, 200, cases);
        return;
      }

      if (pathname === "/api/managed-cases" && req.method === "POST") {
        const payload = await readJsonBody(req);
        if (!payload.title) throw new HttpError(400, "title is required");
        const created = await upsertManagedCase(payload);
        recordAuditEvent({
          action: "create_managed_case",
          entity: "managed_case",
          requestId,
          clientAddress,
          details: { id: created.id },
        });
        sendJson(res, 201, created);
        return;
      }

      if (managedCaseMatch && req.method === "GET") {
        const id = decodeURIComponent(managedCaseMatch[1]);
        const all = await listManagedCases();
        const found = all.find((c) => c.id === id);
        if (!found) {
          sendJson(res, 404, { error: "Managed case not found" });
          return;
        }
        sendJson(res, 200, found);
        return;
      }

      if (managedCaseMatch && req.method === "PUT") {
        const id = decodeURIComponent(managedCaseMatch[1]);
        const payload = await readJsonBody(req);
        const updated = await updateManagedCase(id, payload);
        if (!updated) {
          sendJson(res, 404, { error: "Managed case not found" });
          return;
        }
        recordAuditEvent({
          action: "update_managed_case",
          entity: "managed_case",
          requestId,
          clientAddress,
          details: { id },
        });
        sendJson(res, 200, updated);
        return;
      }

      if (managedCaseMatch && req.method === "DELETE") {
        const id = decodeURIComponent(managedCaseMatch[1]);
        const removed = await deleteManagedCase(id);
        if (!removed) {
          sendJson(res, 404, { error: "Managed case not found" });
          return;
        }
        recordAuditEvent({
          action: "delete_managed_case",
          entity: "managed_case",
          requestId,
          clientAddress,
          details: { id },
        });
        sendJson(res, 204, {});
        return;
      }

      // ── Priority Overrides ───────────────────────────────────────────────
      const priorityOverridesCaseMatch = pathname.match(
        /^\/api\/managed-cases\/([^/]+)\/priority-overrides$/,
      );

      if (priorityOverridesCaseMatch && req.method === "GET") {
        const caseId = decodeURIComponent(priorityOverridesCaseMatch[1]);
        const overrides = await listPriorityOverrides(caseId);
        sendJson(res, 200, overrides);
        return;
      }

      if (priorityOverridesCaseMatch && req.method === "POST") {
        const caseId = decodeURIComponent(priorityOverridesCaseMatch[1]);
        const payload = await readJsonBody(req);
        if (!payload.overrideBand || !payload.reason)
          throw new HttpError(400, "overrideBand and reason are required");
        const override = await createPriorityOverride({ ...payload, caseId });
        // Also update the managed case's band
        await updateManagedCase(caseId, {
          priorityBand: payload.overrideBand,
          priorityScore: payload.overrideScore,
        });
        recordAuditEvent({
          action: "priority_override",
          entity: "managed_case",
          requestId,
          clientAddress,
          details: { caseId, overrideBand: payload.overrideBand },
        });
        sendJson(res, 201, override);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, {
          error: error.message,
        });
        return;
      }

      sendJson(res, 500, {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

function buildCaseExplanation(query, item) {
  const loweredQuery = `${query}`.toLowerCase();
  const matchedTags = item.tags.filter((tag) =>
    loweredQuery.includes(tag.toLowerCase()),
  );
  const tagPhrase =
    matchedTags.length > 0
      ? `matching topic tags (${matchedTags.join(", ")})`
      : "overlapping legal themes";
  return `Matched on ${tagPhrase}, case type (${item.type}), and strong similarity signals from title and summary context.`;
}

function buildFirText(filename, sections, extractedText) {
  const sectionText = Array.isArray(sections)
    ? sections
        .map(
          (section) =>
            `${section.title || ""} ${section.summary || ""} ${section.content || ""} ${(section.highlights || []).join(" ")}`,
        )
        .join(" ")
    : "";
  return `${filename || ""} ${extractedText || ""} ${sectionText}`.trim();
}

// ── Legal Section Knowledge Base ─────────────────────────────────────────────
const LEGAL_SECTION_MAP = [
  // Homicide & bodily harm
  {
    terms: ["murder", "killed", "homicide", "death of accused", "deceased"],
    sections: [
      "IPC Section 302 (Murder)",
      "IPC Section 300 (Definition of Murder)",
      "IPC Section 304 (Culpable Homicide not amounting to Murder)",
      "CrPC Section 173 (Police Report)",
    ],
    domain: "Criminal",
    severity: "Critical",
    publicRisk: true,
  },
  {
    terms: [
      "attempt to murder",
      "attempted murder",
      "shot at",
      "stabbed",
      "fired at",
    ],
    sections: [
      "IPC Section 307 (Attempt to Murder)",
      "IPC Section 309 (Attempt to commit Suicide)",
      "IPC Section 34 (Common Intention)",
      "CrPC Section 439 (High Court Powers Regarding Bail)",
    ],
    domain: "Criminal",
    severity: "Critical",
    publicRisk: true,
  },
  {
    terms: [
      "grievous hurt",
      "grievous injury",
      "fracture",
      "permanent disability",
      "disfigurement",
    ],
    sections: [
      "IPC Section 320 (Grievous Hurt)",
      "IPC Section 325 (Punishment for Grievous Hurt)",
      "IPC Section 326 (Grievous Hurt by Dangerous Weapons)",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: true,
  },
  {
    terms: ["hurt", "injury", "assault", "beat", "beaten"],
    sections: [
      "IPC Section 319 (Hurt)",
      "IPC Section 323 (Punishment for Voluntarily Causing Hurt)",
      "IPC Section 324 (Hurt by Dangerous Weapon)",
      "IPC Section 351 (Assault)",
    ],
    domain: "Criminal",
    severity: "Medium",
    publicRisk: false,
  },
  // Road accidents
  {
    terms: [
      "accident",
      "rash driving",
      "negligent driving",
      "hit",
      "road",
      "vehicle",
      "car",
      "truck",
      "bus",
    ],
    sections: [
      "IPC Section 279 (Rash Driving on Public Way)",
      "IPC Section 304A (Death by Negligence)",
      "IPC Section 338 (Grievous Hurt by Negligent Act)",
      "Motor Vehicles Act Section 166 (Application for Compensation)",
      "Motor Vehicles Act Section 185 (Drunken Driving)",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: true,
  },
  // Sexual offences
  {
    terms: [
      "rape",
      "sexual assault",
      "molestation",
      "outraging modesty",
      "POCSO",
      "minor victim",
    ],
    sections: [
      "IPC Section 375 (Definition of Rape)",
      "IPC Section 376 (Punishment for Rape)",
      "IPC Section 354 (Outraging Modesty of a Woman)",
      "POCSO Act Section 4 (Penetrative Sexual Assault)",
      "POCSO Act Section 7 (Sexual Assault on Child)",
      "CrPC Section 164 (Statement of Victim)",
    ],
    domain: "Criminal",
    severity: "Critical",
    publicRisk: true,
  },
  // Kidnapping & trafficking
  {
    terms: [
      "kidnap",
      "abduct",
      "trafficking",
      "missing person",
      "wrongful confinement",
    ],
    sections: [
      "IPC Section 359 (Kidnapping)",
      "IPC Section 363 (Punishment for Kidnapping)",
      "IPC Section 364A (Ransom Kidnapping)",
      "IPC Section 342 (Wrongful Confinement)",
    ],
    domain: "Criminal",
    severity: "Critical",
    publicRisk: true,
  },
  // Robbery & dacoity
  {
    terms: [
      "robbery",
      "dacoity",
      "armed robbery",
      "theft at gunpoint",
      "looting",
    ],
    sections: [
      "IPC Section 390 (Robbery)",
      "IPC Section 392 (Punishment for Robbery)",
      "IPC Section 395 (Punishment for Dacoity)",
      "IPC Section 397 (Robbery with Attempt to Cause Death)",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: true,
  },
  // Theft & cheating
  {
    terms: ["theft", "stolen", "stole", "pickpocket"],
    sections: [
      "IPC Section 378 (Theft)",
      "IPC Section 379 (Punishment for Theft)",
      "IPC Section 380 (Theft in Dwelling)",
    ],
    domain: "Criminal",
    severity: "Medium",
    publicRisk: false,
  },
  {
    terms: ["cheating", "fraud", "misrepresentation", "deceived", "defraud"],
    sections: [
      "IPC Section 415 (Cheating)",
      "IPC Section 420 (Cheating and Dishonestly Inducing Delivery of Property)",
      "IPC Section 468 (Forgery for purpose of Cheating)",
      "Indian Evidence Act Section 17 (Admission)",
    ],
    domain: "Criminal",
    severity: "Medium",
    publicRisk: false,
  },
  // Corruption & bribery
  {
    terms: ["corruption", "bribery", "bribe", "public servant", "graft"],
    sections: [
      "Prevention of Corruption Act 1988 Section 7 (Offence relating to Bribery)",
      "Prevention of Corruption Act 1988 Section 13 (Criminal Misconduct)",
      "IPC Section 161 (Public Servant Taking Illegal Gratification)",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: true,
  },
  // Domestic violence & dowry
  {
    terms: [
      "domestic violence",
      "dowry",
      "dowry death",
      "cruelty by husband",
      "498a",
    ],
    sections: [
      "IPC Section 498A (Cruelty by Husband or Relatives)",
      "IPC Section 304B (Dowry Death)",
      "Dowry Prohibition Act 1961 Section 3",
      "Protection of Women from Domestic Violence Act 2005 Section 18",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: false,
  },
  // Bail proceedings
  {
    terms: [
      "bail",
      "bail application",
      "anticipatory bail",
      "regular bail",
      "CrPC 437",
      "CrPC 439",
    ],
    sections: [
      "CrPC Section 437 (When Bail may be taken in case of Non-Bailable Offence)",
      "CrPC Section 439 (Special Powers of High Court regarding Bail)",
      "CrPC Section 167 (Procedure when Investigation cannot be completed in 24 hours)",
      "Indian Evidence Act Section 3 (Interpretation – Facts)",
    ],
    domain: "Criminal",
    severity: "Medium",
    publicRisk: false,
  },
  // Self-defence
  {
    terms: [
      "self defense",
      "self defence",
      "private defence",
      "right of private defense",
    ],
    sections: [
      "IPC Section 96 (Right of Private Defence)",
      "IPC Section 97 (Right of Private Defence of Body and Property)",
      "IPC Section 100 (When Right of Private Defence extends to Causing Death)",
      "IPC Section 105 (Commencement and Continuance of Right of Private Defence of Property)",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: false,
  },
  // Property & civil
  {
    terms: [
      "property dispute",
      "title",
      "ownership",
      "encroachment",
      "possession",
      "land",
      "plot",
      "sale deed",
    ],
    sections: [
      "Transfer of Property Act 1882 Section 54 (Sale)",
      "Specific Relief Act 1963 Section 38 (Perpetual Injunction)",
      "Code of Civil Procedure Order 39 (Temporary Injunctions)",
      "Registration Act 1908 Section 17 (Documents to be Registered)",
    ],
    domain: "Civil",
    severity: "Medium",
    publicRisk: false,
  },
  {
    terms: [
      "contract",
      "breach of contract",
      "agreement",
      "non-performance",
      "specific performance",
    ],
    sections: [
      "Indian Contract Act 1872 Section 73 (Compensation for Loss)",
      "Indian Contract Act 1872 Section 74 (Compensation for Breach)",
      "Specific Relief Act 1963 Section 10 (Cases in which specific performance is enforceable)",
      "Limitation Act 1963 Article 55 (Contract Breach – 3 years)",
    ],
    domain: "Civil",
    severity: "Medium",
    publicRisk: false,
  },
  // GST & tax
  {
    terms: ["gst", "tax evasion", "income tax", "customs", "excise"],
    sections: [
      "CGST Act 2017 Section 132 (Punishment for Certain Offences)",
      "Income Tax Act 1961 Section 276C (Wilful Attempt to Evade Tax)",
      "Income Tax Act 1961 Section 279 (Prosecution – Sanction for)",
      "Customs Act 1962 Section 135 (Evasion of Duty)",
    ],
    domain: "Civil",
    severity: "Medium",
    publicRisk: false,
  },
  // Consumer protection
  {
    terms: [
      "consumer",
      "defective product",
      "deficiency in service",
      "unfair trade",
      "complaint consumer",
    ],
    sections: [
      "Consumer Protection Act 2019 Section 2(7) (Definition of Consumer)",
      "Consumer Protection Act 2019 Section 35 (Complaint before District Commission)",
      "Consumer Protection Act 2019 Section 47 (Jurisdiction of State Commission)",
    ],
    domain: "Civil",
    severity: "Low",
    publicRisk: false,
  },
  // NDPS / drugs
  {
    terms: [
      "narcotics",
      "drugs",
      "ganja",
      "cocaine",
      "heroin",
      "ndps",
      "contraband",
    ],
    sections: [
      "NDPS Act 1985 Section 20 (Cannabis)",
      "NDPS Act 1985 Section 21 (Manufactured Drugs)",
      "NDPS Act 1985 Section 37 (Offences to be Cognizable and Non-Bailable)",
      "CrPC Section 437 (Bail in Non-Bailable Cases)",
    ],
    domain: "Criminal",
    severity: "High",
    publicRisk: true,
  },
  // Cybercrime
  {
    terms: [
      "cyber",
      "hacking",
      "phishing",
      "online fraud",
      "data breach",
      "identity theft",
    ],
    sections: [
      "IT Act 2000 Section 43 (Penalty for Damage to Computer)",
      "IT Act 2000 Section 66 (Computer Related Offences)",
      "IT Act 2000 Section 66C (Identity Theft)",
      "IT Act 2000 Section 66D (Cheating by Personation)",
      "IPC Section 420 (Cheating)",
    ],
    domain: "Criminal",
    severity: "Medium",
    publicRisk: false,
  },
];

// ── Concrete Legal Analysis Engine ──────────────────────────────────────────
function buildConcreteAnalysis(context, ragResult, grounded, src) {
  const ctxLower = context.toLowerCase();

  // 1. Match legal domain
  let matched = null;
  let matchScore = 0;
  for (const entry of LEGAL_SECTION_MAP) {
    const hits = entry.terms.filter((t) => ctxLower.includes(t)).length;
    if (hits > matchScore) {
      matchScore = hits;
      matched = entry;
    }
  }
  // Default fallback
  if (!matched) {
    matched = {
      terms: [],
      sections: [
        "IPC Section 34 (Common Intention)",
        "Indian Evidence Act Section 3 (Facts)",
        "CrPC Section 482 (Inherent Powers of High Court)",
      ],
      domain: "Criminal",
      severity: "Medium",
      publicRisk: false,
    };
  }

  // 2. Extract explicit section references from context
  const explicitSections = [];
  const sectionRe =
    /(?:section|sec\.?|s\.)\s*(\d{1,4}[A-Z]?)\s*(?:of\s+)?(?:ipc|crpc|bnss|it act|ndps|pocso|mvact|[a-z\s]{3,30})?/gi;
  let sm;
  while ((sm = sectionRe.exec(context)) !== null) {
    const raw = sm[0].replace(/\s+/g, " ").trim();
    if (!explicitSections.includes(raw)) explicitSections.push(raw);
  }
  const ipcRe = /IPC\s+\d{2,3}[A-Z]?/g;
  const ipcHits = context.match(ipcRe) || [];
  for (const hit of ipcHits)
    if (!explicitSections.includes(hit)) explicitSections.push(hit);

  // 3. Build final laws list (explicit first, then inferred)
  const relevantLaws = [
    ...new Set([...explicitSections, ...matched.sections]),
  ].slice(0, 6);

  // 4. Derive case type and title
  const caseType = matched.domain;
  const caseTitle = src[0]?.title || deriveTitle(context, caseType);

  // 5. Expand scenario realistically
  const expandedScenario = buildExpandedScenario(context, matched, caseType);

  // 6. Key facts (from context + inferred)
  const keyFacts = buildKeyFacts(context, matched, caseType);

  // 7. Legal issues (specific, never generic)
  const legalIssues = buildLegalIssues(
    context,
    matched,
    relevantLaws,
    caseType,
  );

  // 8. Arguments (concrete, section-specific)
  const arguments_ = buildArguments(context, matched, relevantLaws, caseType);

  // 9. Predicted outcome (probabilistic, concrete)
  const { predictedOutcome, reasoning, confidenceScore } = buildOutcome(
    context,
    matched,
    grounded,
    src,
    caseType,
  );

  // 10. Priority (strict rules per spec)
  const { priorityScore, priorityLevel, priorityJustification } =
    computeConcretePriority(matched, context);

  // 11. Similar case references from RAG
  const similarCaseReferences = src.slice(0, 5).map((s) => ({
    title: s.title,
    court: s.court || "Supreme Court of India",
    year: s.year || 2000,
    similarity: Math.round((s.score || 0) * 100),
    excerpt: s.excerpt || "",
  }));

  return {
    caseTitle,
    caseType,
    expandedScenario,
    keyFacts,
    legalIssues,
    relevantLaws,
    similarCaseReferences,
    arguments: arguments_,
    predictedOutcome,
    reasoning,
    priorityLevel,
    priorityScore,
    priorityJustification,
    confidenceScore,
    grounded,
    ...(grounded
      ? {}
      : {
          generativeNote:
            "No direct precedent retrieved. Analysis generated by legal inference engine using established Indian law.",
        }),
  };
}

function deriveTitle(context, caseType) {
  const words = context.trim().split(/\s+/);
  const snippet = words.slice(0, 8).join(" ");
  return `${caseType} Matter: ${snippet}${words.length > 8 ? "..." : ""}`;
}

function buildExpandedScenario(context, matched, caseType) {
  const ctx = context.trim();
  const inferredFacts = [];
  const ctxL = ctx.toLowerCase();

  if (matched.severity === "Critical") {
    inferredFacts.push(
      "Police are inferred to have registered a First Information Report (FIR) under cognizable, non-bailable sections.",
    );
    inferredFacts.push(
      "Medical and forensic evidence is presumed to have been collected at the scene.",
    );
  }
  if (ctxL.includes("bail"))
    inferredFacts.push(
      "Custody proceedings are ongoing; the accused is likely in judicial remand pending bail hearing.",
    );
  if (ctxL.includes("witness") || ctxL.includes("eyewitness"))
    inferredFacts.push(
      "Eyewitness depositions are a central evidentiary pillar in this matter.",
    );
  if (matched.publicRisk)
    inferredFacts.push(
      "The offence involved a threat to public safety, warranting expedited judicial attention.",
    );
  if (caseType === "Civil")
    inferredFacts.push(
      "Civil proceedings are likely filed before the appropriate District or High Court with attendant injunction/stay applications.",
    );

  const expanded =
    `${ctx} ${inferredFacts.length > 0 ? "Based on the facts presented and reasonable legal inference: " + inferredFacts.join(" ") : ""}`.trim();
  return expanded;
}

function buildKeyFacts(context, matched, caseType) {
  const facts = [];
  const ctxL = context.toLowerCase();

  // FIR / complaint reference
  const firMatch = context.match(/FIR\s+(?:No\.?\s*)?\d+[\/\-]\d{2,4}/i);
  if (firMatch) facts.push(`FIR registered: ${firMatch[0]}.`);

  // Date references
  const dateMatch = context.match(/\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4}/);
  if (dateMatch) facts.push(`Incident date recorded as ${dateMatch[0]}.`);

  // Parties
  if (ctxL.includes("accused") || ctxL.includes("defendant"))
    facts.push(
      "Accused/defendant has been identified and is party to these proceedings.",
    );
  if (
    ctxL.includes("victim") ||
    ctxL.includes("complainant") ||
    ctxL.includes("plaintiff")
  )
    facts.push(
      "Victim/complainant has filed a formal complaint initiating legal action.",
    );

  // Evidence signals
  if (ctxL.includes("witness") || ctxL.includes("eyewitness"))
    facts.push(
      "Eyewitness testimony has been recorded and forms part of prosecution evidence.",
    );
  if (
    ctxL.includes("cctv") ||
    ctxL.includes("video") ||
    ctxL.includes("footage")
  )
    facts.push(
      "CCTV/video footage is available and constitutes material evidence.",
    );
  if (
    ctxL.includes("medical") ||
    ctxL.includes("doctor") ||
    ctxL.includes("hospital")
  )
    facts.push(
      "Medico-legal evidence / medical examination report has been obtained.",
    );
  if (
    ctxL.includes("no prior") ||
    ctxL.includes("no criminal record") ||
    ctxL.includes("first offence")
  )
    facts.push(
      "Accused has no prior criminal record — a mitigating factor relevant to bail and sentencing.",
    );

  // Domain-specific inferred facts
  if (matched.severity === "Critical" && facts.length < 3)
    facts.push(
      `This is a ${matched.severity.toLowerCase()}-severity matter under ${matched.sections[0]} and cognate provisions.`,
    );
  if (facts.length < 3)
    facts.push(
      `Case classified as ${caseType} with severity level: ${matched.severity}.`,
    );

  while (facts.length < 3)
    facts.push(
      `Proceedings governed by ${matched.sections[0] || "the applicable statute"}.`,
    );
  return facts.slice(0, 5);
}

function buildLegalIssues(context, matched, relevantLaws, caseType) {
  const issues = [];
  const ctxL = context.toLowerCase();

  if (caseType === "Criminal") {
    const primarySection = matched.sections[0] || "IPC Section 302";
    issues.push(
      `Whether the accused's conduct satisfies all ingredients of ${primarySection} beyond reasonable doubt.`,
    );
    if (ctxL.includes("bail"))
      issues.push(
        `Whether the accused is entitled to bail under CrPC Section 437/439 given the non-bailable nature of ${matched.sections[0] || "the charge"}.`,
      );
    if (ctxL.includes("self def") || ctxL.includes("private def"))
      issues.push(
        "Whether the right of private defence under IPC Section 96–100 was lawfully exercised so as to negate culpability.",
      );
    if (ctxL.includes("intent") || ctxL.includes("intention"))
      issues.push(
        "Whether the requisite mens rea (criminal intention) under IPC Section 8 is established by the prosecution's evidence.",
      );
    if (matched.severity === "Critical")
      issues.push(
        "Whether the eyewitness testimony is credible, consistent and free from material contradictions that would create reasonable doubt.",
      );
  } else {
    issues.push(
      `Whether the plaintiff's legal right or title is established under ${relevantLaws[0] || "the Transfer of Property Act 1882"}.`,
    );
    issues.push(
      "Whether the defendant's acts constitute a wrongful breach entitling the plaintiff to specific performance, damages or injunction.",
    );
    if (ctxL.includes("injunction"))
      issues.push(
        "Whether the three-pronged test for temporary injunction (prima facie case, balance of convenience, irreparable harm) is satisfied under CPC Order 39 Rule 1.",
      );
  }

  while (issues.length < 2)
    issues.push(
      `Whether the evidence on record establishes liability under ${relevantLaws[0] || matched.sections[0]}.`,
    );
  return issues.slice(0, 4);
}

function buildArguments(context, matched, relevantLaws, caseType) {
  const ctxL = context.toLowerCase();
  const primarySection =
    matched.sections[0] ||
    (caseType === "Criminal"
      ? "IPC Section 302"
      : "Transfer of Property Act Section 54");
  const secondarySection = matched.sections[1] || matched.sections[0];

  let plaintiff, defendant;

  if (caseType === "Criminal") {
    // Prosecution
    plaintiff =
      `The prosecution contends that all ingredients of ${primarySection} are fully established on the record. ` +
      `The eyewitness testimony, corroborated by medical/forensic evidence, proves the accused's direct involvement. ` +
      `Under ${secondarySection}, the actus reus and mens rea are both demonstrated beyond reasonable doubt. ` +
      (ctxL.includes("bail")
        ? "The prosecution opposes bail, arguing the accused poses a flight risk and may tamper with evidence (CrPC Section 437(1) proviso). "
        : "") +
      "The prosecution urges framing of charges and expeditious trial in the interest of justice.";

    // Defence
    const defenceSection = ctxL.includes("self def")
      ? "IPC Section 96–100 (Private Defence)"
      : matched.sections[2] ||
        "IPC Section 300 Exception I (Grave and Sudden Provocation)";
    defendant =
      `The defence argues that the prosecution has failed to prove guilt beyond reasonable doubt. ` +
      `The accused relies on ${defenceSection} and submits that the FIR was registered with delay, raising doubts about its authenticity. ` +
      (ctxL.includes("no prior") || ctxL.includes("no criminal")
        ? "The defence highlights the accused's clean criminal antecedents as a mitigating factor (Moti Ram vs State of M.P., AIR 1978 SC 1594). "
        : "") +
      `The defence urges acquittal / grant of bail, citing that the investigation is at a nascent stage and custodial interrogation is unnecessary.`;
  } else {
    plaintiff =
      `The plaintiff asserts a legally valid right/title under ${primarySection}, supported by registered documents and continuous possession. ` +
      `The defendant's actions constitute an unlawful encroachment/breach entitling the plaintiff to a decree of specific performance or permanent injunction under ${secondarySection}. ` +
      "The plaintiff satisfies the balance-of-convenience test as irreversible harm will occur without court intervention.";

    defendant =
      `The defendant disputes the plaintiff's title and pleads prior possession and adverse possession under the Limitation Act 1963 Article 65. ` +
      `The defendant contends that ${secondarySection} is not attracted as no completed transfer occurred. ` +
      "The defendant argues the suit is barred by limitation under the Limitation Act 1963 and seeks dismissal with costs.";
  }

  return { plaintiff, defendant };
}

function buildOutcome(context, matched, grounded, src, caseType) {
  const ctxL = context.toLowerCase();
  const primarySection = matched.sections[0] || "the applicable provision";

  let predictedOutcome = "";
  let reasoning = "";
  let confidenceScore = 0.55;

  if (matched.severity === "Critical" && caseType === "Criminal") {
    if (ctxL.includes("bail")) {
      predictedOutcome = `Bail likely to be DENIED. Given the gravity of ${primarySection} charges (non-bailable), courts will apply the triple test under CrPC Section 437: likelihood of fleeing, tampering with evidence, and repeat offence. With eyewitness evidence and serious charges, bail will likely be rejected at the Sessions Court level and may succeed only before the High Court under CrPC Section 439 with stringent conditions.`;
      confidenceScore = 0.78;
      reasoning = `Courts consistently deny bail in ${matched.severity.toLowerCase()}-severity non-bailable offences without exceptional grounds. The prima facie case appears strong based on disclosed facts.`;
    } else {
      predictedOutcome = `Charges under ${primarySection} are likely to be FRAMED and trial will proceed. Given the severity of the offence and eyewitness corroboration, conviction probability is HIGH (65–75%) if prosecution evidence remains consistent at trial. Minimum sentence on conviction: 10 years rigorous imprisonment to life under ${primarySection}.`;
      confidenceScore = 0.7;
      reasoning = `Under Indian criminal jurisprudence, ${primarySection} carries a high evidentiary burden but once witnesses hold up in cross-examination, conviction rates are significant. Similar cases: ${grounded && src[0] ? src[0].title + " (" + (src[0].year || "N.A.") + ")" : "State of Maharashtra v. Mayur (2007), Supreme Court"}.`;
    }
  } else if (matched.severity === "High" && caseType === "Criminal") {
    predictedOutcome = `Prosecution is likely to succeed in establishing charges under ${primarySection}. Bail may be granted with conditions (surety, passport surrender) given the non-life-threatening nature. Conviction probability: 55–65% subject to quality of cross-examination and forensic evidence.`;
    confidenceScore = 0.62;
    reasoning = `High-severity criminal matters proceed to trial with a moderate-to-high conviction rate. Defence arguments on lack of intent may reduce sentencing even if conviction occurs.`;
  } else if (caseType === "Criminal") {
    predictedOutcome = `A compoundable settlement or conviction with probation/fine is the probable outcome under ${primarySection}. Given the medium severity, courts are likely to consider plea bargaining under CrPC Section 265A. Custodial sentence is unlikely for a first offender.`;
    confidenceScore = 0.58;
    reasoning = `Medium-severity criminal cases with first-time offenders often resolve through compounding or reduced sentences. Section 360 CrPC and Probation of Offenders Act 1958 are applicable.`;
  } else {
    predictedOutcome = `The plaintiff has a reasonable probability (60%) of obtaining relief — either specific performance, injunction, or damages — depending on documentary evidence of title/breach. Courts will apply ${matched.sections[0] || "applicable civil provisions"} strictly. Interim injunction is likely to be granted if documents are prima facie valid.`;
    confidenceScore = 0.6;
    reasoning = `Civil matters hinge on documentary evidence and the strength of title records. If registered sale deeds or contracts are produced, the plaintiff's case is strong.`;
  }

  if (grounded && src[0]) {
    reasoning += ` Grounded in retrieved precedent: ${src[0].title} (${src[0].year || "N.A."}).`;
    if (src[1])
      reasoning += ` Further supported by ${src[1].title} (${src[1].year || "N.A."}).`;
    confidenceScore = Math.min(0.92, confidenceScore + 0.12);
  }

  return {
    predictedOutcome,
    reasoning,
    confidenceScore: Number(confidenceScore.toFixed(2)),
  };
}

function computeConcretePriority(matched, context) {
  const ctxL = context.toLowerCase();
  let priorityScore = 25;
  let priorityLevel = "LOW";
  let justificationParts = [];

  // Strict rules per specification
  if (matched.severity === "Critical" || matched.publicRisk) {
    priorityScore = matched.severity === "Critical" ? 92 : 82;
    priorityLevel = "HIGH";
    justificationParts.push(
      `Severity: ${matched.severity} — involves ${matched.publicRisk ? "public safety risk" : "grievous offence"}.`,
    );
    justificationParts.push(
      `Primary section ${matched.sections[0]} carries maximum punishment (life/death).`,
    );
  } else if (matched.severity === "High") {
    priorityScore = 72;
    priorityLevel = "HIGH";
    justificationParts.push(
      `High-severity offence under ${matched.sections[0]}; significant injury or financial harm established.`,
    );
  } else if (matched.domain === "Civil" || matched.severity === "Medium") {
    priorityScore = matched.domain === "Civil" ? 48 : 55;
    priorityLevel = "MEDIUM";
    justificationParts.push(
      `Financial/property matter or medium-severity offence — MEDIUM priority per triage rules.`,
    );
  } else {
    priorityScore = 22;
    priorityLevel = "LOW";
    justificationParts.push(
      "Minor or no physical harm; LOW priority — can be scheduled without urgent triage.",
    );
  }

  // Modifiers
  if (ctxL.includes("bail") && priorityLevel !== "LOW") {
    priorityScore = Math.min(100, priorityScore + 5);
    justificationParts.push(
      "Bail proceedings pending — scheduling urgency elevated.",
    );
  }
  if (ctxL.includes("child") || ctxL.includes("minor")) {
    priorityScore = Math.min(100, priorityScore + 8);
    justificationParts.push(
      "Victim is a minor — POCSO / elevated priority applies.",
    );
  }
  if (ctxL.includes("woman") || ctxL.includes("female")) {
    priorityScore = Math.min(100, priorityScore + 4);
    justificationParts.push(
      "Offence against woman — fast-track consideration warranted.",
    );
  }

  return {
    priorityScore: Math.round(priorityScore),
    priorityLevel,
    priorityJustification: justificationParts.join(" "),
  };
}

function buildFirAssessment(text) {
  const caseType = classifyFirCaseType(text);
  const severity = detectFirSeverity(text);
  const risk = assessFirRisk(text, caseType, severity);
  const priorityScore = computeFirPriority(caseType, severity, risk);
  return {
    caseType,
    severity,
    bailRiskScore: risk.bailRiskScore,
    escapeRiskScore: risk.escapeRiskScore,
    riskScore: risk.riskScore,
    riskFactors: risk.riskFactors,
    priorityScore,
    priorityBand: toPriorityBand(priorityScore),
    rationale: buildFirRationale({ caseType, severity, risk }),
  };
}

function buildFirAssignment(assessment, judges, seedText) {
  const category = toJudgeCategory(assessment.caseType);
  const roster =
    judges && judges.length > 0 ? judges : buildFallbackJudges(category);
  const rankings = rankJudgesForAssessment(assessment, roster, seedText);
  const selected = rankings[0] || null;

  return {
    category,
    assignedJudgeId: selected?.judgeId,
    assignedJudge: selected?.judgeName || DEFAULT_FIR_ROSTER[category][0],
    availableJudges: rankings.map((item) => item.judgeName),
    judgeRankings: rankings,
    assignmentReason: selected?.reason || "Assigned using fallback roster.",
    routeMode: "auto",
    partyLabel: category === "Criminal" ? "Accused" : "Defendant",
    requiresPublicProsecutor: category === "Criminal",
  };
}

function classifyFirCaseType(text) {
  const normalized = `${text || ""}`.toLowerCase();
  if (
    normalized.includes("fir") ||
    normalized.includes("ipc") ||
    normalized.includes("criminal") ||
    normalized.includes("murder") ||
    normalized.includes("assault")
  ) {
    return "Criminal";
  }
  if (
    normalized.includes("civil") ||
    normalized.includes("property") ||
    normalized.includes("contract") ||
    normalized.includes("injunction")
  ) {
    return "Civil";
  }
  return "Specialized Cases";
}

function detectFirSeverity(text) {
  const normalized = `${text || ""}`.toLowerCase();
  if (
    includesAny(normalized, [
      "murder",
      "rape",
      "terror",
      "kidnap",
      "attempt to murder",
      "acid attack",
    ])
  )
    return "Critical";
  if (
    includesAny(normalized, [
      "grievous",
      "armed",
      "extortion",
      "rioting",
      "fraud",
      "serious injury",
    ])
  )
    return "High";
  if (
    includesAny(normalized, [
      "threat",
      "cheating",
      "breach",
      "damage",
      "dispute",
    ])
  )
    return "Medium";
  return "Low";
}

function assessFirRisk(text, caseType, severity) {
  const normalized = `${text || ""}`.toLowerCase();
  let bailRiskScore =
    18 +
    (caseType === "Criminal" ? 10 : 0) +
    (severity === "Critical"
      ? 18
      : severity === "High"
        ? 12
        : severity === "Medium"
          ? 6
          : 0);
  let escapeRiskScore =
    12 +
    (caseType === "Criminal" ? 8 : 0) +
    (severity === "Critical"
      ? 18
      : severity === "High"
        ? 12
        : severity === "Medium"
          ? 4
          : 0);
  const riskFactors = [];

  const bailTerms = [
    ["non-bailable", 18],
    ["bail rejected", 22],
    ["bail denied", 22],
    ["custody", 10],
    ["remand", 8],
    ["surety", 6],
    ["anticipatory bail", 12],
    ["interim bail", 14],
    ["bail", 8],
  ];
  const escapeTerms = [
    ["abscond", 22],
    ["fugitive", 24],
    ["flight risk", 28],
    ["foreign travel", 20],
    ["passport", 12],
    ["look out circular", 18],
    ["escape", 18],
    ["flee", 20],
    ["no fixed address", 14],
    ["international", 10],
  ];

  for (const [term, boost] of bailTerms) {
    if (normalized.includes(term)) {
      bailRiskScore += boost;
      riskFactors.push(`bail signal: ${term}`);
    }
  }

  for (const [term, boost] of escapeTerms) {
    if (normalized.includes(term)) {
      escapeRiskScore += boost;
      riskFactors.push(`escape signal: ${term}`);
    }
  }

  if (severity === "Critical") riskFactors.push("critical offense severity");
  if (severity === "High") riskFactors.push("high offense severity");

  bailRiskScore = Math.max(10, Math.min(99, Math.round(bailRiskScore)));
  escapeRiskScore = Math.max(10, Math.min(99, Math.round(escapeRiskScore)));

  return {
    bailRiskScore,
    escapeRiskScore,
    riskScore: Math.max(
      10,
      Math.min(99, Math.round(bailRiskScore * 0.55 + escapeRiskScore * 0.45)),
    ),
    riskFactors,
  };
}

function computeFirPriority(caseType, severity, risk) {
  const typeWeight = { Criminal: 42, Civil: 26, "Specialized Cases": 34 };
  const severityWeight = { Low: 12, Medium: 24, High: 36, Critical: 48 };
  const weighted =
    0.34 * typeWeight[caseType] +
    0.3 * severityWeight[severity] +
    0.18 * risk.bailRiskScore +
    0.18 * risk.escapeRiskScore;
  return Math.max(20, Math.min(99, Math.round(weighted)));
}

function buildFirRationale({ caseType, severity, risk }) {
  const factors =
    risk.riskFactors.length > 0
      ? `Risk factors: ${risk.riskFactors.slice(0, 3).join(", ")}.`
      : "No explicit bail or flight-risk markers detected.";
  return `Priority derived from ${caseType.toLowerCase()} classification, ${severity.toLowerCase()} severity, bail risk ${risk.bailRiskScore}, and escape risk ${risk.escapeRiskScore}. ${factors}`;
}

function toJudgeCategory(caseType) {
  return caseType === "Criminal"
    ? "Criminal"
    : caseType === "Civil"
      ? "Civil"
      : "Other";
}

function buildFallbackJudges(category) {
  return DEFAULT_FIR_ROSTER[category].map((name, index) => ({
    id: `${category.toLowerCase()}-fallback-${index + 1}`,
    name,
    category,
    courtLevel:
      category === "Criminal"
        ? "High Court"
        : category === "Civil"
          ? "High Court"
          : "District Court",
    yearsOfExperience: 10 + index * 4,
    caseLoadCapacity: 45 + index * 5,
    currentCaseLoad: 18 + index * 8,
    availability:
      index === 0 ? "Available" : index === 1 ? "Busy" : "Available",
  }));
}

function rankJudgesForAssessment(assessment, judges, seedText) {
  const category = toJudgeCategory(assessment.caseType);
  return judges
    .map((judge) => {
      const utilization = judge.caseLoadCapacity
        ? judge.currentCaseLoad / judge.caseLoadCapacity
        : 1;
      const capacityHeadroom = Math.max(0, 1 - utilization);
      const availabilityScore =
        judge.availability === "Available"
          ? 1
          : judge.availability === "Busy"
            ? 0.6
            : 0.15;
      const categoryMatch =
        judge.category === category
          ? 1
          : category === "Other" && judge.category === "Criminal"
            ? 0.72
            : 0.38;
      const experienceScore = Math.min(1, judge.yearsOfExperience / 25);
      const courtScore = assessCourtFit(
        judge.courtLevel,
        assessment.severity,
        assessment.riskScore,
      );
      const seedAffinity = hashText(`${seedText}:${judge.name}`) % 11;
      const score = Math.round(
        100 *
          (categoryMatch * 0.3 +
            availabilityScore * 0.22 +
            capacityHeadroom * 0.18 +
            experienceScore * 0.1 +
            courtScore * 0.17 +
            Math.max(0.55, Math.min(1, assessment.riskScore / 100)) * 0.03) +
          seedAffinity,
      );
      return {
        judgeId: judge.id,
        judgeName: judge.name,
        score,
        utilization: Math.round(utilization * 100),
        availability: judge.availability,
        reason: buildJudgeReason({
          categoryMatch,
          availability: judge.availability,
          utilization,
          severity: assessment.severity,
          riskScore: assessment.riskScore,
        }),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.utilization - b.utilization ||
        a.judgeName.localeCompare(b.judgeName),
    );
}

function assessCourtFit(courtLevel, severity, riskScore) {
  if (severity === "Critical" || riskScore >= 80) {
    if (courtLevel === "Supreme Court") return 1;
    if (courtLevel === "High Court") return 0.92;
    return 0.68;
  }

  if (severity === "High" || riskScore >= 60) {
    if (courtLevel === "High Court") return 1;
    if (courtLevel === "Supreme Court") return 0.92;
    return 0.76;
  }

  if (courtLevel === "District Court") return 1;
  return 0.84;
}

function buildJudgeReason(input) {
  const availabilityText =
    input.availability === "Available"
      ? "available"
      : `${input.availability}`.toLowerCase();
  const loadText =
    input.utilization >= 85
      ? "high current load"
      : input.utilization >= 60
        ? "moderate current load"
        : "low current load";
  const fitText =
    input.categoryMatch >= 0.9
      ? "strong category fit"
      : "acceptable fallback fit";
  const riskText =
    input.riskScore >= 80
      ? "critical risk profile"
      : input.riskScore >= 60
        ? "elevated risk profile"
        : `${input.severity.toLowerCase()} severity`;
  return `Selected for ${fitText}, ${availabilityText} status, ${loadText}, and ${riskText}.`;
}

function includesAny(source, terms) {
  return terms.some((term) => source.includes(term));
}

async function buildPdfSections(fileName, cases, options = {}) {
  const extraction = await extractPdfText({
    contentBase64: options.contentBase64 || "",
    extractedTextOverride: options.extractedTextOverride || "",
  });
  if (!extraction.text) {
    return buildMetadataOnlyPdfSections(fileName, cases);
  }

  const legalSignal = assessLegalCaseSignal(`${fileName} ${extraction.text}`);
  const suspectedType = inferPdfCaseType(fileName, extraction.text);
  const ranked = legalSignal.isCaseLike
    ? rankCaseMatches(cases, extraction.text, suspectedType)
    : [];
  const factSnippet = safeExcerpt(extraction.text, 680);
  const issueHighlights = legalSignal.isCaseLike
    ? extractIssueHighlights(extraction.text)
    : ["No legal/case indicators detected in uploaded content"];
  const reliefHighlights = legalSignal.isCaseLike
    ? extractReliefHighlights(extraction.text)
    : ["No legal relief pattern detected"];
  const extractionBadge =
    extraction.mode === "ocr"
      ? "OCR fallback used"
      : extraction.mode === "override"
        ? "Text provided by upstream extractor"
        : "PDF text extracted";
  const extractionSummary =
    extraction.mode === "ocr"
      ? "Facts section generated using OCR fallback from rendered PDF pages."
      : extraction.mode === "override"
        ? "Facts section generated from upstream extracted text payload."
        : "Facts section generated from PDF text extraction (not just filename metadata).";
  const classificationSummary = legalSignal.isCaseLike
    ? extractionSummary
    : `${extractionSummary} Content does not appear to be a legal case document, so no case matches were returned.`;

  let factsContent = `Extracted narrative from ${fileName}: ${factSnippet}`;
  let factsSummary = classificationSummary;
  let issuesContent = `Likely legal issues derived from document language: ${issueHighlights.join(", ")}.`;
  let issuesSummary = "Identified issue candidates from extracted text and legal keyword patterns.";
  let reliefContent = `Potential relief indicators found: ${reliefHighlights.join(", ")}. Validate prayer clause details against complete pleadings and annexures.`;
  let reliefSummary = "Inferred relief direction from explicit remedy-oriented terms in the PDF.";

  if (legalSignal.isCaseLike && extraction.text.length > 50) {
    const chunk = {
      section: "Extracted Text",
      score: 1,
      text: extraction.text.slice(0, 8000),
      caseId: fileName
    };
    
    try {
      const [aiFacts, aiIssues, aiRelief] = await Promise.all([
        generateDeepSeekGroundedAnswer({
          query: "Provide a complete, detailed factual narrative based solely on this document. Do not summarize too briefly; capture the essential background, parties involved, and events leading to the dispute.",
          localAnswer: factsContent,
          sources: [],
          retrievedChunks: [chunk],
          mode: "rag",
          caseTitle: fileName,
        }),
        generateDeepSeekGroundedAnswer({
          query: "List the core legal issues, allegations, or questions of law raised in this document.",
          localAnswer: issuesContent,
          sources: [],
          retrievedChunks: [chunk],
          mode: "rag",
          caseTitle: fileName,
        }),
        generateDeepSeekGroundedAnswer({
          query: "What specific relief, remedy, prayer, or orders are being sought by the parties in this document?",
          localAnswer: reliefContent,
          sources: [],
          retrievedChunks: [chunk],
          mode: "rag",
          caseTitle: fileName,
        })
      ]);
      
      if (aiFacts) {
        factsContent = aiFacts;
        factsSummary = "AI successfully extracted and synthesized a comprehensive factual narrative from the uploaded document.";
      }
      if (aiIssues) {
        issuesContent = aiIssues;
        issuesSummary = "AI extracted the primary legal issues and core allegations directly from the document text.";
      }
      if (aiRelief) {
        reliefContent = aiRelief;
        reliefSummary = "AI identified the specific relief and remedies prayed for in the document.";
      }
    } catch (e) {
      console.warn("Failed to enhance PDF sections with AI:", e);
    }
  }

  return [
    {
      id: "sec-facts",
      title: "Facts",
      icon: "FileText",
      content: factsContent,
      summary: factsSummary,
      highlights: [fileName, suspectedType, extractionBadge],
      tags: [suspectedType, "Facts", "Parsed PDF"],
      matches: ranked,
    },
    {
      id: "sec-issues",
      title: "Issues",
      icon: "AlertTriangle",
      content: issuesContent,
      summary: issuesSummary,
      highlights: issueHighlights,
      tags: ["Issues", suspectedType],
      matches: ranked,
    },
    {
      id: "sec-relief",
      title: "Relief Sought",
      icon: "Scale",
      content: reliefContent,
      summary: reliefSummary,
      highlights: reliefHighlights,
      tags: ["Relief", suspectedType],
      matches: ranked,
    },
  ];
}

function buildMetadataOnlyPdfSections(fileName, cases) {
  const lowerName = fileName.toLowerCase();
  const legalSignal = assessLegalCaseSignal(fileName);
  const suspectedType =
    lowerName.includes("fir") ||
    lowerName.includes("ipc") ||
    lowerName.includes("crime")
      ? "Criminal"
      : lowerName.includes("tax")
        ? "Tax"
        : lowerName.includes("property") || lowerName.includes("contract")
          ? "Civil"
          : "General";

  const ranked = legalSignal.isCaseLike
    ? cases
        .filter((item) =>
          suspectedType === "General"
            ? true
            : item.type.toLowerCase().includes(suspectedType.toLowerCase()),
        )
        .slice(0, 3)
        .map((item) => ({
          title: item.title,
          similarity: item.similarity,
          reason: `Matched by legal theme (${item.type}) and citation relevance in known precedents.`,
        }))
    : [];

  const titleBits = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[\W_]+/g, " ")
    .trim();

  return [
    {
      id: "sec-facts",
      title: "Facts",
      icon: "FileText",
      content: `Document ${fileName} was processed and classified as ${suspectedType}. Text extraction was unavailable, so metadata-based fallback analysis was used.`,
      summary: legalSignal.isCaseLike
        ? "Fallback factual summary generated from filename and known case corpus."
        : "Fallback factual summary generated from filename. No legal/case indicators were detected, so no case matches were returned.",
      highlights: [fileName, suspectedType, "fallback mode"],
      tags: [suspectedType, "Facts", "Uploaded PDF"],
      matches: ranked,
    },
    {
      id: "sec-issues",
      title: "Issues",
      icon: "AlertTriangle",
      content: `Potential legal issues detected for ${titleBits || "the uploaded matter"}: maintainability, applicable statutory provisions, and burden of proof considerations based on inferred case category.`,
      summary:
        "Fallback issue candidates generated from metadata classification.",
      highlights: [
        "maintainability",
        "statutory provisions",
        "burden of proof",
      ],
      tags: ["Issues", suspectedType],
      matches: ranked,
    },
    {
      id: "sec-relief",
      title: "Relief Sought",
      icon: "Scale",
      content: `The document likely seeks interim and final relief aligned with ${suspectedType.toLowerCase()} litigation patterns. Final relief should be validated against the complete pleadings and annexures.`,
      summary: "Fallback relief summary generated from inferred case type.",
      highlights: ["interim relief", "final relief"],
      tags: ["Relief", suspectedType],
      matches: ranked,
    },
  ];
}

async function extractPdfText({ contentBase64, extractedTextOverride }) {
  if (extractedTextOverride) {
    return { text: extractedTextOverride, mode: "override" };
  }
  if (!contentBase64) return { text: "", mode: "fallback" };

  const pdfBuffer = Buffer.from(contentBase64, "base64");
  if (pdfBuffer.length === 0) return { text: "", mode: "fallback" };

  const primaryText = await extractPdfTextFromDocument(pdfBuffer);
  if (primaryText) {
    return { text: primaryText, mode: "text" };
  }

  if (
    pdfBuffer.length >
    readEnvInt("LEXMATCH_PDF_OCR_MAX_BYTES", DEFAULT_PDF_OCR_MAX_BYTES)
  ) {
    return { text: "", mode: "fallback" };
  }

  const ocrText = await extractPdfTextViaOcr(pdfBuffer);
  if (ocrText) {
    return { text: ocrText, mode: "ocr" };
  }

  return { text: "", mode: "fallback" };
}

async function extractPdfTextFromDocument(pdfBuffer) {
  try {
    const parsed = await pdfParse(pdfBuffer);
    return normalizeText(parsed?.text || "");
  } catch {
    return "";
  }
}

async function extractPdfTextViaOcr(pdfBuffer) {
  if (process.env.LEXMATCH_ENABLE_PDF_OCR === "0") return "";
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(
      () => null,
    );
    if (!pdfjsLib) return "";
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
    }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return normalizeText(content.items.map((i) => i.str).join(" "));
  } catch {
    return "";
  }
}

function withTimeout(promise, timeoutMs) {
  const limit = Math.max(1, timeoutMs);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, limit);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function readEnvInt(key, fallback) {
  const value = Number.parseInt(`${process.env[key] || ""}`, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readEnvBool(key, fallback) {
  const value = `${process.env[key] || ""}`.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "1" || value === "true" || value === "yes" || value === "on")
    return true;
  if (value === "0" || value === "false" || value === "no" || value === "off")
    return false;
  return fallback;
}

function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function logRequest(req, res, context) {
  const durationMs = Number(process.hrtime.bigint() - context.startedAt) / 1e6;
  recordRequestMetrics(req, res, context, durationMs);

  if (!readEnvBool("LEXMATCH_ENABLE_REQUEST_LOGS", DEFAULT_ENABLE_REQUEST_LOGS))
    return;

  const entry = {
    ts: new Date().toISOString(),
    requestId: context.requestId,
    method: req.method || "GET",
    path: context.path,
    status: res.statusCode,
    durationMs: Number(durationMs.toFixed(2)),
    client: context.clientAddress,
  };

  console.log(JSON.stringify(entry));
}

function recordRequestMetrics(req, res, context, durationMs) {
  requestMetrics.total += 1;
  const method = req.method || "GET";
  const statusClass = `${Math.floor((res.statusCode || 0) / 100)}xx`;
  const keyPath = normalizeMetricPath(context.path || "/");

  requestMetrics.byMethod.set(
    method,
    (requestMetrics.byMethod.get(method) || 0) + 1,
  );
  requestMetrics.byStatusClass.set(
    statusClass,
    (requestMetrics.byStatusClass.get(statusClass) || 0) + 1,
  );

  const currentPath = requestMetrics.byPath.get(keyPath) || {
    count: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
  };
  currentPath.count += 1;
  currentPath.totalLatencyMs += durationMs;
  currentPath.maxLatencyMs = Math.max(currentPath.maxLatencyMs, durationMs);
  requestMetrics.byPath.set(keyPath, currentPath);

  requestMetrics.latencyMsTotal += durationMs;
  requestMetrics.latencyMsMax = Math.max(
    requestMetrics.latencyMsMax,
    durationMs,
  );
}

function normalizeMetricPath(pathname) {
  return `${pathname || "/"}`
    .replace(/\/[0-9]+(?=\/|$)/g, "/:id")
    .replace(/\/[A-Za-z0-9_-]{10,}(?=\/|$)/g, "/:id");
}

function buildMetricsSnapshot() {
  const avgLatencyMs =
    requestMetrics.total > 0
      ? requestMetrics.latencyMsTotal / requestMetrics.total
      : 0;
  const topPaths = Array.from(requestMetrics.byPath.entries())
    .map(([path, stats]) => ({
      path,
      count: stats.count,
      avgLatencyMs: Number(
        (stats.totalLatencyMs / Math.max(1, stats.count)).toFixed(2),
      ),
      maxLatencyMs: Number(stats.maxLatencyMs.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    service: "lexmatch-api",
    uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
    requests: {
      total: requestMetrics.total,
      byMethod: Object.fromEntries(requestMetrics.byMethod),
      byStatusClass: Object.fromEntries(requestMetrics.byStatusClass),
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      maxLatencyMs: Number(requestMetrics.latencyMsMax.toFixed(2)),
      topPaths,
    },
    auditEventsBuffered: auditTrail.length,
  };
}

function recordAuditEvent(event) {
  const maxEvents = readEnvInt(
    "LEXMATCH_AUDIT_MAX_EVENTS",
    DEFAULT_AUDIT_MAX_EVENTS,
  );
  auditTrail.push({
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    ...event,
  });
  if (auditTrail.length > maxEvents) {
    auditTrail.splice(0, auditTrail.length - maxEvents);
  }
}

function buildCaseSearchIndex(cases) {
  return cases.map((item) => {
    const source = `${item.title} ${item.summary} ${item.judgment || ""} ${item.finalVerdict || ""} ${item.whyMatch} ${item.tags.join(" ")} ${item.citation || ""}`;
    const vector = buildHashedEmbedding(source, LOCAL_EMBEDDING_DIMS);
    return {
      id: item.id,
      vector,
      norm: vectorNorm(vector),
    };
  });
}

function buildHashedEmbedding(text, dims) {
  const vector = new Float32Array(dims);
  const tokens = (
    `${text || ""}`.toLowerCase().match(/[a-z0-9]{3,}/g) || []
  ).slice(0, 900);
  for (const token of tokens) {
    const h1 = hashToken(token, 2166136261);
    const h2 = hashToken(token, 16777619);
    vector[h1 % dims] += 1;
    vector[h2 % dims] += 0.5;
  }
  return vector;
}

function hashToken(token, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function vectorNorm(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) {
    sum += vector[i] * vector[i];
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a, b, bNorm, aNormOverride) {
  const aNorm =
    typeof aNormOverride === "number" ? aNormOverride : vectorNorm(a);
  if (aNorm === 0 || bNorm === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }
  return dot / (aNorm * bNorm);
}

function getClientAddress(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function consumeRateLimit(bucket, key, maxRequests, windowMs) {
  const now = Date.now();
  const bucketKey = `${bucket}:${key}`;
  const current = rateLimitBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    pruneExpiredRateLimitEntries(now);
    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterMs: Math.max(1, current.resetAt - now),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    retryAfterMs: 0,
  };
}

function pruneExpiredRateLimitEntries(now) {
  if (rateLimitBuckets.size < 2048) return;
  for (const [key, value] of rateLimitBuckets.entries()) {
    if (value.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function normalizeText(text) {
  return `${text || ""}`.split("\u0000").join(" ").replace(/\s+/g, " ").trim();
}

function inferPdfCaseType(fileName, text) {
  const source = `${fileName} ${text}`.toLowerCase();
  if (
    /fir|ipc|crpc|bail|charge sheet|prosecution|accused|convict|arrest|criminal/.test(
      source,
    )
  )
    return "Criminal";
  if (/income tax|gst|vat|assessment|revenue|customs|excise|tax/.test(source))
    return "Tax";
  if (
    /property|contract|agreement|injunction|specific performance|tenancy|civil suit|civil/.test(
      source,
    )
  )
    return "Civil";
  if (
    /article\s+\d+|constitution|writ|habeas|fundamental rights|mandamus/.test(
      source,
    )
  )
    return "Constitutional";
  return "General";
}

function assessLegalCaseSignal(text) {
  const source = `${text || ""}`.toLowerCase();
  if (!source.trim()) return { isCaseLike: false, score: 0 };

  let score = 0;

  if (
    /\b(vs\.?|versus|petitioner|respondent|appellant|accused|plaintiff|defendant)\b/.test(
      source,
    )
  )
    score += 2;
  if (
    /\b(article\s+\d+|section\s+\d+|ipc|crpc|fir|writ|appeal|petition|bail)\b/.test(
      source,
    )
  )
    score += 2;
  if (
    /\b(supreme court|high court|tribunal|judgment|order|bench|jurisdiction)\b/.test(
      source,
    )
  )
    score += 2;
  if (/\b(air\s*\d{4}|\d{4}\s*scc|scr|crilj)\b/.test(source)) score += 2;
  if (
    /\b(relief|injunction|compensation|damages|quash|set aside|maintainability|statutory)\b/.test(
      source,
    )
  )
    score += 1;

  return {
    isCaseLike: score >= 2,
    score,
  };
}

function safeExcerpt(text, maxLength) {
  if (!text)
    return "No extractable textual content found in the uploaded file.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function extractIssueHighlights(text) {
  const source = text.toLowerCase();
  const pool = [
    { key: "jurisdiction", label: "jurisdiction" },
    { key: "maintainability", label: "maintainability" },
    { key: "limitation", label: "limitation" },
    { key: "evidence", label: "evidence" },
    { key: "burden of proof", label: "burden of proof" },
    { key: "natural justice", label: "natural justice" },
    { key: "article", label: "constitutional provisions" },
    { key: "statutory", label: "statutory interpretation" },
  ];

  const found = pool
    .filter((item) => source.includes(item.key))
    .map((item) => item.label);
  return found.length > 0
    ? found.slice(0, 5)
    : ["maintainability", "statutory interpretation", "burden of proof"];
}

function extractReliefHighlights(text) {
  const source = text.toLowerCase();
  const pool = [
    { key: "interim", label: "interim relief" },
    { key: "stay", label: "stay order" },
    { key: "injunction", label: "injunction" },
    { key: "bail", label: "bail" },
    { key: "quash", label: "quashing" },
    { key: "compensation", label: "compensation" },
    { key: "damages", label: "damages" },
    { key: "set aside", label: "setting aside order" },
  ];

  const found = pool
    .filter((item) => source.includes(item.key))
    .map((item) => item.label);
  return found.length > 0
    ? found.slice(0, 5)
    : ["interim relief", "final relief", "consequential directions"];
}

function rankCaseMatches(cases, text, suspectedType) {
  const keywords = extractTopKeywords(text);
  const citationSignals = extractCitationSignals(text);
  return cases
    .filter((item) =>
      suspectedType === "General"
        ? true
        : item.type.toLowerCase().includes(suspectedType.toLowerCase()),
    )
    .map((item) => {
      const haystack =
        `${item.title} ${item.summary} ${item.tags.join(" ")} ${item.whyMatch} ${item.citation || ""}`.toLowerCase();
      const overlap = keywords.reduce(
        (score, keyword) => (haystack.includes(keyword) ? score + 1 : score),
        0,
      );
      const citationText = `${item.citation || ""}`.toUpperCase();
      const citationYearBoost = citationSignals.years.includes(
        String(item.year),
      )
        ? 8
        : 0;
      const citationReporterHits = citationSignals.reporters.reduce(
        (score, reporter) =>
          citationText.includes(reporter) ? score + 1 : score,
        0,
      );
      const citationBoost = citationYearBoost + citationReporterHits * 10;
      const totalScore =
        overlap * 8 +
        item.similarity * 0.6 +
        (item.priorityScore || 0) * 0.2 +
        citationBoost;

      let reason;
      if (citationBoost > 0 && overlap > 0) {
        reason = `Matched by overlapping legal terms (${overlap} keyword hits), case-type similarity, and citation overlap.`;
      } else if (citationBoost > 0) {
        reason = `Matched by citation overlap and case-type similarity (${item.type}).`;
      } else if (overlap > 0) {
        reason = `Matched by overlapping legal terms (${overlap} keyword hits) and case-type similarity.`;
      } else {
        reason = `Matched by case-type similarity (${item.type}) and baseline legal relevance.`;
      }

      return {
        title: item.title,
        similarity: Math.min(99, Math.max(45, Math.round(totalScore))),
        reason,
        _score: totalScore,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
    .map(({ _score, ...rest }) => rest);
}

function extractCitationSignals(text) {
  const upper = `${text || ""}`.toUpperCase();
  const years = Array.from(
    new Set((upper.match(/\b(?:19|20)\d{2}\b/g) || []).slice(0, 8)),
  );
  const reporters = ["AIR", "SCC", "SCR", "CRILJ", "ALL ER"].filter((token) =>
    upper.includes(token),
  );
  return { years, reporters };
}

function extractTopKeywords(text) {
  const stopWords = new Set([
    "shall",
    "would",
    "could",
    "their",
    "there",
    "where",
    "which",
    "under",
    "being",
    "against",
    "within",
    "without",
    "hereby",
    "thereof",
    "therein",
    "about",
    "before",
    "after",
    "party",
    "court",
    "appeal",
    "petition",
    "respondent",
  ]);
  const tokens = text.toLowerCase().match(/[a-z]{4,}/g) || [];
  const frequencies = new Map();

  for (const token of tokens) {
    if (stopWords.has(token)) continue;
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  return Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([word]) => word);
}

function extractJudgmentText(fullText, decisionSegment, summary) {
  const fromDecision = normalizeText(decisionSegment || "");
  if (fromDecision && fromDecision.length > 2) {
    return fromDecision.slice(0, 320);
  }

  const source = normalizeText(fullText || "");
  if (!source) {
    return normalizeText(summary || "") || "Judgment text unavailable.";
  }

  const anchors = [
    /\bfinal order\b/i,
    /\bordered that\b/i,
    /\bheld that\b/i,
    /\bdecision\b/i,
    /\bjudgment\b/i,
    /\bresult\b/i,
  ];

  for (const anchor of anchors) {
    const match = source.match(anchor);
    if (match?.index != null) {
      return source.slice(match.index, match.index + 320).trim();
    }
  }

  return source.slice(0, 320).trim();
}

function extractFinalVerdict(judgmentText) {
  const normalized = normalizeText(judgmentText || "");
  if (!normalized) return "Unknown";

  // Legacy dataset uses Decision: 0/1 markers for outcomes.
  if (
    /^(1|1\.0)$/.test(normalized) ||
    /\bdecision\s*:\s*1(?:\.0)?\b/i.test(normalized)
  )
    return "Allowed";
  if (
    /^(0|0\.0)$/.test(normalized) ||
    /\bdecision\s*:\s*0(?:\.0)?\b/i.test(normalized)
  )
    return "Dismissed";

  for (const rule of VERDICT_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.label;
    }
  }

  return "Unknown";
}

function computeVerdictSignalBoost(text) {
  const source = `${text || ""}`.toLowerCase();
  if (!source) return 0;

  let boost = 0;
  if (/\b(dismissed|rejected)\b/.test(source)) boost += 3;
  if (/\b(allowed|granted)\b/.test(source)) boost += 3;
  if (/\b(convicted|acquitted|sentenced)\b/.test(source)) boost += 4;
  if (/\b(final order|held that|ordered that)\b/.test(source)) boost += 2;
  return boost;
}

function deriveWhyMatch(raw) {
  const details = [];
  if (raw.issues) details.push("issue overlap");
  if (raw.decision) details.push("similar outcome pattern");
  if (raw.citation) details.push("citation support");
  if (details.length === 0)
    return "Matched on legal narrative similarity from title and summary context.";
  return `Matched on ${details.join(", ")} in the source judgment metadata.`;
}

function toClearFinalJudgment(verdict, caseTitle) {
  const normalizedVerdict = `${verdict || ""}`.toLowerCase();
  const normalizedTitle = `${caseTitle || ""}`.toLowerCase();

  // Keep specific legal outcomes explicit and untouched.
  if (/conviction|convicted/.test(normalizedVerdict))
    return "Conviction Recorded";
  if (/acquittal|acquitted/.test(normalizedVerdict))
    return "Acquittal Recorded";
  if (/bail granted/.test(normalizedVerdict)) return "Bail Granted";
  if (/bail rejected|bail denied|bail dismissed/.test(normalizedVerdict))
    return "Bail Rejected";
  if (/remand/.test(normalizedVerdict)) return "Matter Remanded";
  if (/disposed/.test(normalizedVerdict)) return "Matter Disposed";

  let caseKind = "Case";
  if (/\bappeal\b/.test(normalizedTitle)) caseKind = "Appeal";
  else if (/\bpetition\b|\bwrit\b|\bslp\b/.test(normalizedTitle))
    caseKind = "Petition";
  else if (/\bapplication\b/.test(normalizedTitle)) caseKind = "Application";

  if (
    /partly allowed|partially allowed|allowed in part|partly granted/.test(
      normalizedVerdict,
    )
  ) {
    return `${caseKind} Partly Allowed`;
  }

  if (
    /dismissed|rejected|declined|denied|failed|case dismissed \/ rejected/.test(
      normalizedVerdict,
    )
  ) {
    return `${caseKind} Dismissed`;
  }

  if (
    /allowed|granted|in favor|successful|case allowed \/ in favor/.test(
      normalizedVerdict,
    )
  ) {
    return `${caseKind} Allowed`;
  }

  return verdict || "Judgement unavailable";
}

function buildTags(raw) {
  const tags = new Set();
  tags.add(raw.jurisdiction || "India");
  if (raw.citation) tags.add("Cited");
  const issues = `${raw.issues || ""}`.toLowerCase();
  if (issues.includes("article 14")) tags.add("Equality");
  if (issues.includes("article 21")) tags.add("Life & Liberty");
  if (issues.includes("tax")) tags.add("Tax");
  if (issues.includes("criminal")) tags.add("Criminal");
  if (issues.includes("service")) tags.add("Service Law");
  if (tags.size < 2) tags.add("General");
  return Array.from(tags).slice(0, 4);
}

function computeSimilarity(raw) {
  let score = 55;
  const issuesLength = (raw.issues || "").length;
  const decisionLength = (raw.decision || "").length;
  const citationCount = (raw.citation || "").split(",").filter(Boolean).length;

  score += Math.min(20, Math.round(issuesLength / 50));
  score += Math.min(10, Math.round(decisionLength / 40));
  score += Math.min(8, citationCount * 2);
  if ((raw.title || "").length > 30) score += 4;

  return Math.max(45, Math.min(98, score));
}

function computePriority(raw) {
  const text =
    `${raw.issues || ""} ${raw.decision || ""} ${raw.title || ""}`.toLowerCase();

  const urgency = keywordScore(
    text,
    ["bail", "stay", "urgent", "interim", "habeas", "injunction"],
    100,
  );
  const impact = keywordScore(
    text,
    ["constitutional", "fundamental", "public", "nation", "policy"],
    100,
  );
  const deadlineRisk = keywordScore(
    text,
    ["limitation", "deadline", "period", "time-barred"],
    100,
  );
  const similarityConfidence =
    60 +
    Math.min(
      40,
      ((raw.citation || "").match(/AIR|SCC|SCR|CriLJ/gi) || []).length * 8,
    );
  const complianceRisk = keywordScore(
    text,
    ["tax", "regulation", "penalty", "violation", "compliance"],
    100,
  );

  // ── Crime severity boost ──────────────────────────────────────────────────
  let severityBoost = 0;
  if (/\b(murder|culpable homicide|attempt to murder|homicide)\b/.test(text))
    severityBoost = 32;
  else if (/\b(rape|sexual assault|acid attack|pocso)\b/.test(text))
    severityBoost = 30;
  else if (/\b(terror|uapa|blast|sedition|nsa)\b/.test(text))
    severityBoost = 35;
  else if (/\b(kidnap|abduction|ransom|trafficking)\b/.test(text))
    severityBoost = 26;
  else if (/\b(grievous|armed robbery|dacoity|extortion|rioting)\b/.test(text))
    severityBoost = 18;
  else if (/\b(fraud|money laundering|forgery|corruption|bribery)\b/.test(text))
    severityBoost = 14;
  else if (/\b(domestic violence|cheating|theft|burglary)\b/.test(text))
    severityBoost = 8;

  const weighted =
    0.3 * urgency +
    0.25 * impact +
    0.2 * deadlineRisk +
    0.15 * similarityConfidence +
    0.1 * complianceRisk;

  const year = Number.parseInt((raw.decision_date || "").slice(0, 4), 10);
  const recencyBoost = Number.isFinite(year)
    ? Math.max(0, year - 2000) * 0.15
    : 0;

  return Math.max(
    20,
    Math.min(99, Math.round(weighted + recencyBoost + severityBoost)),
  );
}

function toPriorityBand(score) {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

function keywordScore(text, terms, maxScore) {
  const hits = terms.reduce(
    (acc, term) => (text.includes(term) ? acc + 1 : acc),
    0,
  );
  return Math.min(maxScore, Math.round((hits / terms.length) * maxScore));
}

function extractSegment(text, label) {
  const source = text || "";
  const start = source.indexOf(label);
  if (start < 0) return "";
  const after = source.slice(start + label.length);
  const endIndex = after.indexOf("\n");
  return (endIndex >= 0 ? after.slice(0, endIndex) : after).trim();
}

if (process.argv[1] === __filename) {
  const port = Number.parseInt(process.env.PORT || "4000", 10);
  const server = await createServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`LexMatch API running at http://127.0.0.1:${port}`);
    // Boot-time indexing
    void loadCases().then(() => {
      console.log("✅ [System] Case corpus and RAG index initialized");
    });
  });
}
