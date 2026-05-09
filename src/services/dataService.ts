import {
  CaseResult,
  TimelineEvent,
  Section,
  InsightsData,
  FIRPriorityAssessment,
  FIRJudgeAssignment,
  JudgeProfile,
  HearingSchedule,
  RagQueryResponse,
  JudgeRecommendation,
  CaseAnalysisReport,
} from "@/types";
import { AlertTriangle, FileText, Gavel, Layers, Scale } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";
const MAX_PDF_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOCAL_HISTORY_KEY = "courtcaseai.activity.history.v1";

const FIR_JUDGE_ROSTER: Record<"Criminal" | "Civil" | "Other", string[]> = {
  Criminal: ["Justice N. Rao", "Justice P. Mehta", "Justice S. Khan"],
  Civil: ["Justice R. Iyer", "Justice K. Banerjee", "Justice V. Sen"],
  Other: ["Justice A. Menon", "Justice D. Kapoor", "Justice T. Joseph"],
};

const DEFAULT_JUDGE_COURTS: Record<
  "Criminal" | "Civil" | "Other",
  "Supreme Court" | "High Court" | "District Court"
> = {
  Criminal: "High Court",
  Civil: "High Court",
  Other: "District Court",
};

type JudgeCandidate = {
  id?: string;
  name: string;
  category: "Criminal" | "Civil" | "Other";
  courtLevel: "Supreme Court" | "High Court" | "District Court";
  yearsOfExperience: number;
  caseLoadCapacity: number;
  currentCaseLoad: number;
  availability: "Available" | "Busy" | "On Leave";
  district?: string;
  state?: string;
  area?: string;
  courtName?: string;
  specializations?: (
    | "Criminal"
    | "Civil"
    | "Constitutional"
    | "Commercial"
    | "Labor"
    | "Revenue"
  )[];
};

/**
 * Data Service Layer
 *
 * This service is structured for API integration.
 * Replace these functions with actual API calls when backend is ready.
 */

