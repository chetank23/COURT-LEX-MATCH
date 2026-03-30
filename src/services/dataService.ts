import {
  CaseResult,
  TimelineEvent,
  Section,
  InsightsData,
  FIRPriorityAssessment,
  FIRJudgeAssignment,
  JudgeProfile,
  HearingSchedule,
} from "@/types";
import { AlertTriangle, FileText, Gavel, Layers, Scale } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";
const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

const FIR_JUDGE_ROSTER: Record<"Criminal" | "Civil" | "Other", string[]> = {
  Criminal: ["Justice N. Rao", "Justice P. Mehta", "Justice S. Khan"],
  Civil: ["Justice R. Iyer", "Justice K. Banerjee", "Justice V. Sen"],
  Other: ["Justice A. Menon", "Justice D. Kapoor", "Justice T. Joseph"],
};

/**
 * Data Service Layer
 * 
 * This service is structured for API integration.
 * Replace these functions with actual API calls when backend is ready.
 * 
 * Example API integration:
 * const response = await fetch('/api/cases');
 * return response.json();
 */

export const dataService = {
  _caseCache: null as CaseResult[] | null,

  async _requestJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
      if (!response.ok) return null;
      if (response.status === 204) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  },

  async _fetchJson<T>(url: string): Promise<T | null> {
    return (await this._requestJson(url, { method: "GET" })) as T | null;
  },

  async _loadCaseData(): Promise<CaseResult[]> {
    if (this._caseCache) return this._caseCache;

    const response = await fetch("/data/cases_import.json");
    if (!response.ok) {
      this._caseCache = [];
      return this._caseCache;
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

    this._caseCache = rawCases.map((raw) => {
      const issues = extractSegment(raw.full_text, "Issues:");
      const decision = extractSegment(raw.full_text, "Decision:");
      const judgment = extractJudgmentText(raw.full_text, decision, raw.summary);
      const finalVerdict = extractFinalVerdict(judgment);
      const year = Number.parseInt(raw.decision_date?.slice(0, 4) || "0", 10) || 2000;
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

      return {
        id: raw.case_id,
        title: raw.title,
        court: raw.court,
        year,
        similarity,
        priorityScore: priority,
        priorityBand: toPriorityBand(priority),
        summary: raw.summary || raw.full_text.slice(0, 220),
        judgment,
        finalVerdict,
        final_verdict: finalVerdict,
        whyMatch: deriveWhyMatch({
          citation: raw.citation,
          issues,
          decision,
        }),
        type: raw.case_type || "General",
        tags: buildTags({
          citation: raw.citation,
          jurisdiction: raw.jurisdiction,
          issues,
        }),
      };
    });

    return this._caseCache;
  },

  /**
   * Fetch all legal cases.
   */
  async getCases(): Promise<CaseResult[]> {
    const fromApi = (await this._fetchJson("/api/cases")) as CaseResult[] | null;
    if (fromApi && Array.isArray(fromApi)) {
      return fromApi;
    }

    const allCases = await this._loadCaseData();
    return allCases
      .slice()
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  },

  /**
   * Search for cases based on query.
   */
  async searchCases(query: string): Promise<CaseResult[]> {
    const fromApi = (await this._fetchJson(`/api/cases/search?q=${encodeURIComponent(query)}`)) as
      | CaseResult[]
      | { results?: CaseResult[] }
      | null;

    const apiResults = Array.isArray(fromApi)
      ? fromApi
      : Array.isArray(fromApi?.results)
        ? fromApi.results
        : null;

    if (apiResults) {
      return apiResults.map((item) => {
        const mappedJudgement = item.judgement || item.judgment || item.finalVerdict || item.final_verdict || "Judgement unavailable";
        return {
          ...item,
          matchLevel: item.matchLevel || getMatchLevel((item.similarity || 0) / 100),
          judgement: mappedJudgement,
          judgment: item.judgment || mappedJudgement,
          finalVerdict: item.finalVerdict || mappedJudgement,
          final_verdict: item.final_verdict || mappedJudgement,
          whyMatch: item.whyMatched || item.whyMatch || toQuerySpecificReason(query, item),
          whyMatched: item.whyMatched || item.whyMatch,
          matchedTerms: item.matchedTerms || item.tags || [],
          tags: item.tags || [],
        };
      });
    }

    const allCases = await this._loadCaseData();
    const q = query.toLowerCase().trim();
    if (!q) return allCases.slice(0, 5);

    const scored = allCases
      .map((item) => {
        const blob = `${item.title} ${item.summary} ${item.whyMatch} ${item.tags.join(" ")}`.toLowerCase();
        const keywordHits = q.split(/\s+/).filter((term) => term && blob.includes(term)).length;
        const rankScore = keywordHits * 20 + item.similarity + (item.priorityScore || 0) * 0.4;
        return { item, rankScore };
      })
      .filter((x) => x.rankScore > 0)
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 5)
      .map((x) => ({
        ...x.item,
        matchLevel: getMatchLevel((x.item.similarity || 0) / 100),
        judgement: x.item.judgment || x.item.finalVerdict || x.item.final_verdict || "Judgement unavailable",
        whyMatch: toQuerySpecificReason(query, x.item),
        matchedTerms: x.item.tags || [],
      }));

    return scored;
  },

  /**
   * Get cases filtered by court and type.
   */
  async getFilteredCases(
    court?: string,
    type?: string
  ): Promise<CaseResult[]> {
    const params = new URLSearchParams();
    if (court && court !== "All Courts") params.set("court", court);
    if (type && type !== "All Types") params.set("type", type);
    const fromApi = (await this._fetchJson(`/api/cases?${params.toString()}`)) as CaseResult[] | null;
    if (fromApi && Array.isArray(fromApi)) {
      return fromApi;
    }

    const allCases = await this._loadCaseData();
    return allCases.filter((item) => {
      if (court && court !== "All Courts" && item.court !== court) return false;
      if (type && type !== "All Types" && item.type !== type) return false;
      return true;
    });
  },

  /**
   * Get a single case by ID.
   */
  async getCaseById(id: string): Promise<CaseResult | null> {
    const fromApi = (await this._fetchJson(`/api/cases/${encodeURIComponent(id)}`)) as CaseResult | null;
    if (fromApi) return fromApi;

    const allCases = await this._loadCaseData();
    return allCases.find((item) => item.id === id) || null;
  },

  /**
   * Get explanation for why a case matches the user query.
   * Uses backend explanation when available, otherwise deterministic local fallback.
   */
  async explainCaseMatch(query: string, item: CaseResult): Promise<string> {
    const fromApi = (await this._fetchJson(
      `/api/cases/${encodeURIComponent(item.id)}/explain?q=${encodeURIComponent(query)}`
    )) as { explanation?: string } | null;
    if (fromApi?.explanation) return fromApi.explanation;

    return buildLocalAiReason(query, item);
  },

  async explainMatches(query: string, items: CaseResult[]): Promise<Record<string, string>> {
    const topItems = items.slice(0, 30);
    const reasons = await Promise.all(
      topItems.map(async (item) => ({
        id: item.id,
        reason: await this.explainCaseMatch(query, item),
      }))
    );

    return reasons.reduce<Record<string, string>>((acc, current) => {
      acc[current.id] = current.reason;
      return acc;
    }, {});
  },

  /**
   * Analyze PDF and extract sections
   */
  async analyzePDF(file: File): Promise<Section[]> {
    const contentBase64 = await fileToBase64(file);

    const fromApi = (await this._requestJson("/api/analyze-pdf", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        contentBase64,
      }),
    })) as { sections?: Array<Omit<Section, "icon"> & { icon?: string }> } | null;

    if (fromApi?.sections && Array.isArray(fromApi.sections) && fromApi.sections.length > 0) {
      return fromApi.sections.map((section, index) => ({
        id: section.id || `sec-${index + 1}`,
        title: section.title || `Section ${index + 1}`,
        icon: sectionIconFromName(section.icon),
        content: section.content || "",
        summary: section.summary || "",
        highlights: Array.isArray(section.highlights) ? section.highlights : [],
        tags: Array.isArray(section.tags) ? section.tags : [],
        matches: Array.isArray(section.matches) ? section.matches : [],
      }));
    }

    return buildFallbackSections(file.name);
  },

  async assessFIRPriority(file: File, sections: Section[]): Promise<FIRPriorityAssessment> {
    const fromApi = (await this._fetchJson(
      `/api/fir/assess-priority?filename=${encodeURIComponent(file.name)}`
    )) as FIRPriorityAssessment | null;
    if (fromApi) return fromApi;

    const combinedText = [
      file.name,
      ...sections.map((section) => `${section.title} ${section.summary} ${section.content}`),
    ].join(" ");

    const caseType = classifyFIRCaseType(combinedText);
    const severity = detectFIRSeverity(combinedText);

    const typeWeight: Record<FIRPriorityAssessment["caseType"], number> = {
      Criminal: 35,
      Civil: 22,
      "Specialized Cases": 28,
    };
    const severityWeight: Record<FIRPriorityAssessment["severity"], number> = {
      Low: 12,
      Medium: 24,
      High: 36,
      Critical: 48,
    };

    const score = Math.max(20, Math.min(99, typeWeight[caseType] + severityWeight[severity]));

    return {
      caseType,
      severity,
      priorityScore: score,
      priorityBand: toPriorityBand(score),
      rationale: buildFIRPriorityRationale(caseType, severity),
    };
  },

  async assignJudgeForFIR(
    file: File,
    assessment: FIRPriorityAssessment,
    sections: Section[]
  ): Promise<FIRJudgeAssignment> {
    const fromApi = (await this._fetchJson(
      `/api/fir/assign-judge?filename=${encodeURIComponent(file.name)}`
    )) as FIRJudgeAssignment | null;
    if (fromApi) return fromApi;

    const category: FIRJudgeAssignment["category"] =
      assessment.caseType === "Criminal"
        ? "Criminal"
        : assessment.caseType === "Civil"
          ? "Civil"
          : "Other";

    const availableJudges = FIR_JUDGE_ROSTER[category];
    const seed = `${file.name}:${assessment.caseType}:${assessment.severity}:${sections.length}`;
    const assignedJudge = availableJudges[hashText(seed) % availableJudges.length];
    const requiresPublicProsecutor = category === "Criminal";

    return {
      category,
      assignedJudge,
      availableJudges,
      partyLabel: requiresPublicProsecutor ? "Accused" : "Defendant",
      requiresPublicProsecutor,
    };
  },

  /**
   * Get user activity history.
   */
  async getActivityHistory(): Promise<TimelineEvent[]> {
    const fromApi = (await this._fetchJson("/api/history")) as TimelineEvent[] | null;
    if (fromApi && Array.isArray(fromApi)) {
      return fromApi;
    }

    const allCases = await this._loadCaseData();
    const now = new Date();

    return allCases.slice(0, 8).map((item, index) => ({
      id: `hist-${item.id}`,
      type: index % 3 === 0 ? "search" : index % 3 === 1 ? "view" : "upload",
      title: item.title,
      date: new Date(now.getTime() - index * 24 * 60 * 60 * 1000).toISOString(),
      results: Math.max(1, Math.round((item.similarity || 50) / 10)),
    }));
  },

  /**
   * Get analytics and insights.
   */
  async getInsights(): Promise<InsightsData> {
    const fromApi = (await this._fetchJson("/api/insights")) as InsightsData | null;
    if (fromApi) {
      return fromApi;
    }

    const allCases = await this._loadCaseData();

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

    const monthlySearches = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map((month, i) => ({
      month,
      searches: 120 + i * 45 + Math.round((allCases.length / 5127) * 60),
    }));

    return {
      similarityDistribution,
      caseClusters,
      trendingTopics,
      monthlySearches,
    };
  },

  /**
   * Save search query to history.
   */
  async saveSearch(query: string, results: number): Promise<void> {
    await this._requestJson("/api/history/search", {
      method: "POST",
      body: JSON.stringify({ query, results }),
    });
  },

  /**
   * Save PDF upload to history.
   */
  async savePDFUpload(
    filename: string,
    matchesFound: number
  ): Promise<void> {
    await this._requestJson("/api/history/upload", {
      method: "POST",
      body: JSON.stringify({ filename, matchesFound }),
    });
  },

  /**
   * Judge Management.
   */
  async getJudges(): Promise<JudgeProfile[]> {
    const fromApi = (await this._fetchJson("/api/judges")) as JudgeProfile[] | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },

  async getJudgeById(judgeId: string): Promise<JudgeProfile | null> {
    return (await this._fetchJson(`/api/judges/${encodeURIComponent(judgeId)}`)) as JudgeProfile | null;
  },

  async addJudge(judge: JudgeProfile): Promise<JudgeProfile> {
    const fromApi = (await this._requestJson("/api/judges", {
      method: "POST",
      body: JSON.stringify(judge),
    })) as JudgeProfile | null;
    if (fromApi) return fromApi;
    return judge;
  },

  async editJudge(judgeId: string, updates: Partial<JudgeProfile>): Promise<Partial<JudgeProfile>> {
    const fromApi = (await this._requestJson(`/api/judges/${encodeURIComponent(judgeId)}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    })) as Partial<JudgeProfile> | null;
    if (fromApi) return fromApi;
    return updates;
  },

  async removeJudge(judgeId: string): Promise<void> {
    await this._requestJson(`/api/judges/${encodeURIComponent(judgeId)}`, {
      method: "DELETE",
    });
  },

  /**
   * Hearing Schedule Management.
   */
  async getHearings(): Promise<HearingSchedule[]> {
    const fromApi = (await this._fetchJson("/api/hearings")) as HearingSchedule[] | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },

  async getHearingById(hearingId: string): Promise<HearingSchedule | null> {
    return (await this._fetchJson(`/api/hearings/${encodeURIComponent(hearingId)}`)) as HearingSchedule | null;
  },

  async addHearing(hearing: HearingSchedule): Promise<HearingSchedule> {
    const fromApi = (await this._requestJson("/api/hearings", {
      method: "POST",
      body: JSON.stringify(hearing),
    })) as HearingSchedule | null;
    if (fromApi) return fromApi;
    return hearing;
  },

  async editHearing(hearingId: string, updates: Partial<HearingSchedule>): Promise<Partial<HearingSchedule>> {
    const fromApi = (await this._requestJson(`/api/hearings/${encodeURIComponent(hearingId)}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    })) as Partial<HearingSchedule> | null;
    if (fromApi) return fromApi;
    return updates;
  },

  async removeHearing(hearingId: string): Promise<void> {
    await this._requestJson(`/api/hearings/${encodeURIComponent(hearingId)}`, {
      method: "DELETE",
    });
  },

  async getHearingsByCaseId(caseId: string): Promise<HearingSchedule[]> {
    const fromApi = (await this._fetchJson(`/api/hearings?caseId=${encodeURIComponent(caseId)}`)) as
      | HearingSchedule[]
      | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },

  async getHearingsByJudgeId(judgeId: string): Promise<HearingSchedule[]> {
    const fromApi = (await this._fetchJson(`/api/hearings?judgeId=${encodeURIComponent(judgeId)}`)) as
      | HearingSchedule[]
      | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },
};

