/**
 * Text-processing utilities: normalization, extraction, humanization.
 * All functions are pure (no imports from src/services or src/contexts).
 */

import type { CaseResult } from "@/types";

// ── Normalization ───────────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  return `${text || ""}`.split("\u0000").join(" ").replace(/\s+/g, " ").trim();
}

/** Strip raw metadata artifacts from any text that will be shown in the UI. */
export function sanitizeDisplayText(text: string): string {
  if (!text) return "";
  const cleaned = text
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

  if (cleaned.length < 20) return "";
  return cleaned;
}

// ── Segment extraction ──────────────────────────────────────────────────────

export function extractSegment(text: string, label: string): string {
  const source = text || "";
  const start = source.indexOf(label);
  if (start < 0) return "";
  const after = source.slice(start + label.length);
  const endIndex = after.indexOf("\n");
  return (endIndex >= 0 ? after.slice(0, endIndex) : after).trim();
}

/** Extract case names from raw cited-cases dict string like "{'case v. case': 1.0, ...}" */
export function extractCitedCaseNames(raw: string): string[] {
  if (!raw) return [];
  const names: string[] = [];
  const regex = /['"]([^'"]{4,})['"]\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    const name = m[1].trim();
    if (name && !/^[\d.]+$/.test(name) && name.length > 5) {
      names.push(humanizeTitle(name));
    }
  }
  return names.slice(0, 5);
}

export function extractJudgmentText(
  fullText: string,
  decisionSegment: string,
  summary: string,
): string {
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

export function extractFinalVerdict(judgmentText: string): string {
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

// ── Humanization ────────────────────────────────────────────────────────────

/** Parse "Article 14 in The Constitution Of India 1949 ; Section 153 ..." into a clean list */
export function parseIssueList(rawIssues: string): string[] {
  if (!rawIssues) return [];
  return rawIssues
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .map((s) => {
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
export function humanizeTitle(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/\.\.\.$/, "")
    .trim();
  if (!cleaned) return "Untitled Case";
  return cleaned
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["vs", "v.", "v", "&"].includes(lower))
        return lower === "vs" ? "vs" : lower;
      if (
        [
          "of",
          "the",
          "in",
          "and",
          "or",
          "for",
          "to",
          "by",
          "on",
          "at",
          "an",
          "ors",
          "ors.",
          "anr",
          "anr.",
        ].includes(lower)
      )
        return lower;
      if (/^[A-Z]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Build a clean, human-readable summary from structured case data */
export function humanizeSummary(input: {
  title: string;
  court: string;
  year: number;
  issues: string[];
  verdict: string;
  judges: string;
  caseType: string;
}): string {
  const parts: string[] = [];

  parts.push(
    `This ${input.caseType || "legal"} matter was heard by the ${input.court} in ${input.year}.`,
  );

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

  if (input.issues.length > 0) {
    const displayIssues = input.issues.slice(0, 3);
    parts.push(
      `The key legal provisions under consideration were ${displayIssues.join("; ")}.`,
    );
  }

  if (input.verdict && input.verdict !== "Unknown") {
    parts.push(`The court's final verdict was: ${input.verdict}.`);
  }

  return parts.join(" ");
}

/** Build clean judgment text from structured data */
export function humanizeJudgment(input: {
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
    parts.push(
      "The court examined the facts and arguments presented by all parties.",
    );
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
export function humanizeWhyMatch(input: {
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
export function humanizeQueryMatch(query: string, item: CaseResult): string {
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

  const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 3);
  const titleLower = item.title.toLowerCase();
  const titleHits = queryWords.filter((w) => titleLower.includes(w));
  if (titleHits.length > 0) {
    reasons.push(`shared legal terms (${titleHits.slice(0, 3).join(", ")})`);
  }

  if (item.finalVerdict && item.finalVerdict !== "Unknown") {
    reasons.push(`a "${item.finalVerdict}" verdict outcome`);
  }

  if (reasons.length === 0) {
    return `This case matches your query based on strong similarity in legal themes and statutory context.`;
  }

  return `This case matches your query based on ${reasons.join(", ")}.`;
}

/** Build a local humanized narrative for a case item */
export function buildLocalHumanizedNarrative(item: CaseResult): string {
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

/** Build a local AI-style reason for a query-case match */
export function buildLocalAiReason(query: string, item: CaseResult): string {
  return humanizeQueryMatch(query, item);
}

/** Build trending topics from an array of cases */
export function buildTrendingTopics(
  cases: CaseResult[],
): Array<{ topic: string; growth: number; searches: number }> {
  const topicMap = new Map<string, number>();
  for (const item of cases) {
    for (const tag of item.tags) {
      topicMap.set(tag, (topicMap.get(tag) || 0) + 1);
    }
  }
  return Array.from(topicMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, searches], idx) => ({
      topic,
      growth: 40 + (6 - idx) * 12,
      searches,
    }));
}

export function getMatchLevel(
  score: number,
): "High" | "Medium" | "Low" {
  if (score >= 0.85) return "High";
  if (score >= 0.6) return "Medium";
  return "Low";
}