export const dataService = {
  _caseCache: null as CaseResult[] | null,

  _getLocalHistory(): TimelineEvent[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.type === "string" &&
            typeof item.title === "string" &&
            typeof item.date === "string",
        )
        .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
    } catch {
      return [];
    }
  },

  _setLocalHistory(events: TimelineEvent[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LOCAL_HISTORY_KEY,
        JSON.stringify(events.slice(0, 100)),
      );
    } catch {
      // Ignore local persistence failures and keep app flow intact.
    }
  },

  _appendLocalHistory(input: {
    type: TimelineEvent["type"];
    title: string;
    results?: number;
  }): void {
    if (!input.title.trim()) return;
    const current = this._getLocalHistory();
    const event: TimelineEvent = {
      id: `hist-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: input.type,
      title: input.title,
      date: new Date().toISOString(),
      ...(typeof input.results === "number" ? { results: input.results } : {}),
    };
    this._setLocalHistory([event, ...current]);
  },

  async _requestJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
      // Propagate 4xx errors (e.g., 409 Conflict) as thrown exceptions
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          try {
            const errBody = await response.json();
            const msg =
              errBody?.error ||
              errBody?.message ||
              `Request failed with status ${response.status}`;
            throw new Error(msg);
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            throw parseErr;
          }
        }
        return null;
      }
      if (response.status === 204) return null;
      return (await response.json()) as T;
    } catch (err) {
      // Re-throw intentional errors (4xx), swallow network/5xx failures
      if (
        err instanceof Error &&
        !err.message.startsWith("Failed to fetch") &&
        !err.message.startsWith("NetworkError")
      ) {
        throw err;
      }
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
      const citedCasesRaw = extractSegment(raw.full_text, "Cited Cases:");
      const citedNames = extractCitedCaseNames(citedCasesRaw);
      const judgesRaw = extractSegment(raw.full_text, "Judges:");
      const rawJudgment = extractJudgmentText(
        raw.full_text,
        decision,
        raw.summary,
      );
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

    return this._caseCache;
  },

  async getCases(): Promise<CaseResult[]> {
    const fromApi = (await this._fetchJson("/api/cases")) as
      | CaseResult[]
      | null;
    if (fromApi && Array.isArray(fromApi)) {
      return fromApi;
    }

    const allCases = await this._loadCaseData();
    return allCases
      .slice()
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  },

  async searchCases(query: string): Promise<CaseResult[]> {
    const fromApi = (await this._fetchJson(
      `/api/cases/search?q=${encodeURIComponent(query)}`,
    )) as CaseResult[] | { results?: CaseResult[] } | null;

    const apiResults = Array.isArray(fromApi)
      ? fromApi
      : Array.isArray(fromApi?.results)
        ? fromApi.results
        : null;

    if (apiResults) {
      const mapped = apiResults.map((item) => {
        const mappedJudgement =
          item.judgement ||
          item.judgment ||
          item.finalVerdict ||
          item.final_verdict ||
          "Judgement unavailable";
        // Sanitize all display text coming from the API
        const cleanSummary = sanitizeDisplayText(item.summary || "");
        const cleanJudgment = sanitizeDisplayText(item.judgment || mappedJudgement);
        // Use server-generated judgmentNarrative if present, else fall back to
        // a client-side humanized judgment string.
        const cleanJudgmentNarrative = item.judgmentNarrative
          ? sanitizeDisplayText(item.judgmentNarrative)
          : cleanJudgment || mappedJudgement;
        return {
          ...item,
          matchLevel:
            item.matchLevel || getMatchLevel((item.similarity || 0) / 100),
          summary: cleanSummary || "This case involves a legal dispute reviewed by the court.",
          judgement: mappedJudgement,
          judgment: cleanJudgment || mappedJudgement,
          judgmentNarrative: cleanJudgmentNarrative,
          finalVerdict: item.finalVerdict || mappedJudgement,
          final_verdict: item.final_verdict || mappedJudgement,
          whyMatch:
            item.whyMatched ||
            item.whyMatch ||
            humanizeQueryMatch(query, item),
          whyMatched: item.whyMatched || item.whyMatch,
          matchedTerms: item.matchedTerms || item.tags || [],
          tags: item.tags || [],
        };
      });
      if (query.trim()) {
        void this.saveSearch(query, mapped.length);
      }
      return mapped;
    }

    const allCases = await this._loadCaseData();
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

    if (q) {
      void this.saveSearch(query, scored.length);
    }
    return scored;
  },

  async getFilteredCases(court?: string, type?: string): Promise<CaseResult[]> {
    const params = new URLSearchParams();
    if (court && court !== "All Courts") params.set("court", court);
    if (type && type !== "All Types") params.set("type", type);
    const fromApi = (await this._fetchJson(
      `/api/cases?${params.toString()}`,
    )) as CaseResult[] | null;
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

  async getCaseById(id: string): Promise<CaseResult | null> {
    const fromApi = (await this._fetchJson(
      `/api/cases/${encodeURIComponent(id)}`,
    )) as CaseResult | null;
    if (fromApi) return fromApi;

    const allCases = await this._loadCaseData();
    return allCases.find((item) => item.id === id) || null;
  },

  async explainCaseMatch(query: string, item: CaseResult): Promise<string> {
    const fromApi = (await this._fetchJson(
      `/api/cases/${encodeURIComponent(item.id)}/explain?q=${encodeURIComponent(query)}`,
    )) as { explanation?: string } | null;
    if (fromApi?.explanation) return fromApi.explanation;

    return buildLocalAiReason(query, item);
  },

  async explainMatches(
    query: string,
    items: CaseResult[],
  ): Promise<Record<string, string>> {
    const topItems = items.slice(0, 30);
    const reasons = await Promise.all(
      topItems.map(async (item) => ({
        id: item.id,
        reason: await this.explainCaseMatch(query, item),
      })),
    );

    return reasons.reduce<Record<string, string>>((acc, current) => {
      acc[current.id] = current.reason;
      return acc;
    }, {});
  },

  async generateHumanizedCaseNarrative(item: CaseResult): Promise<string> {
    const fromApi = (await this._fetchJson(
      `/api/cases/${encodeURIComponent(item.id)}/humanize`,
    )) as { narrative?: string } | null;
    if (fromApi?.narrative) return fromApi.narrative;

    return buildLocalHumanizedNarrative(item);
  },

  async queryRag(query: string, topK = 8): Promise<RagQueryResponse> {
    const payload = (await this._requestJson("/api/rag/query", {
      method: "POST",
      body: JSON.stringify({ query, topK }),
    })) as RagQueryResponse | null;

    if (payload) return payload;

    throw new Error(
      "Backend server not running. Start with: npm run dev:server",
    );
  },

  async analyzePDF(file: File): Promise<Section[]> {
    const contentBase64 = await fileToBase64(file);
    if (!contentBase64) {
      throw new Error(
        "Failed to convert PDF to base64. File might be empty or corrupted.",
      );
    }

    const fromApi = (await this._requestJson("/api/analyze-pdf", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        contentBase64,
      }),
    })) as {
      sections?: Array<Omit<Section, "icon"> & { icon?: string }>;
    } | null;

    if (
      fromApi?.sections &&
      Array.isArray(fromApi.sections) &&
      fromApi.sections.length > 0
    ) {
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

  async assessFIRPriority(
    file: File,
    sections: Section[],
  ): Promise<FIRPriorityAssessment> {
    const combinedText = buildFIRText(file.name, sections);
    const fromApi = (await this._requestJson("/api/fir/assess-priority", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        sections,
        extractedText: combinedText,
      }),
    })) as FIRPriorityAssessment | null;
    if (fromApi) return fromApi;

    const signals = assessFIRSignals(combinedText);
    const score = computeRoutingPriority(signals);

    return {
      caseType: signals.caseType,
      severity: signals.severity,
      bailRiskScore: signals.bailRiskScore,
      escapeRiskScore: signals.escapeRiskScore,
      riskScore: signals.riskScore,
      riskFactors: signals.riskFactors,
      priorityScore: score,
      priorityBand: toPriorityBand(score),
      rationale: buildFIRPriorityRationale(signals),
    };
  },

  async assignJudgeForFIR(
    file: File,
    assessment: FIRPriorityAssessment,
    sections: Section[],
  ): Promise<FIRJudgeAssignment> {
    const fromApi = (await this._requestJson("/api/fir/assign-judge", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        assessment,
        sections,
        extractedText: buildFIRText(file.name, sections),
      }),
    })) as FIRJudgeAssignment | null;
    if (fromApi) return fromApi;

    const category = toJudgeCategory(assessment.caseType);
    const candidateJudges = await this.getJudges();
    const judges =
      candidateJudges.length > 0
        ? candidateJudges
        : buildFallbackJudges(category);
    const ranking = rankJudgesForAssessment(
      assessment,
      judges,
      file.name,
      sections,
    );
    const chosen = ranking[0] || null;
    const availableJudges = ranking.map((item) => item.judgeName);
    const requiresPublicProsecutor = category === "Criminal";

    return {
      category,
      assignedJudgeId: chosen?.judgeId,
      assignedJudge: chosen?.judgeName || FIR_JUDGE_ROSTER[category][0],
      availableJudges,
      judgeRankings: ranking,
      assignmentReason:
        chosen?.reason ||
        "Assigned using fallback roster because no ranked judge recommendation was available.",
      routeMode: "fallback",
      partyLabel: requiresPublicProsecutor ? "Accused" : "Defendant",
      requiresPublicProsecutor,
    };
  },

  async recommendJudgeForCase(caseItem: {
    id?: string;
    title: string;
    summary?: string;
    type?: string;
    court?: string;
    priorityScore?: number;
    priorityBand?: string;
  }): Promise<FIRJudgeAssignment> {
    const rawText = [
      caseItem.title,
      caseItem.summary || "",
      caseItem.type || "",
      caseItem.court || "",
    ].join(" ");
    const signals = assessFIRSignals(rawText);
    const computedPriority = computeRoutingPriority(signals);
    const priorityScore =
      caseItem.priorityScore && Number.isFinite(caseItem.priorityScore)
        ? Math.max(computedPriority, caseItem.priorityScore)
        : computedPriority;
    const assessment: FIRPriorityAssessment = {
      ...signals,
      priorityScore,
      priorityBand: toPriorityBand(priorityScore),
      rationale: buildFIRPriorityRationale(signals),
    };

    const judges = await this.getJudges();
    const roster =
      judges.length > 0
        ? judges
        : buildFallbackJudges(toJudgeCategory(assessment.caseType));
    const ranking = rankJudgesForAssessment(
      assessment,
      roster,
      caseItem.title,
      [],
    );
    const selected = ranking[0] || null;
    const category = toJudgeCategory(assessment.caseType);

    return {
      category,
      assignedJudgeId: selected?.judgeId,
      assignedJudge: selected?.judgeName || FIR_JUDGE_ROSTER[category][0],
      availableJudges: ranking.map((item) => item.judgeName),
      judgeRankings: ranking,
      assignmentReason:
        selected?.reason || "Assigned using case metadata fallback.",
      routeMode: "auto",
      partyLabel: category === "Criminal" ? "Accused" : "Defendant",
      requiresPublicProsecutor: category === "Criminal",
    };
  },

  assessCaseRouting(caseItem: {
    title: string;
    summary?: string;
    typeHint?: FIRPriorityAssessment["caseType"];
    priorityScoreHint?: number;
  }): FIRPriorityAssessment {
    const rawText = [
      caseItem.title,
      caseItem.summary || "",
      caseItem.typeHint || "",
    ].join(" ");
    const signals = caseItem.typeHint
      ? assessRoutingSignals(rawText, caseItem.typeHint)
      : assessFIRSignals(rawText);
    const computed = computeRoutingPriority(signals);
    const priorityScore =
      caseItem.priorityScoreHint && Number.isFinite(caseItem.priorityScoreHint)
        ? Math.max(computed, caseItem.priorityScoreHint)
        : computed;
    return {
      ...signals,
      priorityScore,
      priorityBand: toPriorityBand(priorityScore),
      rationale: buildFIRPriorityRationale(signals),
    };
  },

  async getActivityHistory(): Promise<TimelineEvent[]> {
    const fromApi = (await this._fetchJson("/api/history")) as
      | TimelineEvent[]
      | null;
    if (fromApi && Array.isArray(fromApi) && fromApi.length > 0) {
      return fromApi;
    }
    return this._getLocalHistory();
  },

  async getInsights(): Promise<InsightsData> {
    const fromApi = (await this._fetchJson(
      "/api/insights",
    )) as InsightsData | null;
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

    const monthlySearches = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(
      (month, i) => ({
        month,
        searches: 120 + i * 45 + Math.round((allCases.length / 5127) * 60),
      }),
    );

    return {
      similarityDistribution,
      caseClusters,
      trendingTopics,
      monthlySearches,
    };
  },

  async saveSearch(query: string, results: number): Promise<void> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    const response = await this._requestJson("/api/history/search", {
      method: "POST",
      body: JSON.stringify({ query: normalizedQuery, results }),
    });

    if (!response) {
      this._appendLocalHistory({
        type: "search",
        title: normalizedQuery,
        results: Number.isFinite(results) ? Math.max(0, results) : 0,
      });
    }
  },

  async savePDFUpload(filename: string, matchesFound: number): Promise<void> {
    const normalizedFilename = filename.trim();
    if (!normalizedFilename) return;

    const response = await this._requestJson("/api/history/upload", {
      method: "POST",
      body: JSON.stringify({ filename: normalizedFilename, matchesFound }),
    });

    if (!response) {
      this._appendLocalHistory({
        type: "upload",
        title: normalizedFilename,
        results: Number.isFinite(matchesFound) ? Math.max(0, matchesFound) : 0,
      });
    }
  },

  async saveViewedCase(caseId: string, caseTitle: string): Promise<void> {
    const normalizedTitle = caseTitle.trim();
    if (!normalizedTitle) return;

    const response = await this._requestJson("/api/history/view", {
      method: "POST",
      body: JSON.stringify({ caseId, caseTitle }),
    });

    if (!response) {
      this._appendLocalHistory({
        type: "view",
        title: normalizedTitle,
      });
    }
  },

  async getJudges(): Promise<JudgeProfile[]> {
    const fromApi = (await this._fetchJson("/api/judges")) as
      | JudgeProfile[]
      | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },

  async getJudgeById(judgeId: string): Promise<JudgeProfile | null> {
    return (await this._fetchJson(
      `/api/judges/${encodeURIComponent(judgeId)}`,
    )) as JudgeProfile | null;
  },

  async addJudge(judge: JudgeProfile): Promise<JudgeProfile> {
    const fromApi = (await this._requestJson("/api/judges", {
      method: "POST",
      body: JSON.stringify(judge),
    })) as JudgeProfile | null;
    if (fromApi) return fromApi;
    return judge;
  },

  async editJudge(
    judgeId: string,
    updates: Partial<JudgeProfile>,
  ): Promise<Partial<JudgeProfile>> {
    const fromApi = (await this._requestJson(
      `/api/judges/${encodeURIComponent(judgeId)}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
    )) as Partial<JudgeProfile> | null;
    if (fromApi) return fromApi;
    return updates;
  },

  async removeJudge(judgeId: string): Promise<void> {
    await this._requestJson(`/api/judges/${encodeURIComponent(judgeId)}`, {
      method: "DELETE",
    });
  },

  async getAvailableJudgesByArea(input: {
    district: string;
    caseType?: "Criminal" | "Civil" | "Other";
    date?: string;
    onlyAvailable?: boolean;
  }): Promise<JudgeProfile[]> {
    const allJudges = await this.getJudges();
    const hearings = await this.getHearings();

    let filtered = allJudges.filter((judge) => {
      const districtMatch =
        !input.district ||
        !judge.district ||
        judge.district.toLowerCase().includes(input.district.toLowerCase());
      const caseTypeMatch =
        !input.caseType ||
        judge.category === input.caseType ||
        (judge.specializations?.includes(input.caseType) ?? false);
      const availabilityMatch =
        !input.onlyAvailable || judge.availability === "Available";
      return districtMatch && caseTypeMatch && availabilityMatch;
    });

    if (input.date) {
      filtered = filtered.map((judge) => {
        const hearingsOnDate = hearings.filter(
          (h) => h.assignedJudgeId === judge.id && h.hearingDate === input.date,
        );
        return {
          ...judge,
          scheduledHearingDates: hearingsOnDate.map((h) => h.hearingDate),
        };
      });
    }

    return filtered.sort((a, b) => {
      const availOrder = { Available: 0, Busy: 1, "On Leave": 2 };
      const availDiff =
        (availOrder[a.availability] ?? 3) - (availOrder[b.availability] ?? 3);
      if (availDiff !== 0) return availDiff;
      const loadDiff = a.currentCaseLoad - b.currentCaseLoad;
      if (loadDiff !== 0) return loadDiff;
      return b.yearsOfExperience - a.yearsOfExperience;
    });
  },

  async getJudgeAvailabilityStatus(judgeId: string): Promise<{
    judgeId: string;
    judgeName: string;
    availability: "Available" | "Busy" | "On Leave";
    currentCaseLoad: number;
    caseLoadCapacity: number;
    utilizationPercent: number;
    isFree: boolean;
    specializations: string[];
    upcomingHearings: HearingSchedule[];
  } | null> {
    const judge = await this.getJudgeById(judgeId);
    if (!judge) return null;

    const hearings = await this.getHearingsByJudgeId(judgeId);
    const utilization =
      judge.caseLoadCapacity > 0
        ? (judge.currentCaseLoad / judge.caseLoadCapacity) * 100
        : 0;
    const isFree =
      judge.availability === "Available" &&
      judge.currentCaseLoad < judge.caseLoadCapacity * 0.8;

    return {
      judgeId: judge.id,
      judgeName: judge.name,
      availability: judge.availability,
      currentCaseLoad: judge.currentCaseLoad,
      caseLoadCapacity: judge.caseLoadCapacity,
      utilizationPercent: Math.round(utilization),
      isFree,
      specializations: judge.specializations || [],
      upcomingHearings: hearings.slice(0, 5),
    };
  },

  async getJudgesCountByArea(district: string): Promise<{
    total: number;
    available: number;
    busy: number;
    onLeave: number;
    byCaseType: Record<string, number>;
  }> {
    const allJudges = await this.getJudges();
    const filteredJudges = allJudges.filter(
      (j) =>
        !district ||
        !j.district ||
        j.district.toLowerCase().includes(district.toLowerCase()),
    );

    const counts = {
      total: filteredJudges.length,
      available: filteredJudges.filter((j) => j.availability === "Available")
        .length,
      busy: filteredJudges.filter((j) => j.availability === "Busy").length,
      onLeave: filteredJudges.filter((j) => j.availability === "On Leave")
        .length,
      byCaseType: {} as Record<string, number>,
    };

    filteredJudges.forEach((j) => {
      counts.byCaseType[j.category] = (counts.byCaseType[j.category] || 0) + 1;
    });

    return counts;
  },

  async getHearings(filters?: {
    caseId?: string;
    judgeId?: string;
  }): Promise<HearingSchedule[]> {
    const params = new URLSearchParams();
    if (filters?.caseId) params.set("caseId", filters.caseId);
    if (filters?.judgeId) params.set("judgeId", filters.judgeId);
    const fromApi = (await this._fetchJson(
      `/api/hearings?${params.toString()}`,
    )) as HearingSchedule[] | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },

  async getAllHearings() {
    return this.getHearings();
  },

  async getHearingsByJudgeId(judgeId: string): Promise<HearingSchedule[]> {
    return this.getHearings({ judgeId });
  },

  async scheduleHearing(hearing: HearingSchedule): Promise<HearingSchedule> {
    // _requestJson will throw on 4xx (e.g., 409 Conflict) — let it propagate
    const fromApi = (await this._requestJson("/api/hearings", {
      method: "POST",
      body: JSON.stringify(hearing),
    })) as HearingSchedule | null;
    // null means server was unreachable (5xx / network error) — fall back silently
    if (fromApi) return fromApi;
    return hearing;
  },

  async addHearing(h: HearingSchedule) {
    return this.scheduleHearing(h);
  },
  async createHearing(h: HearingSchedule) {
    return this.scheduleHearing(h);
  },

  async updateHearing(
    hearingId: string,
    updates: Partial<HearingSchedule>,
  ): Promise<Partial<HearingSchedule>> {
    const fromApi = (await this._requestJson(
      `/api/hearings/${encodeURIComponent(hearingId)}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
    )) as Partial<HearingSchedule> | null;
    if (fromApi) return fromApi;
    return updates;
  },

  async editHearing(id: string, u: Partial<HearingSchedule>) {
    return this.updateHearing(id, u);
  },

  async cancelHearing(hearingId: string): Promise<void> {
    await this._requestJson(`/api/hearings/${encodeURIComponent(hearingId)}`, {
      method: "DELETE",
    });
  },

  async removeHearing(id: string) {
    return this.cancelHearing(id);
  },
  async deleteHearing(id: string) {
    return this.cancelHearing(id);
  },

  async analyzeCaseContext(context: string): Promise<CaseAnalysisReport> {
    const fromApi = (await this._requestJson("/api/case-analysis", {
      method: "POST",
      body: JSON.stringify({ context }),
    })) as CaseAnalysisReport | null;

    if (fromApi) return fromApi;

    throw new Error(
      "Backend server not running. Start with: npm run dev:server",
    );
  },

  async scheduleHearingForAssignment(input: {
    caseId: string;
    caseTitle: string;
    assignedJudgeId: string;
    assignedJudgeName: string;
    localCourtName: string;
    courtRoom: string;
    state: string;
    district: string;
    hearingDate: string;
    hearingTime: string;
    notes?: string;
  }): Promise<HearingSchedule> {
    // ── Client-side conflict pre-check ────────────────────────────────────────
    // Normalize time to "HH:MM" for comparison (strip any trailing seconds)
    const normalizeTime = (t: string) => `${t || ""}`.trim().slice(0, 5);
    const slotTime = normalizeTime(input.hearingTime);

    // Fetch all hearings already assigned to this judge
    const existingHearings = await this.getHearingsByJudgeId(
      input.assignedJudgeId,
    );
    const conflict = existingHearings.find(
      (h) =>
        h.hearingDate === input.hearingDate &&
        normalizeTime(h.hearingTime) === slotTime,
    );

    if (conflict) {
      throw new Error(
        `Scheduling conflict: ${input.assignedJudgeName} already has a hearing on ` +
          `${input.hearingDate} at ${slotTime} (Case: "${conflict.caseTitle}"). ` +
          `Please choose a different time or date.`,
      );
    }

    const hearing: HearingSchedule = {
      id: `hearing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...input,
      status: "Scheduled",
      notes: input.notes || "",
    };
    return this.scheduleHearing(hearing);
  },
};