function sectionIconFromName(name?: string): Section["icon"] {
  const key = `${name || ""}`.toLowerCase();
  if (key === "alerttriangle") return AlertTriangle;
  if (key === "scale") return Scale;
  if (key === "gavel") return Gavel;
  if (key === "layers") return Layers;
  return FileText;
}

function buildFallbackSections(fileName: string): Section[] {
  const inferredType = inferTypeFromFileName(fileName);
  return [
    {
      id: "fallback-facts",
      title: "Facts",
      icon: FileText,
      content: `Processed ${fileName}. Core factual narrative extracted from available document metadata for ${inferredType.toLowerCase()} review.`,
      summary: "Captured factual background from uploaded file context.",
      highlights: [fileName, inferredType],
      tags: [inferredType, "Facts"],
      matches: [],
    },
    {
      id: "fallback-issues",
      title: "Issues",
      icon: AlertTriangle,
      content: "Potential issues include maintainability, statutory applicability, and burden of proof; verify against full record.",
      summary: "Detected likely legal issues for preliminary triage.",
      highlights: ["maintainability", "statutory applicability", "burden of proof"],
      tags: [inferredType, "Issues"],
      matches: [],
    },
    {
      id: "fallback-relief",
      title: "Relief Sought",
      icon: Scale,
      content: "Likely seeks interim and final relief. Validate specific prayer clauses from the signed petition.",
      summary: "Outlined probable relief structure based on document metadata.",
      highlights: ["interim relief", "final relief"],
      tags: [inferredType, "Relief"],
      matches: [],
    },
  ];
}

