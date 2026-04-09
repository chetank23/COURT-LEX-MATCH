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
} from "@/types";
import { AlertTriangle, FileText, Gavel, Layers, Scale } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";
const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

const FIR_JUDGE_ROSTER: Record<"Criminal" | "Civil" | "Other", string[]> = {
  Criminal: ["Justice N. Rao", "Justice P. Mehta", "Justice S. Khan"],
  Civil: ["Justice R. Iyer", "Justice K. Banerjee", "Justice V. Sen"],
  Other: ["Justice A. Menon", "Justice D. Kapoor", "Justice T. Joseph"],
};

const DEFAULT_JUDGE_COURTS: Record<"Criminal" | "Civil" | "Other", "Supreme Court" | "High Court" | "District Court"> = {
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
  specializations?: ("Criminal" | "Civil" | "Constitutional" | "Commercial" | "Labor" | "Revenue")[];
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

  async queryRag(query: string, topK = 8): Promise<RagQueryResponse> {
    const payload = (await this._requestJson("/api/rag/query", {
      method: "POST",
      body: JSON.stringify({ query, topK }),
    })) as RagQueryResponse | null;

    if (payload) return payload;

    return {
      query,
      answer: "RAG service is currently unavailable.",
      grounded: false,
      confidence: 0,
      sources: [],
      retrievedChunks: [],
    };
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
    sections: Section[]
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
    const judges = candidateJudges.length > 0 ? candidateJudges : buildFallbackJudges(category);
    const ranking = rankJudgesForAssessment(assessment, judges, file.name, sections);
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
        chosen?.reason || "Assigned using fallback roster because no ranked judge recommendation was available.",
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
    const rawText = [caseItem.title, caseItem.summary || "", caseItem.type || "", caseItem.court || ""].join(" ");
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
    const roster = judges.length > 0 ? judges : buildFallbackJudges(toJudgeCategory(assessment.caseType));
    const ranking = rankJudgesForAssessment(assessment, roster, caseItem.title, []);
    const selected = ranking[0] || null;
    const category = toJudgeCategory(assessment.caseType);

    return {
      category,
      assignedJudgeId: selected?.judgeId,
      assignedJudge: selected?.judgeName || FIR_JUDGE_ROSTER[category][0],
      availableJudges: ranking.map((item) => item.judgeName),
      judgeRankings: ranking,
      assignmentReason: selected?.reason || "Assigned using case metadata fallback.",
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
    const rawText = [caseItem.title, caseItem.summary || "", caseItem.typeHint || ""].join(" ");
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
   * Judge Availability & Specialization Checking
   */
  async getAvailableJudgesByArea(input: {
    district: string;
    caseType?: "Criminal" | "Civil" | "Other";
    date?: string;
    onlyAvailable?: boolean;
  }): Promise<JudgeProfile[]> {
    const allJudges = await this.getJudges();
    const hearings = await this.getHearings();

    let filtered = allJudges.filter((judge) => {
      // Filter by district/area
      const districtMatch = !input.district || !judge.district || judge.district.toLowerCase().includes(input.district.toLowerCase());
      
      // Filter by case type specialization
      const caseTypeMatch = !input.caseType || judge.category === input.caseType || (judge.specializations?.includes(input.caseType) ?? false);

      // Filter by availability status
      const availabilityMatch = !input.onlyAvailable || judge.availability === "Available";

      return districtMatch && caseTypeMatch && availabilityMatch;
    });

    // If date is provided, filter out judges with hearings on that date
    if (input.date) {
      filtered = filtered.map((judge) => {
        const hearingsOnDate = hearings.filter(
          (h) => h.assignedJudgeId === judge.id && h.hearingDate === input.date
        );
        return {
          ...judge,
          scheduledHearingDates: hearingsOnDate.map((h) => h.hearingDate),
        };
      });
    }

    return filtered.sort((a, b) => {
      // Sort by availability first
      const availOrder = { "Available": 0, "Busy": 1, "On Leave": 2 };
      const availDiff = (availOrder[a.availability] ?? 3) - (availOrder[b.availability] ?? 3);
      if (availDiff !== 0) return availDiff;

      // Then by current case load (lower is better)
      const loadDiff = a.currentCaseLoad - b.currentCaseLoad;
      if (loadDiff !== 0) return loadDiff;

      // Then by experience (higher is better)
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
    const utilization = judge.caseLoadCapacity > 0 ? (judge.currentCaseLoad / judge.caseLoadCapacity) * 100 : 0;
    const isFree = judge.availability === "Available" && judge.currentCaseLoad < judge.caseLoadCapacity * 0.8;

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
      (j) => !district || !j.district || j.district.toLowerCase().includes(district.toLowerCase())
    );

    const counts = {
      total: filteredJudges.length,
      available: filteredJudges.filter((j) => j.availability === "Available").length,
      busy: filteredJudges.filter((j) => j.availability === "Busy").length,
      onLeave: filteredJudges.filter((j) => j.availability === "On Leave").length,
      byCaseType: {} as Record<string, number>,
    };

    // Count by case type
    filteredJudges.forEach((judge) => {
      counts.byCaseType[judge.category] = (counts.byCaseType[judge.category] ?? 0) + 1;
    });

    return counts;
  },

  async findBestJudgeForCase(input: {
    caseType: "Criminal" | "Civil" | "Other";
    district: string;
    severity?: "Critical" | "High" | "Medium" | "Low";
    hearingDate?: string;
  }): Promise<{
    judge: JudgeProfile | null;
    alternatives: JudgeProfile[];
    reason: string;
    availabilityInfo: string;
  }> {
    const available = await this.getAvailableJudgesByArea({
      district: input.district,
      caseType: input.caseType,
      date: input.hearingDate,
      onlyAvailable: true,
    });

    if (available.length === 0) {
      const allInDistrict = await this.getAvailableJudgesByArea({
        district: input.district,
        caseType: input.caseType,
      });

      return {
        judge: allInDistrict[0] || null,
        alternatives: allInDistrict.slice(1),
        reason: "No judge available on requested date; recommending judge with upcoming availability",
        availabilityInfo: allInDistrict[0]
          ? `${allInDistrict[0].name} is currently ${allInDistrict[0].availability.toLowerCase()} (${allInDistrict[0].currentCaseLoad}/${allInDistrict[0].caseLoadCapacity} cases)`
          : `No judges found for ${input.caseType} cases in ${input.district}`,
      };
    }

    const primary = available[0];
    const alternatives = available.slice(1, 3);

    const details = `${primary.name} is ${primary.availability.toLowerCase()} with ${primary.caseLoadCapacity - primary.currentCaseLoad} case slots available`;

    return {
      judge: primary,
      alternatives,
      reason: `Selected for ${input.caseType} case specialization, availability status, and case load capacity in ${input.district}`,
      availabilityInfo: details,
    };
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

  async getAllHearings(): Promise<HearingSchedule[]> {
    const fromApi = (await this._fetchJson("/api/hearings")) as HearingSchedule[] | null;
    if (fromApi && Array.isArray(fromApi)) return fromApi;
    return [];
  },

  async getLocalCourtAvailability(input: {
    caseText: string;
    hearingDate?: string;
    hearingTime?: string;
  }): Promise<{
    state: string;
    district: string;
    policeStation: string;
    availableCourts: Array<{ localCourtName: string; courtRoom: string }>;
    unavailableCourts: Array<{ localCourtName: string; courtRoom: string }>;
  }> {
    const inferred = inferLocationFromCaseText(input.caseText);
    const candidateCourts = buildLocalCourtCatalog(inferred);
    const scheduleDate = input.hearingDate || toNextBusinessDateDMY();
    const scheduleTime = normalize24HourTime(input.hearingTime || "10:30");
    const hearings = await this.getAllHearings();

    const unavailableCourts = candidateCourts.filter((court) =>
      hearings.some(
        (hearing) =>
          hearing.hearingDate === scheduleDate &&
          normalize24HourTime(hearing.hearingTime) === scheduleTime &&
          normalizeToken(hearing.localCourtName) === normalizeToken(court.localCourtName) &&
          normalizeToken(hearing.courtRoom) === normalizeToken(court.courtRoom)
      )
    );
    const availableCourts = candidateCourts.filter(
      (court) =>
        !unavailableCourts.some(
          (blocked) =>
            normalizeToken(blocked.localCourtName) === normalizeToken(court.localCourtName) &&
            normalizeToken(blocked.courtRoom) === normalizeToken(court.courtRoom)
        )
    );

    return {
      state: inferred.state,
      district: inferred.district,
      policeStation: inferred.policeStation,
      availableCourts,
      unavailableCourts,
    };
  },

  async getSchedulingAdvisory(input: {
    caseId: string;
    severity: string;
    hearingDate: string;
    hearingTime: string;
    localCourtName: string;
    courtRoom: string;
  }): Promise<{
    canSchedule: boolean;
    shouldPromptReschedule: boolean;
    message: string;
    conflictHearing?: HearingSchedule;
    suggestedLowSeverityReschedule?: { hearingDate: string; hearingTime: string };
  }> {
    const scheduleTime = normalize24HourTime(input.hearingTime);
    const hearings = await this.getAllHearings();
    const conflictHearing = hearings.find(
      (hearing) =>
        hearing.caseId !== input.caseId &&
        hearing.hearingDate === input.hearingDate &&
        normalize24HourTime(hearing.hearingTime) === scheduleTime &&
        normalizeToken(hearing.localCourtName) === normalizeToken(input.localCourtName) &&
        normalizeToken(hearing.courtRoom) === normalizeToken(input.courtRoom)
    );

    if (!conflictHearing) {
      return {
        canSchedule: true,
        shouldPromptReschedule: false,
        message: "",
      };
    }

    const incomingSeverity = normalizeSeverity(input.severity);
    const existingSeverity = extractSeverityFromNotes(conflictHearing.notes);

    const shouldPromptReschedule =
      severityRank(incomingSeverity) > severityRank(existingSeverity) &&
      severityRank(incomingSeverity) >= severityRank("High") &&
      severityRank(existingSeverity) <= severityRank("Low");

    if (shouldPromptReschedule) {
      const suggestedLowSeverityReschedule = findNextAvailableCourtSlot(
        hearings,
        conflictHearing.localCourtName,
        conflictHearing.courtRoom,
        conflictHearing.hearingDate,
        conflictHearing.hearingTime,
        conflictHearing.id
      );

      return {
        canSchedule: false,
        shouldPromptReschedule: true,
        message: `High severity case can be prioritized by rescheduling low severity case \"${conflictHearing.caseTitle}\".`,
        conflictHearing,
        suggestedLowSeverityReschedule,
      };
    }

    return {
      canSchedule: false,
      shouldPromptReschedule: false,
      message: "Selected local court and courtroom are already booked at this time.",
      conflictHearing,
    };
  },

  async prioritizeHighSeverityScheduling(input: {
    highCase: {
      caseId: string;
      caseTitle: string;
      assignedJudgeId?: string;
      assignedJudgeName: string;
      localCourtName: string;
      courtRoom: string;
      state?: string;
      district?: string;
      hearingDate: string;
      hearingTime: string;
      notes?: string;
      severity: string;
    };
    conflictHearingId: string;
    conflictRescheduleDate?: string;
    conflictRescheduleTime?: string;
  }): Promise<{ rescheduledHearing: HearingSchedule; scheduledHighSeverityHearing: HearingSchedule }> {
    const conflict = await this.getHearingById(input.conflictHearingId);
    if (!conflict) {
      throw new Error("Unable to locate low severity case to reschedule.");
    }

    const allHearings = await this.getAllHearings();
    const fallbackSlot = findNextAvailableCourtSlot(
      allHearings,
      conflict.localCourtName,
      conflict.courtRoom,
      conflict.hearingDate,
      conflict.hearingTime,
      conflict.id
    );

    const targetDate = input.conflictRescheduleDate || fallbackSlot.hearingDate;
    const targetTime = normalize24HourTime(input.conflictRescheduleTime || fallbackSlot.hearingTime);
    const updatedNotes = `${conflict.notes || ""} Rescheduled to prioritize ${normalizeSeverity(input.highCase.severity)} severity matter.`.trim();

    const updatedConflict = await this.editHearing(conflict.id, {
      hearingDate: targetDate,
      hearingTime: targetTime,
      notes: updatedNotes,
    });

    const rescheduledHearing: HearingSchedule = {
      ...conflict,
      ...updatedConflict,
      hearingDate: targetDate,
      hearingTime: targetTime,
    };

    const scheduledHighSeverityHearing = await this.scheduleHearingForAssignment({
      caseId: input.highCase.caseId,
      caseTitle: input.highCase.caseTitle,
      assignedJudgeId: input.highCase.assignedJudgeId,
      assignedJudgeName: input.highCase.assignedJudgeName,
      localCourtName: input.highCase.localCourtName,
      courtRoom: input.highCase.courtRoom,
      state: input.highCase.state,
      district: input.highCase.district,
      hearingDate: input.highCase.hearingDate,
      hearingTime: input.highCase.hearingTime,
      notes: input.highCase.notes,
    });

    return { rescheduledHearing, scheduledHighSeverityHearing };
  },

  async scheduleHearingForAssignment(input: {
    caseId: string;
    caseTitle: string;
    assignedJudgeId?: string;
    assignedJudgeName: string;
    localCourtName?: string;
    courtRoom?: string;
    state?: string;
    district?: string;
    notes?: string;
    hearingDate?: string;
    hearingTime?: string;
  }): Promise<HearingSchedule> {
    const scheduleDate = input.hearingDate || toNextBusinessDateDMY();
    const scheduleTime = normalize24HourTime(input.hearingTime || "10:30");
    const chosenLocalCourt = input.localCourtName || "District Court";
    const chosenCourtRoom = input.courtRoom || "Court Room 1";
    const allHearings = await this.getAllHearings();
    const existingHearings = await this.getHearingsByCaseId(input.caseId);
    const duplicateSlot = existingHearings.find(
      (hearing) => hearing.hearingDate === scheduleDate && normalize24HourTime(hearing.hearingTime) === scheduleTime
    );

    if (duplicateSlot) {
      const reassigned: Partial<HearingSchedule> = {
        caseTitle: input.caseTitle,
        assignedJudgeId: input.assignedJudgeId || `judge-${hashText(input.assignedJudgeName)}`,
        assignedJudgeName: input.assignedJudgeName,
        localCourtName: chosenLocalCourt,
        courtRoom: chosenCourtRoom,
        state: input.state || duplicateSlot.state,
        district: input.district || duplicateSlot.district,
        status: "Scheduled",
        notes: input.notes || duplicateSlot.notes,
      };

      const updated = await this.editHearing(duplicateSlot.id, reassigned);
      return {
        ...duplicateSlot,
        ...updated,
        hearingDate: scheduleDate,
        hearingTime: scheduleTime,
      };
    }

    const slotConflict = allHearings.find(
      (hearing) =>
        hearing.caseId !== input.caseId &&
        hearing.hearingDate === scheduleDate &&
        normalize24HourTime(hearing.hearingTime) === scheduleTime &&
        normalizeToken(hearing.localCourtName) === normalizeToken(chosenLocalCourt) &&
        normalizeToken(hearing.courtRoom) === normalizeToken(chosenCourtRoom)
    );

    if (slotConflict) {
      throw new Error("Selected local court and courtroom are already booked at this time.");
    }

    const hearing: HearingSchedule = {
      id: `hearing-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      caseId: input.caseId,
      caseTitle: input.caseTitle,
      assignedJudgeId: input.assignedJudgeId || `judge-${hashText(input.assignedJudgeName)}`,
      assignedJudgeName: input.assignedJudgeName,
      hearingDate: scheduleDate,
      hearingTime: scheduleTime,
      courtRoom: chosenCourtRoom,
      state: input.state || "TBD",
      district: input.district || "TBD",
      localCourtName: chosenLocalCourt,
      status: "Scheduled",
      notes: input.notes || "Auto-scheduled at judge assignment.",
    };

    return await this.addHearing(hearing);
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

function toNextBusinessDateISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNextBusinessDateDMY() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  const year = `${date.getFullYear()}`;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${day}-${month}-${year}`;
}

function normalize24HourTime(value: string) {
  const raw = `${value || ""}`.trim();
  if (!raw) return "10:30";

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    let hours = Number.parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return `${`${hours}`.padStart(2, "0")}:${minutes}`;
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number.parseInt(twentyFourHourMatch[1], 10);
    const minutes = twentyFourHourMatch[2];
    return `${`${hours}`.padStart(2, "0")}:${minutes}`;
  }

  return "10:30";
}

function inferTypeFromFileName(fileName: string): "Criminal" | "Civil" | "Specialized Cases" {
  const lower = fileName.toLowerCase();
  if (lower.includes("fir") || lower.includes("ipc") || lower.includes("crime")) return "Criminal";
  if (lower.includes("property") || lower.includes("contract") || lower.includes("civil")) return "Civil";
  return "Specialized Cases";
}

function inferLocationFromCaseText(text: string): { state: string; district: string; policeStation: string; city: string } {
  const raw = `${text || ""}`;
  const normalized = raw.toLowerCase();

  const districtMatch = raw.match(/district\s*[:\-]\s*([^,\n]+)/i);
  const policeStationMatch = raw.match(/police station\s*[:\-]\s*([^,\n]+)/i);

  const cityHints: Array<{ key: string; city: string; district: string; state: string }> = [
    { key: "bengaluru", city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka" },
    { key: "bangalore", city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka" },
    { key: "mumbai", city: "Mumbai", district: "Mumbai", state: "Maharashtra" },
    { key: "delhi", city: "Delhi", district: "New Delhi", state: "Delhi" },
    { key: "chennai", city: "Chennai", district: "Chennai", state: "Tamil Nadu" },
    { key: "hyderabad", city: "Hyderabad", district: "Hyderabad", state: "Telangana" },
    { key: "kolkata", city: "Kolkata", district: "Kolkata", state: "West Bengal" },
    { key: "pune", city: "Pune", district: "Pune", state: "Maharashtra" },
  ];

  const hinted = cityHints.find((hint) => normalized.includes(hint.key));
  const district = (districtMatch?.[1] || hinted?.district || "Local District").trim();
  const policeStation = (policeStationMatch?.[1] || "Local Police Station").trim();
  const city = hinted?.city || district;
  const state = hinted?.state || "State Not Available";

  return { state, district, policeStation, city };
}

function buildLocalCourtCatalog(location: { state: string; district: string; policeStation: string; city: string }) {
  const districtCourtBase = `${location.district} District Court`;
  const metropolitanCourtBase = `${location.city} Metropolitan Magistrate Court`;
  const sessionsCourtBase = `${location.district} Sessions Court`;

  return [
    { localCourtName: districtCourtBase, courtRoom: "Court Room 1" },
    { localCourtName: districtCourtBase, courtRoom: "Court Room 2" },
    { localCourtName: metropolitanCourtBase, courtRoom: "Court Room 1" },
    { localCourtName: sessionsCourtBase, courtRoom: "Court Room 1" },
  ];
}

function normalizeToken(value: string) {
  return `${value || ""}`.trim().toLowerCase();
}

function parseDateTime(dateValue: string, timeValue: string) {
  const dateMatch = `${dateValue || ""}`.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const timeMatch = normalize24HourTime(timeValue).match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const day = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const year = Number.parseInt(dateMatch[3], 10);
  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatDateDMY(date: Date) {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = `${date.getFullYear()}`;
  return `${day}-${month}-${year}`;
}

function formatTimeHHMM(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function findNextAvailableCourtSlot(
  hearings: HearingSchedule[],
  localCourtName: string,
  courtRoom: string,
  startDate: string,
  startTime: string,
  ignoreHearingId?: string
) {
  let cursor = parseDateTime(startDate, startTime) || new Date();
  cursor = new Date(cursor.getTime() + 30 * 60 * 1000);

  for (let attempts = 0; attempts < 240; attempts += 1) {
    const candidateDate = formatDateDMY(cursor);
    const candidateTime = formatTimeHHMM(cursor);
    const occupied = hearings.some(
      (hearing) =>
        hearing.id !== ignoreHearingId &&
        hearing.hearingDate === candidateDate &&
        normalize24HourTime(hearing.hearingTime) === candidateTime &&
        normalizeToken(hearing.localCourtName) === normalizeToken(localCourtName) &&
        normalizeToken(hearing.courtRoom) === normalizeToken(courtRoom)
    );

    if (!occupied) {
      return { hearingDate: candidateDate, hearingTime: candidateTime };
    }

    cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
  }

  return {
    hearingDate: toNextBusinessDateDMY(),
    hearingTime: "11:00",
  };
}

function extractSeverityFromNotes(notes: string) {
  const raw = `${notes || ""}`;
  const match = raw.match(/severity\s*[:\-]\s*(critical|high|medium|low)/i);
  return normalizeSeverity(match?.[1] || "Medium");
}

function normalizeSeverity(value: string) {
  const raw = `${value || ""}`.trim().toLowerCase();
  if (raw === "critical") return "Critical";
  if (raw === "high") return "High";
  if (raw === "low") return "Low";
  return "Medium";
}

function severityRank(value: string) {
  const normalized = normalizeSeverity(value);
  if (normalized === "Critical") return 4;
  if (normalized === "High") return 3;
  if (normalized === "Medium") return 2;
  return 1;
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
  const signals = assessRoutingSignals(text, "Specialized Cases");

  const urgency = keywordScore(text, ["bail", "stay", "urgent", "interim", "habeas", "injunction"], 100);
  const impact = keywordScore(text, ["constitutional", "fundamental", "public", "nation", "policy"], 100);
  const deadlineRisk = keywordScore(text, ["limitation", "deadline", "period", "time-barred"], 100);
  const similarityConfidence = 60 + Math.min(40, ((raw.citation || "").match(/AIR|SCC|SCR|CriLJ/gi) || []).length * 8);
  const complianceRisk = keywordScore(text, ["tax", "regulation", "penalty", "violation", "compliance"], 100);

  const weighted =
    0.24 * urgency +
    0.2 * impact +
    0.16 * deadlineRisk +
    0.15 * similarityConfidence +
    0.08 * complianceRisk +
    0.1 * signals.riskScore +
    0.07 * signals.bailRiskScore +
    0.0 * signals.escapeRiskScore;

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

function assessRoutingSignals(text: string, caseType: FIRPriorityAssessment["caseType"]) {
  const normalized = text.toLowerCase();
  const severity = detectFIRSeverity(normalized);
  const bailRiskFactors = [
    ["non-bailable", 18],
    ["bail rejected", 22],
    ["bail denied", 22],
    ["custody", 10],
    ["remand", 8],
    ["surety", 6],
    ["anticipatory bail", 12],
    ["interim bail", 14],
    ["bail", 8],
  ] as const;
  const escapeRiskFactors = [
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
  ] as const;

  const riskFactors = new Set<string>();
  let bailRiskScore = 18 + (caseType === "Criminal" ? 10 : 0) + (severity === "Critical" ? 18 : severity === "High" ? 12 : severity === "Medium" ? 6 : 0);
  let escapeRiskScore = 12 + (caseType === "Criminal" ? 8 : 0) + (severity === "Critical" ? 18 : severity === "High" ? 12 : severity === "Medium" ? 4 : 0);

  bailRiskFactors.forEach(([term, boost]) => {
    if (normalized.includes(term)) {
      bailRiskScore += boost;
      riskFactors.add(`bail signal: ${term}`);
    }
  });

  escapeRiskFactors.forEach(([term, boost]) => {
    if (normalized.includes(term)) {
      escapeRiskScore += boost;
      riskFactors.add(`escape signal: ${term}`);
    }
  });

  if (severity === "Critical") {
    riskFactors.add("critical offense severity");
  } else if (severity === "High") {
    riskFactors.add("high offense severity");
  }

  bailRiskScore = Math.max(10, Math.min(99, Math.round(bailRiskScore)));
  escapeRiskScore = Math.max(10, Math.min(99, Math.round(escapeRiskScore)));

  const riskScore = Math.max(10, Math.min(99, Math.round((bailRiskScore * 0.55 + escapeRiskScore * 0.45))));

  return {
    caseType,
    severity,
    bailRiskScore,
    escapeRiskScore,
    riskScore,
    riskFactors: Array.from(riskFactors),
  };
}

function assessFIRSignals(text: string) {
  const caseType = classifyFIRCaseType(text);
  const routing = assessRoutingSignals(text, caseType);
  return routing;
}

function computeRoutingPriority(signals: ReturnType<typeof assessFIRSignals>) {
  const typeWeight: Record<FIRPriorityAssessment["caseType"], number> = {
    Criminal: 42,
    Civil: 26,
    "Specialized Cases": 34,
  };
  const severityWeight: Record<FIRPriorityAssessment["severity"], number> = {
    Low: 12,
    Medium: 24,
    High: 36,
    Critical: 48,
  };

  const weighted =
    0.34 * typeWeight[signals.caseType] +
    0.3 * severityWeight[signals.severity] +
    0.18 * signals.bailRiskScore +
    0.18 * signals.escapeRiskScore;

  return Math.max(20, Math.min(99, Math.round(weighted)));
}

function buildFIRPriorityRationale(signals: ReturnType<typeof assessFIRSignals>) {
  const factors = signals.riskFactors.length > 0 ? `Risk factors: ${signals.riskFactors.slice(0, 3).join(", ")}.` : "No explicit bail or flight-risk markers detected.";
  return `Priority derived from ${signals.caseType.toLowerCase()} classification, ${signals.severity.toLowerCase()} severity, bail risk ${signals.bailRiskScore}, and escape risk ${signals.escapeRiskScore}. ${factors}`;
}

function toJudgeCategory(caseType: FIRPriorityAssessment["caseType"]): "Criminal" | "Civil" | "Other" {
  return caseType === "Criminal" ? "Criminal" : caseType === "Civil" ? "Civil" : "Other";
}

function buildFallbackJudges(category: "Criminal" | "Civil" | "Other"): JudgeCandidate[] {
  const districts = ["Bangalore", "Mysore", "Belgaum", "Yadgir"];
  const states = ["Karnataka", "Karnataka", "Karnataka", "Karnataka"];
  const courts = [
    "District Court",
    "High Court Bench",
    "Sessions Court",
    "Metropolitan Magistrate Court",
  ];

  return FIR_JUDGE_ROSTER[category].map((name, index) => {
    const districtIndex = index % districts.length;
    return {
      id: `${category.toLowerCase()}-fallback-${index + 1}`,
      name,
      category,
      courtLevel: DEFAULT_JUDGE_COURTS[category],
      yearsOfExperience: 10 + index * 4,
      caseLoadCapacity: 45 + index * 5,
      currentCaseLoad: 18 + index * 8,
      availability: index === 0 ? "Available" : index === 1 ? "Busy" : "Available",
      district: districts[districtIndex],
      state: states[districtIndex],
      area: `${districts[districtIndex]}, ${states[districtIndex]}`,
      courtName: courts[districtIndex],
      specializations:
        category === "Criminal"
          ? ["Criminal", "Constitutional"]
          : category === "Civil"
            ? ["Civil", "Commercial", "Labor"]
            : (["Revenue"] as const),
    };
  });
}

function rankJudgesForAssessment(
  assessment: FIRPriorityAssessment,
  judges: Array<JudgeProfile | JudgeCandidate>,
  seedText: string,
  sections: Section[]
): Array<{
  judgeId?: string;
  judgeName: string;
  score: number;
  utilization: number;
  availability: "Available" | "Busy" | "On Leave";
  reason: string;
}> {
  const category = toJudgeCategory(assessment.caseType);
  const severityWeight = assessment.severity === "Critical" ? 1 : assessment.severity === "High" ? 0.9 : assessment.severity === "Medium" ? 0.72 : 0.55;
  const riskWeight = Math.max(0.55, Math.min(1, assessment.riskScore / 100));

  return judges
    .map((judge) => {
      const utilization = judge.caseLoadCapacity > 0 ? judge.currentCaseLoad / judge.caseLoadCapacity : 1;
      const capacityHeadroom = Math.max(0, 1 - utilization);
      const availabilityScore = judge.availability === "Available" ? 1 : judge.availability === "Busy" ? 0.6 : 0.15;
      const categoryMatch = judge.category === category ? 1 : category === "Other" && judge.category === "Criminal" ? 0.72 : 0.38;
      const experienceScore = Math.min(1, judge.yearsOfExperience / 25);
      const courtScore = assessCourtFit(judge.courtLevel, assessment.severity, assessment.riskScore);
      const sectionBoost = Math.min(0.08, sections.length * 0.02);
      const seedAffinity = hashText(`${seedText}:${judge.name}`) % 11;
      const score = Math.round(
        100 * (
          categoryMatch * 0.3 +
          availabilityScore * 0.22 +
          capacityHeadroom * 0.18 +
          experienceScore * 0.1 +
          courtScore * 0.12 +
          severityWeight * 0.05 +
          riskWeight * 0.03 +
          sectionBoost
        ) + seedAffinity
      );

      const reason = buildJudgeReason({
        categoryMatch,
        availability: judge.availability,
        utilization,
        severity: assessment.severity,
        riskScore: assessment.riskScore,
      });

      return {
        judgeId: judge.id,
        judgeName: judge.name,
        score,
        utilization: Math.round(utilization * 100),
        availability: judge.availability,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score || a.utilization - b.utilization || a.judgeName.localeCompare(b.judgeName));
}

function assessCourtFit(
  courtLevel: JudgeProfile["courtLevel"] | JudgeCandidate["courtLevel"],
  severity: FIRPriorityAssessment["severity"],
  riskScore: number
) {
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

function buildJudgeReason(input: {
  categoryMatch: number;
  availability: "Available" | "Busy" | "On Leave";
  utilization: number;
  severity: FIRPriorityAssessment["severity"];
  riskScore: number;
}) {
  const availabilityText = input.availability === "Available" ? "available" : input.availability.toLowerCase();
  const loadText = input.utilization >= 85 ? "high current load" : input.utilization >= 60 ? "moderate current load" : "low current load";
  const fitText = input.categoryMatch >= 0.9 ? "strong category fit" : "acceptable fallback fit";
  const riskText = input.riskScore >= 80 ? "critical risk profile" : input.riskScore >= 60 ? "elevated risk profile" : `${input.severity.toLowerCase()} severity`;
  return `Selected for ${fitText}, ${availabilityText} status, ${loadText}, and ${riskText}.`;
}

function buildFIRText(fileName: string, sections: Section[]) {
  return [fileName, ...sections.map((section) => `${section.title} ${section.summary} ${section.content} ${section.highlights.join(" ")}`)].join(" ");
}

function includesAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term));
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