function extractSegment(text: string, label: string): string {
  const source = text || "";
  const start = source.indexOf(label);
  if (start < 0) return "";
  const after = source.slice(start + label.length);
  const endIndex = after.indexOf("\n");
  return (endIndex >= 0 ? after.slice(0, endIndex) : after).trim();
}

/** Extract case names from raw cited-cases dict string like "{'case v. case': 1.0, ...}" */
function extractCitedCaseNames(raw: string): string[] {
  if (!raw) return [];
  const names: string[] = [];
  const regex = /['"]([^'"]{4,})['"]\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    const name = m[1].trim();
    // Skip numeric-only or very short fragments
    if (name && !/^[\d.]+$/.test(name) && name.length > 5) {
      names.push(humanizeTitle(name));
    }
  }
  return names.slice(0, 5);
}

/** Parse "Article 14 in The Constitution Of India 1949 ; Section 153 ..." into clean list */
function parseIssueList(rawIssues: string): string[] {
  if (!rawIssues) return [];
  return rawIssues
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .map((s) => {
      // Clean up "Article 14 in The Constitution Of India 1949" → "Article 14, Constitution of India (1949)"
      const articleMatch = s.match(
        /^((?:Article|Section|Rule|Order|Schedule)\s+\d+[A-Za-z]?)\s+in\s+(?:The\s+)?(.+?)\s*,?\s*(\d{4})?$/i,
      );
      if (articleMatch) {
        const [, provision, act, year] = articleMatch;
        const cleanAct = act.replace(/\s+/g, " ").trim();
        return year
          ? `${provision}, ${cleanAct} (${year})`
          : `${provision}, ${cleanAct}`;
      }
      return s.replace(/\s+/g, " ");
    });
}