function inferTypeFromFileName(fileName: string): "Criminal" | "Civil" | "Specialized Cases" {
  const lower = fileName.toLowerCase();
  if (lower.includes("fir") || lower.includes("ipc") || lower.includes("crime")) return "Criminal";
  if (lower.includes("property") || lower.includes("contract") || lower.includes("civil")) return "Civil";
  return "Specialized Cases";
}

async function fileToBase64(file: File): Promise<string | null> {
  if (!(file instanceof File)) return null;
  if (file.size <= 0 || file.size > MAX_PDF_UPLOAD_BYTES) return null;

  try {
    const buffer = await file.arrayBuffer();
    return arrayBufferToBase64(buffer);
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    for (let j = i; j < end; j += 1) {
      binary += String.fromCharCode(bytes[j]);
    }
  }

  return btoa(binary);
}

function buildTags(raw: {
  issues: string;
  citation: string;
  jurisdiction: string;
}) {
  const tags = new Set<string>();
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

function deriveWhyMatch(raw: {
  issues: string;
  decision: string;
  citation: string;
}) {
  const details = [];
  if (raw.issues) details.push("issue overlap");
  if (raw.decision) details.push("similar outcome pattern");
  if (raw.citation) details.push("citation support");
  if (details.length === 0) return "Matched on legal narrative similarity from title and summary context.";
  return `Matched on ${details.join(", ")} in the source judgment metadata.`;
}

function computeSimilarity(raw: {
  issues: string;
  decision: string;
  citation: string;
  title: string;
}) {
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

function computePriority(raw: {
  issues: string;
  decision_date: string;
  citation: string;
  decision: string;
  title: string;
}) {
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

function toPriorityBand(score: number): "P0" | "P1" | "P2" | "P3" {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

function getMatchLevel(score: number) {
  if (score >= 0.8) return "High Match";
  if (score >= 0.6) return "Moderate Match";
  if (score >= 0.4) return "Low Match";
  return "Very Low Match";
}

function keywordScore(text: string, terms: string[], maxScore: number) {
  const hits = terms.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0);
  return Math.min(maxScore, Math.round((hits / terms.length) * maxScore));
}

function buildTrendingTopics(cases: CaseResult[]) {
  const topicCounts = new Map<string, number>();
  cases.forEach((item) => {
    item.tags.forEach((tag) => {
      topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
    });
  });

  return Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, searches], idx) => ({
      topic,
      growth: 40 + (6 - idx) * 12,
      searches,
    }));
}

