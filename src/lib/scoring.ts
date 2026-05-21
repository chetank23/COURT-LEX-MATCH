/**
 * Scoring utilities for case priority, similarity, and tag extraction.
 * All functions are pure (no side effects) and framework-agnostic.
 */

import type { FIRPriorityAssessment } from "@/types";

// ── Priority computation ────────────────────────────────────────────────────

export function computePriority(raw: {
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
  else if (
    /\b(fraud|money laundering|forgery|corruption|bribery)\b/.test(text)
  )
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

export function toPriorityBand(
  score: number,
): FIRPriorityAssessment["priorityBand"] {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

export function computeSimilarity(raw: {
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

export function keywordScore(
  text: string,
  terms: string[],
  maxScore: number,
): number {
  const hits = terms.reduce(
    (acc, term) => (text.includes(term) ? acc + 1 : acc),
    0,
  );
  return Math.min(maxScore, Math.round((hits / terms.length) * maxScore));
}

// ── Tag extraction ──────────────────────────────────────────────────────────

export function buildTags(raw: {
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

// ── FIR / routing signals ───────────────────────────────────────────────────

export function assessFIRSignals(text: string) {
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

export function assessRoutingSignals(
  text: string,
  typeHint: FIRPriorityAssessment["caseType"],
) {
  const base = assessFIRSignals(text);
  return { ...base, caseType: typeHint };
}

export function computeRoutingPriority(
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

export function buildFIRPriorityRationale(
  signals: ReturnType<typeof assessFIRSignals>,
): string {
  return `Priority based on ${signals.caseType} case type and ${signals.severity.toLowerCase()} severity assessment.`;
}

export function toJudgeCategory(
  caseType: FIRPriorityAssessment["caseType"],
): "Criminal" | "Civil" | "Other" {
  if (caseType === "Criminal") return "Criminal";
  if (caseType === "Civil") return "Civil";
  return "Other";
}