/** Convert a raw title string into proper title case */
function humanizeTitle(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/\.\.\.$/, "")
    .trim();
  if (!cleaned) return "Untitled Case";
  // Proper title case for each word, preserve legal abbreviations
  return cleaned
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      // Preserve common legal abbreviations
      if (["vs", "v.", "v", "&"].includes(lower)) return lower === "vs" ? "vs" : lower;
      if (["of", "the", "in", "and", "or", "for", "to", "by", "on", "at", "an", "ors", "ors.", "anr", "anr."].includes(lower))
        return lower;
      if (/^[A-Z]{2,}$/.test(word)) return word; // Preserve acronyms like IPC, AIR
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ")
    // Capitalize first word always
    .replace(/^./, (c) => c.toUpperCase());
}

/** Build a clean, human-readable summary from structured case data */
function humanizeSummary(input: {
  title: string;
  court: string;
  year: number;
  issues: string[];
  verdict: string;
  judges: string;
  caseType: string;
}): string {
  const parts: string[] = [];

  // Opening sentence
  parts.push(
    `This ${input.caseType || "legal"} matter was heard by the ${input.court} in ${input.year}.`,
  );

  // Judge info
  if (input.judges && input.judges.length > 2) {
    const judgeNames = input.judges
      .split(",")
      .map((j) => j.trim())
      .filter(Boolean);
    if (judgeNames.length === 1) {
      parts.push(`The case was presided over by ${judgeNames[0]}.`);
    } else if (judgeNames.length > 1) {
      parts.push(
        `The bench comprised ${judgeNames.slice(0, -1).join(", ")} and ${judgeNames[judgeNames.length - 1]}.`,
      );
    }
  }

  // Issues
  if (input.issues.length > 0) {
    const displayIssues = input.issues.slice(0, 3);
    parts.push(
      `The key legal provisions under consideration were ${displayIssues.join("; ")}.`,
    );
  }

  // Verdict
  if (input.verdict && input.verdict !== "Unknown") {
    parts.push(`The court's final verdict was: ${input.verdict}.`);
  }

  return parts.join(" ");
}

