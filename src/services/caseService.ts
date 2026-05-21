/**
 * Case service — all case retrieval, search, filtering, and insights.
 * Falls back gracefully to local JSON when the API server is offline.
 */

import type { CaseResult, InsightsData } from "@/types";
import { fetchJson } from "./api";
import {
  computePriority,
  computeSimilarity,
  toPriorityBand,
  buildTags,
} from "@/lib/scoring";
import {
  extractSegment,
  extractCitedCaseNames,
  extractJudgmentText,
  extractFinalVerdict,
  parseIssueList,
  humanizeTitle,
  humanizeSummary,
  humanizeJudgment,
  humanizeWhyMatch,
  humanizeQueryMatch,
  sanitizeDisplayText,
  buildLocalHumanizedNarrative,
  buildLocalAiReason,
  buildTrendingTopics,
  getMatchLevel,
} from "@/lib/textUtils";
import { saveSearch } from "./historyService";

// ── Local case data loader ──────────────────────────────────────────────────

let _caseCache: CaseResult[] | null = null;

async function loadCaseData(): Promise<CaseResult[]> {
  if (_caseCache) return _caseCache;

  const response = await fetch("/data/cases_import.json");
  if (!response.ok) {
    _caseCache = [];
    return _caseCache;
  }

  const rawCases = (await response.json()) as Array<{
    case_id: string;
    title: string;
    court: string;
    jurisdiction: string;
    decision_date: string;
    citation: string;
    case_type: string;
    summary: string;
    full_text: string;
    source_url: string;
    source_name: string;
  }>;

  _caseCache = rawCases.map((raw) => {
    const issues = extractSegment(raw.full_text, "Issues:");
    const decision = extractSegment(raw.full_text, "Decision:");
    const citedCasesRaw = extractSegment(raw.full_text, "Cited Cases:");
    const citedNames = extractCitedCaseNames(citedCasesRaw);
    const judgesRaw = extractSegment(raw.full_text, "Judges:");
    const rawJudgment = extractJudgmentText(raw.full_text, decision, raw.summary);
    const finalVerdict = extractFinalVerdict(rawJudgment);
    const year =
      Number.parseInt(raw.decision_date?.slice(0, 4) || "0", 10) || 2000;
    const priority = computePriority({
      title: raw.title,
      citation: raw.citation,
      decision_date: raw.decision_date,
      issues,
      decision,
    });
    const similarity = computeSimilarity({
      title: raw.title,
      citation: raw.citation,
      issues,
      decision,
    });

    const cleanTitle = humanizeTitle(raw.title);
    const issueList = parseIssueList(issues);

    return {
      id: raw.case_id,
      title: cleanTitle,
      court: raw.court,
      year,
      similarity,
      priorityScore: priority,
      priorityBand: toPriorityBand(priority),
      summary: humanizeSummary({
        title: cleanTitle,
        court: raw.court,
        year,
        issues: issueList,
        verdict: finalVerdict,
        judges: judgesRaw,
        caseType: raw.case_type,
      }),
      judgment: humanizeJudgment({
        title: cleanTitle,
        verdict: finalVerdict,
        issues: issueList,
        citedCases: citedNames,
      }),
      finalVerdict,
      final_verdict: finalVerdict,
      whyMatch: humanizeWhyMatch({
        title: cleanTitle,
        citation: raw.citation,
        issues: issueList,
        caseType: raw.case_type,
        citedCases: citedNames,
      }),
      type: raw.case_type || "General",
      tags: buildTags({
        citation: raw.citation,
        jurisdiction: raw.jurisdiction,
        issues,
      }),
    };
  });

  return _caseCache;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getCases(): Promise<CaseResult[]> {
  const fromApi = (await fetchJson("/api/cases")) as CaseResult[] | null;
  if (fromApi && Array.isArray(fromApi)) return fromApi;

  const allCases = await loadCaseData();
  return allCases
    .slice()
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
}

export async function searchCases(query: string): Promise<CaseResult[]> {
  const fromApi = (await fetchJson(
    `/api/cases/search?q=${encodeURIComponent(query)}`,
  )) as CaseResult[] | { results?: CaseResult[] } | null;

  const apiResults = Array.isArray(fromApi)
    ? fromApi
    : Array.isArray((fromApi as { results?: CaseResult[] })?.results)
      ? (fromApi as { results: CaseResult[] }).results
      : null;

  if (apiResults) {
    const mapped = apiResults.map((item) => {
      const mappedJudgement =
        item.judgement ||
        item.judgment ||
        item.finalVerdict ||
        item.final_verdict ||
        "Judgement unavailable";
      const cleanSummary = sanitizeDisplayText(item.summary || "");
      const cleanJudgment = sanitizeDisplayText(item.judgment || mappedJudgement);
      const cleanJudgmentNarrative = item.judgmentNarrative
        ? sanitizeDisplayText(item.judgmentNarrative)
        : cleanJudgment || mappedJudgement;
      return {
        ...item,
        matchLevel:
          item.matchLevel || getMatchLevel((item.similarity || 0) / 100),
        summary:
          cleanSummary ||
          "This case involves a legal dispute reviewed by the court.",
        judgement: mappedJudgement,
        judgment: cleanJudgment || mappedJudgement,
        judgmentNarrative: cleanJudgmentNarrative,
        finalVerdict: item.finalVerdict || mappedJudgement,
        final_verdict: item.final_verdict || mappedJudgement,
        whyMatch:
          item.whyMatched || item.whyMatch || humanizeQueryMatch(query, item),
        whyMatched: item.whyMatched || item.whyMatch,
        matchedTerms: item.matchedTerms || item.tags || [],
        tags: item.tags || [],
      };
    });
    if (query.trim()) {
      void saveSearch(query, mapped.length);
    }
    return mapped;
  }

  const allCases = await loadCaseData();
  const q = query.toLowerCase().trim();
  if (!q) return allCases.slice(0, 5);

  const scored = allCases
    .map((item) => {
      const blob =
        `${item.title} ${item.summary} ${item.whyMatch} ${item.tags.join(" ")}`.toLowerCase();
      const keywordHits = q
        .split(/\s+/)
        .filter((term) => term && blob.includes(term)).length;
      const rankScore =
        keywordHits * 20 + item.similarity + (item.priorityScore || 0) * 0.4;
      return { item, rankScore };
    })
    .filter((x) => x.rankScore > 0)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 5)
    .map((x) => ({
      ...x.item,
      matchLevel: getMatchLevel((x.item.similarity || 0) / 100),
      judgement:
        x.item.judgment ||
        x.item.finalVerdict ||
        x.item.final_verdict ||
        "Judgement unavailable",
      whyMatch: humanizeQueryMatch(query, x.item),
      matchedTerms: x.item.tags || [],
    }));

  if (q) void saveSearch(query, scored.length);
  return scored;
}

