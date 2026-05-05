import React from "react";

export interface CaseResult {
  id: string;
  title: string;
  court: string;
  year: number;
  similarity: number;
  matchLevel?: string;
  priorityScore?: number;
  priorityBand?: "P0" | "P1" | "P2" | "P3";
  bailRiskScore?: number;
  escapeRiskScore?: number;
  riskScore?: number;
  summary: string;
  judgment?: string;
  judgement?: string;
  finalVerdict?: string;
  final_verdict?: string;
  whyMatch: string;
  whyMatched?: string;
  matchedTerms?: string[];
  type: string;
  tags: string[];
}

export interface TimelineEvent {
  id: string;
  type: "search" | "upload" | "view";
  title: string;
  date: string;
  results?: number;
}

export interface Section {
  id: string;
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  content: string;
  summary: string;
  highlights: string[];
  tags: string[];
  matches: Array<{
    title: string;
    similarity: number;
    reason: string;
  }>;
}

export interface InsightsData {
  similarityDistribution: Array<{
    range: string;
    count: number;
  }>;
  caseClusters: Array<{
    name: string;
    cases: number;
    color: string;
  }>;
  trendingTopics: Array<{
    topic: string;
    growth: number;
    searches: number;
  }>;
  monthlySearches: Array<{
    month: string;
    searches: number;
  }>;
}

export interface FIRPriorityAssessment {
  caseType: "Criminal" | "Civil" | "Specialized Cases";
  severity: "Low" | "Medium" | "High" | "Critical";
  priorityScore: number;
  priorityBand: "P0" | "P1" | "P2" | "P3";
  bailRiskScore: number;
  escapeRiskScore: number;
  riskScore: number;
  riskFactors: string[];
  rationale: string;
}

export interface JudgeRecommendation {
  judgeId?: string;
  judgeName: string;
  score: number;
  utilization?: number;
  availability?: JudgeProfile["availability"];
  reason: string;
}

export interface FIRJudgeAssignment {
  category: "Criminal" | "Civil" | "Other";
  assignedJudgeId?: string;
  assignedJudge: string;
  availableJudges: string[];
  judgeRankings: JudgeRecommendation[];
  assignmentReason: string;
  routeMode: "auto" | "fallback" | "override";
  partyLabel: "Accused" | "Defendant";
  requiresPublicProsecutor: boolean;
}

export interface JudgeProfile {
  id: string;
  name: string;
  courtLevel: "Supreme Court" | "High Court" | "District Court";
  category: "Criminal" | "Civil" | "Other";
  yearsOfExperience: number;
  caseLoadCapacity: number;
  currentCaseLoad: number;
  availability: "Available" | "Busy" | "On Leave";
  area?: string;
  district?: string;
  state?: string;
  specializations?: ("Criminal" | "Civil" | "Constitutional" | "Commercial" | "Labor" | "Revenue")[];
  courtName?: string;
  scheduledHearingDates?: string[];
}

export interface HearingSchedule {
  id: string;
  caseId: string;
  caseTitle: string;
  assignedJudgeId: string;
  assignedJudgeName: string;
  hearingDate: string;
  hearingTime: string;
  courtRoom: string;
  state: string;
  district: string;
  localCourtName: string;
  status: "Scheduled" | "Ongoing" | "Completed" | "Postponed";
  notes?: string;
}

export interface RagSource {
  caseId: string;
  title: string;
  court: string;
  year: number;
  type: string;
  finalVerdict?: string;
  section: string;
  score: number;
  excerpt: string;
}

export interface RagRetrievedChunk {
  chunkId: string;
  caseId: string;
  score: number;
  section: string;
  text: string;
}

export interface RagQueryResponse {
  query: string;
  answer: string;
  grounded: boolean;
  confidence: number;
  sources: RagSource[];
  retrievedChunks: RagRetrievedChunk[];
}

export interface CaseAnalysisReport {
  caseTitle: string;
  caseType: string;
  expandedScenario?: string;
  keyFacts: string[];
  legalIssues: string[];
  relevantLaws: string[];
  similarCaseReferences: Array<{
    title: string;
    court: string;
    year: number;
    similarity: number;
    excerpt: string;
  }>;
  arguments: {
    plaintiff: string;
    defendant: string;
  };
  predictedOutcome: string;
  reasoning: string;
  priorityLevel: "HIGH" | "MEDIUM" | "LOW";
  priorityScore: number;
  priorityJustification: string;
  confidenceScore: number;
  grounded: boolean;
  generativeNote?: string;
}
