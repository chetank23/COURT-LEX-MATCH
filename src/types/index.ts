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
  rationale: string;
}

export interface FIRJudgeAssignment {
  category: "Criminal" | "Civil" | "Other";
  assignedJudge: string;
  availableJudges: string[];
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
  notes: string;
}
