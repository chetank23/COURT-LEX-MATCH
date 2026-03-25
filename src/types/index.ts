import React from "react";

export interface CaseResult {
  id: string;
  title: string;
  court: string;
  year: number;
  similarity: number;
  priorityScore?: number;
  priorityBand?: "P0" | "P1" | "P2" | "P3";
  summary: string;
  whyMatch: string;
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
