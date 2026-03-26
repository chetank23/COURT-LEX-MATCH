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

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const OPENAI_MODEL = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || "gpt-4o-mini";

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

  async _fetchJson<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(`${API_BASE}${url}`);
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
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
   * Fetch all legal cases
   * TODO: Integrate with backend API
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
   * Search for cases based on query
   * TODO: Integrate with backend AI search API
   */
  async searchCases(query: string): Promise<CaseResult[]> {
    const fromApi = (await this._fetchJson(`/api/cases/search?q=${encodeURIComponent(query)}`)) as CaseResult[] | null;
    if (fromApi && Array.isArray(fromApi)) {
      return fromApi;
    }

    const allCases = await this._loadCaseData();
    const q = query.toLowerCase().trim();
    if (!q) return allCases.slice(0, 20);

    const scored = allCases
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

    return scored;
  },

  /**
   * Get cases filtered by court and type
   * TODO: Integrate with backend filter API
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
   * Get a single case by ID
   * TODO: Integrate with backend API
   */
  async getCaseById(id: string): Promise<CaseResult | null> {
    const fromApi = (await this._fetchJson(`/api/cases/${encodeURIComponent(id)}`)) as CaseResult | null;
    if (fromApi) return fromApi;

    const allCases = await this._loadCaseData();
    return allCases.find((item) => item.id === id) || null;
  },

  /**
   * Get AI explanation for why a case matches the user query.
   *
   * NOTE: Browser-side API keys are only suitable for local demos.
   * In production, proxy this through your backend.
   */
  async explainCaseMatch(query: string, item: CaseResult): Promise<string> {
    const fromApi = (await this._fetchJson(
      `/api/cases/${encodeURIComponent(item.id)}/explain?q=${encodeURIComponent(query)}`
    )) as { explanation?: string } | null;
    if (fromApi?.explanation) return fromApi.explanation;

    if (OPENAI_API_KEY) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            temperature: 0.2,
            max_tokens: 140,
            messages: [
              {
                role: "system",
                content:
                  "You are a legal match explainer. Give exactly 1 concise reason (max 40 words) grounded in case metadata and query. Do not invent facts.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  query,
                  title: item.title,
                  type: item.type,
                  court: item.court,
                  summary: item.summary,
                  tags: item.tags,
                  baselineReason: item.whyMatch,
                }),
              },
            ],
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) return content;
        }
      } catch {
        // Fall through to deterministic local explanation.
      }
    }

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
   * TODO: Integrate with backend PDF analysis API
   */
  async analyzePDF(file: File): Promise<Section[]> {
    // Placeholder - replace with actual API call
    // const formData = new FormData();
    // formData.append('file', file);
    // return fetch('/api/analyze-pdf', { 
    //   method: 'POST',
    //   body: formData 
    // }).then(res => res.json());
    return [];
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
   * Get user activity history
   * TODO: Integrate with backend history API
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
   * Get analytics and insights
   * TODO: Integrate with backend analytics API
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
   * Save search query to history
   * TODO: Integrate with backend API
   */
  async saveSearch(query: string, results: number): Promise<void> {
    void query;
    void results;
    // Placeholder - replace with actual API call
    // return fetch('/api/history/search', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ query, results })
    // });
  },

  /**
   * Save PDF upload to history
   * TODO: Integrate with backend API
   */
  async savePDFUpload(
    filename: string,
    matchesFound: number
  ): Promise<void> {
    void filename;
    void matchesFound;
    // Placeholder - replace with actual API call
    // return fetch('/api/history/upload', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ filename, matchesFound })
    // });
  },

  /**
   * Judge Management
   * TODO: Integrate with backend API
   */
  async getJudges(): Promise<JudgeProfile[]> {
    // Placeholder - replace with actual API call
    // return fetch('/api/judges').then(r => r.json());
    return [];
  },

  async getJudgeById(judgeId: string): Promise<JudgeProfile | null> {
    void judgeId;
    // Placeholder - replace with actual API call
    // return fetch(`/api/judges/${judgeId}`).then(r => r.json());
    return null;
  },

  async addJudge(judge: JudgeProfile): Promise<JudgeProfile> {
    // Placeholder - replace with actual API call
    // return fetch('/api/judges', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(judge)
    // }).then(r => r.json());
    return judge;
  },

  async editJudge(judgeId: string, updates: Partial<JudgeProfile>): Promise<Partial<JudgeProfile>> {
    void judgeId;
    void updates;
    // Placeholder - replace with actual API call
    // return fetch(`/api/judges/${judgeId}`, {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(updates)
    // }).then(r => r.json());
    return updates;
  },

  async removeJudge(judgeId: string): Promise<void> {
    void judgeId;
    // Placeholder - replace with actual API call
    // return fetch(`/api/judges/${judgeId}`, { method: 'DELETE' });
  },

  /**
   * Hearing Schedule Management
   * TODO: Integrate with backend API
   */
  async getHearings(): Promise<HearingSchedule[]> {
    // Placeholder - replace with actual API call
    // return fetch('/api/hearings').then(r => r.json());
    return [];
  },

  async getHearingById(hearingId: string): Promise<HearingSchedule | null> {
    void hearingId;
    // Placeholder - replace with actual API call
    // return fetch(`/api/hearings/${hearingId}`).then(r => r.json());
    return null;
  },

  async addHearing(hearing: HearingSchedule): Promise<HearingSchedule> {
    // Placeholder - replace with actual API call
    // return fetch('/api/hearings', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(hearing)
    // }).then(r => r.json());
    return hearing;
  },

  async editHearing(hearingId: string, updates: Partial<HearingSchedule>): Promise<Partial<HearingSchedule>> {
    void hearingId;
    void updates;
    // Placeholder - replace with actual API call
    // return fetch(`/api/hearings/${hearingId}`, {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(updates)
    // }).then(r => r.json());
    return updates;
  },

  async removeHearing(hearingId: string): Promise<void> {
    void hearingId;
    // Placeholder - replace with actual API call
    // return fetch(`/api/hearings/${hearingId}`, { method: 'DELETE' });
  },

  async getHearingsByCaseId(caseId: string): Promise<HearingSchedule[]> {
    void caseId;
    // Placeholder - replace with actual API call
    // return fetch(`/api/hearings?caseId=${caseId}`).then(r => r.json());
    return [];
  },

  async getHearingsByJudgeId(judgeId: string): Promise<HearingSchedule[]> {
    void judgeId;
    // Placeholder - replace with actual API call
    // return fetch(`/api/hearings?judgeId=${judgeId}`).then(r => r.json());
    return [];
  },
};

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
  const parts = [];
  if (raw.issues) parts.push("matched on constitutional and statutory issues");
  if (raw.decision) parts.push("similar judicial outcome signals");
  if (raw.citation) parts.push("strong citation context");
  if (parts.length === 0) return "Matched on semantic relevance in legal narrative.";
  return `AI matched this case due to ${parts.join(", ")}.`;
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