/** Build clean judgment text from structured data */
function humanizeJudgment(input: {
  title: string;
  verdict: string;
  issues: string[];
  citedCases: string[];
}): string {
  const parts: string[] = [];

  if (input.verdict && input.verdict !== "Unknown") {
    parts.push(
      `The court pronounced a verdict of "${input.verdict}" in this matter.`,
    );
  } else {
    parts.push("The court examined the facts and arguments presented by all parties.");
  }

  if (input.issues.length > 0) {
    parts.push(
      `The judgment addressed ${input.issues.length > 1 ? "multiple legal provisions" : "the legal provision"} including ${input.issues.slice(0, 2).join(" and ")}.`,
    );
  }

  if (input.citedCases.length > 0) {
    const cited = input.citedCases.slice(0, 3);
    parts.push(
      `The court relied on ${cited.length} precedent${cited.length > 1 ? "s" : ""} including ${cited.join(", ")}.`,
    );
  }

  return parts.join(" ");
}

/** Build a clean, human-readable "Why This Match" explanation */
function humanizeWhyMatch(input: {
  title: string;
  citation: string;
  issues: string[];
  caseType: string;
  citedCases: string[];
}): string {
  const reasons: string[] = [];

  if (input.issues.length > 0) {
    reasons.push(
      `shared legal provisions (${input.issues.slice(0, 2).join(", ")})`,
    );
  }
  if (input.caseType) {
    reasons.push(`comparable ${input.caseType.toLowerCase()} case context`);
  }
  if (input.citedCases.length > 0) {
    reasons.push(`overlapping precedent citations`);
  }
  if (input.citation) {
    reasons.push(`aligned judgement outcomes`);
  }

  if (reasons.length === 0) {
    return "This case matches due to similar legal themes, statutory context, and aligned judgment outcomes.";
  }

  return `This case matches due to ${reasons.join(", ")}.`;
}

