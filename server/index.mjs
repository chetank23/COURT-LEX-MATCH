import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "public", "data", "cases_import.json");

let caseCache = null;

async function loadCases() {
  if (caseCache) return caseCache;

  const payload = await readFile(DATA_PATH, "utf8");
  const rawCases = JSON.parse(payload);

  caseCache = rawCases.map((raw) => {
    const issues = extractSegment(raw.full_text, "Issues:");
    const decision = extractSegment(raw.full_text, "Decision:");
    const year = Number.parseInt((raw.decision_date || "").slice(0, 4), 10) || 2000;

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

    return {
      id: raw.case_id,
      title: raw.title,
      court: raw.court,
      year,
      similarity,
      priorityScore,
      priorityBand: toPriorityBand(priorityScore),
      summary: raw.summary || (raw.full_text || "").slice(0, 220),
      whyMatch: deriveWhyMatch({ issues, decision, citation: raw.citation }),
      type: raw.case_type || "General",
      tags: buildTags({ issues, citation: raw.citation, jurisdiction: raw.jurisdiction }),
    };
  });

  return caseCache;
}

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
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

  const monthlySearches = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map((month, i) => ({
    month,
    searches: 120 + i * 45 + Math.round((cases.length / 5127) * 60),
  }));

  return { similarityDistribution, caseClusters, trendingTopics, monthlySearches };
}

function buildHistory(cases) {
  const now = Date.now();
  return cases.slice(0, 8).map((item, index) => ({
    id: `hist-${item.id}`,
    type: index % 3 === 0 ? "search" : index % 3 === 1 ? "view" : "upload",
    title: item.title,
    date: new Date(now - index * 86400000).toISOString(),
    results: Math.max(1, Math.round(item.similarity / 10)),
  }));
}

export async function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    try {
      const url = parseUrl(req.url);
      const pathname = url.pathname;
      const allCases = await loadCases();

      if (pathname === "/api/health") {
        sendJson(res, 200, { ok: true, service: "lexmatch-api" });
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

        result = result.slice().sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
        sendJson(res, 200, result);
        return;
      }

      if (pathname === "/api/cases/search") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        if (!q) {
          sendJson(res, 200, allCases.slice(0, 20));
          return;
        }

        const ranked = allCases
          .map((item) => {
            const blob = `${item.title} ${item.summary} ${item.whyMatch} ${item.tags.join(" ")}`.toLowerCase();
            const keywordHits = q.split(/\s+/).filter((term) => term && blob.includes(term)).length;
            const rankScore = keywordHits * 20 + item.similarity + (item.priorityScore || 0) * 0.4;
            return { item, rankScore };
          })
          .filter((x) => x.rankScore > 0)
          .sort((a, b) => b.rankScore - a.rankScore)
          .slice(0, 20)
          .map((x) => x.item);

        sendJson(res, 200, ranked);
        return;
      }

      if (pathname === "/api/cases/priority") {
        const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
        const sorted = allCases
          .slice()
          .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
          .slice(0, Number.isFinite(limit) ? limit : 20);
        sendJson(res, 200, sorted);
        return;
      }

      if (pathname.startsWith("/api/cases/")) {
        const id = decodeURIComponent(pathname.replace("/api/cases/", ""));
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

      if (pathname === "/api/history") {
        sendJson(res, 200, buildHistory(allCases));
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

function deriveWhyMatch(raw) {
  const parts = [];
  if (raw.issues) parts.push("matched on constitutional and statutory issues");
  if (raw.decision) parts.push("similar judicial outcome signals");
  if (raw.citation) parts.push("strong citation context");
  if (parts.length === 0) return "Matched on semantic relevance in legal narrative.";
  return `AI matched this case due to ${parts.join(", ")}.`;
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
  const text = `${raw.issues || ""} ${raw.decision || ""} ${raw.title || ""}`.toLowerCase();

  const urgency = keywordScore(text, ["bail", "stay", "urgent", "interim", "habeas", "injunction"], 100);
  const impact = keywordScore(text, ["constitutional", "fundamental", "public", "nation", "policy"], 100);
  const deadlineRisk = keywordScore(text, ["limitation", "deadline", "period", "time-barred"], 100);
  const similarityConfidence = 60 + Math.min(40, ((raw.citation || "").match(/AIR|SCC|SCR|CriLJ/gi) || []).length * 8);
  const complianceRisk = keywordScore(text, ["tax", "regulation", "penalty", "violation", "compliance"], 100);

  const weighted =
    0.3 * urgency +
    0.25 * impact +
    0.2 * deadlineRisk +
    0.15 * similarityConfidence +
    0.1 * complianceRisk;

  const year = Number.parseInt((raw.decision_date || "").slice(0, 4), 10);
  const recencyBoost = Number.isFinite(year) ? Math.max(0, year - 2000) * 0.15 : 0;

  return Math.max(20, Math.min(99, Math.round(weighted + recencyBoost)));
}

function toPriorityBand(score) {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

function keywordScore(text, terms, maxScore) {
  const hits = terms.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0);
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
  });
}