function extractSegment(text: string, label: string) {
  const source = text || "";
  const start = source.indexOf(label);
  if (start < 0) return "";
  const after = source.slice(start + label.length);
  const endIndex = after.indexOf("\n");
  return (endIndex >= 0 ? after.slice(0, endIndex) : after).trim();
}

function extractJudgmentText(fullText: string, decision: string, summary: string) {
  const source = (fullText || "").trim();
  if (!source) return summary || "";
  if (decision && source.includes(decision)) return decision;

  const markers = [/decision:/i, /judgment:/i, /held:/i, /order:/i, /conclusion:/i];
  for (const marker of markers) {
    const match = source.match(marker);
    if (match?.index !== undefined) {
      const tail = source.slice(match.index + match[0].length).trim();
      if (tail) return tail.slice(0, 1200);
    }
  }

  return source.slice(0, 1200);
}

function extractFinalVerdict(judgment: string) {
  const normalized = (judgment || "").toLowerCase();
  if (!normalized) return "Unknown";

  if (normalized.includes("dismissed")) return "Dismissed";
  if (normalized.includes("allowed") || normalized.includes("granted")) return "Allowed";
  if (normalized.includes("convicted")) return "Convicted";
  if (normalized.includes("acquitted")) return "Acquitted";
  if (normalized.includes("partly allowed") || normalized.includes("partially allowed")) return "Partly Allowed";

  return "Resolved";
}