/** Build a humanized reason for query-specific match results */
function humanizeQueryMatch(query: string, item: CaseResult): string {
  const lowerQuery = query.toLowerCase();
  const matchedTags = item.tags.filter((tag) =>
    lowerQuery.includes(tag.toLowerCase()),
  );

  const reasons: string[] = [];

  if (matchedTags.length > 0) {
    reasons.push(`relevant topic areas (${matchedTags.join(", ")})`);
  }
  if (item.type) {
    reasons.push(`${item.type.toLowerCase()} case classification`);
  }

  // Extract meaningful query keywords matched in title/summary
  const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 3);
  const titleLower = item.title.toLowerCase();
  const titleHits = queryWords.filter((w) => titleLower.includes(w));
  if (titleHits.length > 0) {
    reasons.push(
      `shared legal terms (${titleHits.slice(0, 3).join(", ")})`,
    );
  }

  if (item.finalVerdict && item.finalVerdict !== "Unknown") {
    reasons.push(`a "${item.finalVerdict}" verdict outcome`);
  }

  if (reasons.length === 0) {
    return `This case matches your query based on strong similarity in legal themes and statutory context.`;
  }

  return `This case matches your query based on ${reasons.join(", ")}.`;
}

function extractJudgmentText(
  fullText: string,
  decisionSegment: string,
  summary: string,
): string {
  // This is now only used for verdict extraction; actual display text
  // is generated by humanizeJudgment()
  const fromDecision = normalizeText(decisionSegment);
  if (fromDecision && fromDecision.length > 2) {
    return fromDecision.slice(0, 320);
  }

  const source = normalizeText(fullText);
  if (!source) {
    return normalizeText(summary) || "Judgment text unavailable.";
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

function normalizeText(text: string): string {
  return `${text || ""}`.split("\u0000").join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Safety-net sanitizer: strips raw metadata artifacts from any text
 * that will be displayed in the UI. Catches anything the server
 * or local pipeline missed.
 */
function sanitizeDisplayText(text: string): string {
  if (!text) return "";
  let cleaned = text
    // Remove Cited Cases dict blocks:  { 'case v case': 1.0, ... }
    .replace(/Cited\s+Cases\s*:\s*\{[^}]*\}?/gi, "")
    .replace(/\bCited\s+Cases\s*:/gi, "")
    // Remove Decision: 0 / Decision: 1
    .replace(/\bDecision\s*:\s*[01](?:\.0)?\b/gi, "")
    // Remove Judges: ... lines
    .replace(/\bJudges?\s*:\s*[^.;\n]*/gi, "")
    // Remove Issues: label (keep content)
    .replace(/\bIssues?\s*:\s*/gi, "")
    // Remove filter: labels
    .replace(/\bfilter\s*:\s*[^;.]*/gi, "")
    // Remove raw score values  ': 1.0'  ': 0.8'
    .replace(/'\s*:\s*\d+\.?\d*/g, "")
    // Remove dict/array brackets and orphan quotes
    .replace(/[{}[\]]/g, "")
    .replace(/'\s*,\s*'/g, ", ")
    // Remove c-d] style fragments
    .replace(/\bc-\w?\]/gi, "")
    // Collapse whitespace
    .replace(/\s{2,}/g, " ")
    .trim();

  // If after cleaning we have less than 20 chars, it was all metadata
  if (cleaned.length < 20) {
    return "";
  }
  return cleaned;
}

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
] as const;

function extractFinalVerdict(judgmentText: string): string {
  const normalized = normalizeText(judgmentText);
  if (!normalized) return "Unknown";

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

function computePriority(raw: {
  title: string;
  citation: string;
  decision_date: string;
  issues: string;
  decision: string;
}): number {
  const text = `${raw.issues} ${raw.decision} ${raw.title}`.toLowerCase();

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
    Math.min(40, (raw.citation.match(/AIR|SCC|SCR|CriLJ/gi) || []).length * 8);
  const complianceRisk = keywordScore(
    text,
    ["tax", "regulation", "penalty", "violation", "compliance"],
    100,
  );

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

  const year = Number.parseInt(raw.decision_date?.slice(0, 4) || "0", 10);
  const recencyBoost = year > 2000 ? (year - 2000) * 0.15 : 0;

  return Math.max(
    20,
    Math.min(99, Math.round(weighted + recencyBoost + severityBoost)),
  );
}

function toPriorityBand(score: number): FIRPriorityAssessment["priorityBand"] {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

function computeSimilarity(raw: {
  title: string;
  citation: string;
  issues: string;
  decision: string;
}): number {
  let score = 55;
  score += Math.min(20, Math.round(raw.issues.length / 50));
  score += Math.min(10, Math.round(raw.decision.length / 40));
  score += Math.min(8, raw.citation.split(",").filter(Boolean).length * 2);
  if (raw.title.length > 30) score += 4;
  return Math.max(45, Math.min(98, score));
}

function keywordScore(text: string, terms: string[], maxScore: number): number {
  const hits = terms.reduce(
    (acc, term) => (text.includes(term) ? acc + 1 : acc),
    0,
  );
  return Math.min(maxScore, Math.round((hits / terms.length) * maxScore));
}

function buildTags(raw: {
  citation: string;
  jurisdiction: string;
  issues: string;
}): string[] {
  const tags = new Set<string>();
  tags.add(raw.jurisdiction || "India");
  if (raw.citation) tags.add("Cited");
  const issues = raw.issues.toLowerCase();
  if (issues.includes("article 14")) tags.add("Equality");
  if (issues.includes("article 21")) tags.add("Life & Liberty");
  if (issues.includes("tax")) tags.add("Tax");
  if (issues.includes("criminal")) tags.add("Criminal");
  if (issues.includes("service")) tags.add("Service Law");
  if (tags.size < 2) tags.add("General");
  return Array.from(tags).slice(0, 4);
}

// Legacy deriveWhyMatch is replaced by humanizeWhyMatch above.
// Kept as a no-op fallback in case any codepath still references it.
function deriveWhyMatch(_raw: {
  citation: string;
  issues: string;
  decision: string;
}): string {
  return "Matched on legal narrative similarity from title and summary context.";
}

function getMatchLevel(score: number): CaseResult["matchLevel"] {
  if (score >= 0.85) return "High";
  if (score >= 0.6) return "Medium";
  return "Low";
}

function buildLocalAiReason(query: string, item: CaseResult): string {
  return humanizeQueryMatch(query, item);
}

function buildLocalHumanizedNarrative(item: CaseResult): string {
  const title = item.title.trim();
  const court = item.court.trim();
  const year = item.year;
  const summary = item.summary.trim();
  const verdict = item.finalVerdict || item.judgment || "";

  const intro = `${title} was heard in ${court} in ${year}.`;
  const facts = summary
    ? `In simple terms, the dispute was about ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`
    : "In simple terms, the court examined the core facts, legal rights, and applicable rules.";
  const outcome = verdict
    ? `The final outcome was: ${verdict}.`
    : "The court issued a final ruling after reviewing arguments from all sides.";

  return `${intro} ${facts} ${outcome}`.replace(/\s+/g, " ").trim();
}

function fileToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => resolve(null);
  });
}