export async function getFilteredCases(
  court?: string,
  type?: string,
): Promise<CaseResult[]> {
  const params = new URLSearchParams();
  if (court && court !== "All Courts") params.set("court", court);
  if (type && type !== "All Types") params.set("type", type);
  const fromApi = (await fetchJson(
    `/api/cases?${params.toString()}`,
  )) as CaseResult[] | null;
  if (fromApi && Array.isArray(fromApi)) return fromApi;

  const allCases = await loadCaseData();
  return allCases.filter((item) => {
    if (court && court !== "All Courts" && item.court !== court) return false;
    if (type && type !== "All Types" && item.type !== type) return false;
    return true;
  });
}

export async function getCaseById(id: string): Promise<CaseResult | null> {
  const fromApi = (await fetchJson(
    `/api/cases/${encodeURIComponent(id)}`,
  )) as CaseResult | null;
  if (fromApi) return fromApi;

  const allCases = await loadCaseData();
  return allCases.find((item) => item.id === id) || null;
}

export async function explainCaseMatch(
  query: string,
  item: CaseResult,
): Promise<string> {
  const fromApi = (await fetchJson(
    `/api/cases/${encodeURIComponent(item.id)}/explain?q=${encodeURIComponent(query)}`,
  )) as { explanation?: string } | null;
  if (fromApi?.explanation) return fromApi.explanation;

  return buildLocalAiReason(query, item);
}

export async function explainMatches(
  query: string,
  items: CaseResult[],
): Promise<Record<string, string>> {
  const reasons = await Promise.all(
    items.slice(0, 30).map(async (item) => ({
      id: item.id,
      reason: await explainCaseMatch(query, item),
    })),
  );
  return reasons.reduce<Record<string, string>>((acc, current) => {
    acc[current.id] = current.reason;
    return acc;
  }, {});
}

export async function generateHumanizedCaseNarrative(
  item: CaseResult,
): Promise<string> {
  const fromApi = (await fetchJson(
    `/api/cases/${encodeURIComponent(item.id)}/humanize`,
  )) as { narrative?: string } | null;
  if (fromApi?.narrative) return fromApi.narrative;

  return buildLocalHumanizedNarrative(item);
}

export async function getInsights(): Promise<InsightsData> {
  const fromApi = (await fetchJson("/api/insights")) as InsightsData | null;
  if (fromApi) return fromApi;

  const allCases = await loadCaseData();

  const similarityDistribution = [
    { range: "90-100%", count: 0 },
    { range: "80-89%", count: 0 },
    { range: "70-79%", count: 0 },
    { range: "60-69%", count: 0 },
    { range: "50-59%", count: 0 },
    { range: "<50%", count: 0 },
  ];

  allCases.forEach((item) => {
    const s = item.similarity;
    if (s >= 90) similarityDistribution[0].count += 1;
    else if (s >= 80) similarityDistribution[1].count += 1;
    else if (s >= 70) similarityDistribution[2].count += 1;
    else if (s >= 60) similarityDistribution[3].count += 1;
    else if (s >= 50) similarityDistribution[4].count += 1;
    else similarityDistribution[5].count += 1;
  });

  const typeCounts = new Map<string, number>();
  allCases.forEach((item) => {
    typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
  });

  const caseClusters = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, cases], idx) => ({
      name,
      cases,
      color: [
        "hsl(238, 70%, 55%)",
        "hsl(270, 60%, 60%)",
        "hsl(200, 70%, 50%)",
        "hsl(160, 60%, 45%)",
        "hsl(30, 70%, 55%)",
      ][idx],
    }));

  const trendingTopics = buildTrendingTopics(allCases);

  const monthlySearches = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(
    (month, i) => ({
      month,
      searches: 120 + i * 45 + Math.round((allCases.length / 5127) * 60),
    }),
  );

  return { similarityDistribution, caseClusters, trendingTopics, monthlySearches };
}