function classifyFIRCaseType(text: string): FIRPriorityAssessment["caseType"] {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("fir") ||
    normalized.includes("ipc") ||
    normalized.includes("criminal") ||
    normalized.includes("theft") ||
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

function detectFIRSeverity(text: string): FIRPriorityAssessment["severity"] {
  const normalized = text.toLowerCase();

  if (
    includesAny(normalized, ["murder", "rape", "terror", "kidnap", "attempt to murder", "acid attack"])
  ) {
    return "Critical";
  }

  if (
    includesAny(normalized, ["grievous", "armed", "extortion", "rioting", "fraud", "serious injury"])
  ) {
    return "High";
  }

  if (
    includesAny(normalized, ["threat", "cheating", "breach", "damage", "dispute"])
  ) {
    return "Medium";
  }

  return "Low";
}

function includesAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term));
}

function buildFIRPriorityRationale(
  caseType: FIRPriorityAssessment["caseType"],
  severity: FIRPriorityAssessment["severity"]
) {
  return `Priority derived from ${caseType.toLowerCase()} classification and ${severity.toLowerCase()} severity indicators in the FIR content.`;
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildLocalAiReason(query: string, item: CaseResult) {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((token) => token.length > 2);
  const haystack = `${item.title} ${item.summary} ${item.tags.join(" ")} ${item.type} ${item.court}`.toLowerCase();
  const overlaps = tokens.filter((token) => haystack.includes(token)).slice(0, 3);
  const overlapText = overlaps.length > 0 ? `query terms (${overlaps.join(", ")})` : "legal context overlap";

  return `Matched because ${overlapText} aligns with ${item.type.toLowerCase()} issues in ${item.court}, supported by summary semantics and tag similarity.`;
}

function toQuerySpecificReason(query: string, item: CaseResult) {
  const current = `${item.whyMatch || ""}`.trim();
  if (!query.trim()) return current || "Matched on legal narrative similarity.";

  // Upgrade legacy static text to query-specific wording.
  if (!current || /^ai matched this case due to/i.test(current)) {
    return buildLocalAiReason(query, item);
  }

  return current;
}