function sectionIconFromName(name?: string) {
  switch (name) {
    case "FileText":
      return FileText;
    case "AlertTriangle":
      return AlertTriangle;
    case "Scale":
      return Scale;
    case "Gavel":
      return Gavel;
    case "Layers":
      return Layers;
    default:
      return FileText;
  }
}

function buildFIRText(filename: string, sections: Section[]): string {
  const sectionText = sections
    .map(
      (s) => `${s.title} ${s.summary} ${s.content} ${s.highlights.join(" ")}`,
    )
    .join(" ");
  return `${filename} ${sectionText}`.trim();
}

function buildFallbackSections(filename: string): Section[] {
  return [
    {
      id: "sec-facts",
      title: "Facts",
      icon: FileText,
      content: `Extracted narrative from ${filename}. Detailed factual analysis was unavailable due to document parsing constraints.`,
      summary: "Baseline factual overview derived from document metadata.",
      highlights: [filename],
      tags: ["Facts", "Fallback"],
      matches: [],
    },
    {
      id: "sec-issues",
      title: "Issues",
      icon: AlertTriangle,
      content:
        "The document likely concerns maintainability and applicable statutory provisions based on the case category.",
      summary: "Inferred legal issues from document context.",
      highlights: ["maintainability", "statutory provisions"],
      tags: ["Issues"],
      matches: [],
    },
    {
      id: "sec-relief",
      title: "Relief Sought",
      icon: Scale,
      content:
        "Final relief should be validated against the complete pleadings and annexures.",
      summary: "Interpreted relief sought from document cues.",
      highlights: ["final relief"],
      tags: ["Relief"],
      matches: [],
    },
  ];
}

function assessFIRSignals(text: string) {
  const normalized = text.toLowerCase();
  const caseType =
    normalized.includes("fir") ||
    normalized.includes("ipc") ||
    normalized.includes("criminal")
      ? "Criminal"
      : ("Civil" as FIRPriorityAssessment["caseType"]);

  let severity: FIRPriorityAssessment["severity"] = "Low";
  if (
    normalized.includes("murder") ||
    normalized.includes("rape") ||
    normalized.includes("terror")
  )
    severity = "Critical";
  else if (
    normalized.includes("armed") ||
    normalized.includes("serious") ||
    normalized.includes("grievous")
  )
    severity = "High";
  else if (normalized.includes("fraud") || normalized.includes("dispute"))
    severity = "Medium";

  const bailRiskScore =
    20 +
    (caseType === "Criminal" ? 15 : 0) +
    (severity === "Critical" ? 30 : 0);
  const escapeRiskScore = 10 + (severity === "Critical" ? 40 : 0);

  return {
    caseType,
    severity,
    bailRiskScore,
    escapeRiskScore,
    riskScore: Math.round((bailRiskScore + escapeRiskScore) / 2),
    riskFactors: normalized.includes("abscond") ? ["absconding risk"] : [],
  };
}

function assessRoutingSignals(
  text: string,
  typeHint: FIRPriorityAssessment["caseType"],
) {
  const base = assessFIRSignals(text);
  return { ...base, caseType: typeHint };
}

function computeRoutingPriority(
  signals: ReturnType<typeof assessFIRSignals>,
): number {
  const typeWeight = { Criminal: 40, Civil: 20, "Specialized Cases": 30 };
  const severityWeight = { Low: 10, Medium: 25, High: 40, Critical: 55 };
  return Math.min(
    99,
    typeWeight[signals.caseType] +
      severityWeight[signals.severity] +
      signals.riskScore * 0.1,
  );
}

function buildFIRPriorityRationale(
  signals: ReturnType<typeof assessFIRSignals>,
): string {
  return `Priority based on ${signals.caseType} case type and ${signals.severity.toLowerCase()} severity assessment.`;
}

function toJudgeCategory(
  caseType: FIRPriorityAssessment["caseType"],
): "Criminal" | "Civil" | "Other" {
  if (caseType === "Criminal") return "Criminal";
  if (caseType === "Civil") return "Civil";
  return "Other";
}

function buildFallbackJudges(
  category: "Criminal" | "Civil" | "Other",
): JudgeProfile[] {
  return FIR_JUDGE_ROSTER[category].map((name, i) => ({
    id: `judge-${category}-${i}`,
    name,
    category,
    courtLevel: "High Court",
    yearsOfExperience: 15 + i * 2,
    caseLoadCapacity: 100,
    currentCaseLoad: 40 + i * 10,
    availability: "Available",
  }));
}

function rankJudgesForAssessment(
  assessment: FIRPriorityAssessment,
  judges: JudgeProfile[],
  filename: string,
  sections: Section[],
): JudgeRecommendation[] {
  const category = toJudgeCategory(assessment.caseType);
  return judges
    .filter((j) => j.category === category)
    .map((j) => ({
      judgeId: j.id,
      judgeName: j.name,
      score: 80 + Math.round(Math.random() * 15),
      utilization: Math.round((j.currentCaseLoad / j.caseLoadCapacity) * 100),
      availability: j.availability,
      reason: `Assigned based on specialization in ${category} law and available capacity.`,
    }))
    .sort((a, b) => b.score - a.score);
}

function buildTrendingTopics(cases: CaseResult[]) {
  const topics = ["Constitutional", "Criminal", "Civil", "Tax", "Service Law"];
  return topics.map((t, i) => ({
    topic: t,
    growth: 20 + i * 5,
    searches: cases.filter((c) => c.type === t).length,
  }));
}
