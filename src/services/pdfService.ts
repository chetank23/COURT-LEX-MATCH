/**
 * PDF analysis service — converts a File to base64, sends it to the backend,
 * and returns structured Section[] results with an OCR / metadata fallback.
 */

import type { Section, FIRPriorityAssessment } from "@/types";
import { requestJson } from "./api";
import { AlertTriangle, FileText, Scale } from "lucide-react";
import { Gavel, Layers } from "lucide-react";
import {
  assessFIRSignals,
  assessRoutingSignals,
  computeRoutingPriority,
  toPriorityBand,
  buildFIRPriorityRationale,
} from "@/lib/scoring";
import { getJudges } from "./judgeService";

// ── Icon resolver ───────────────────────────────────────────────────────────

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

// ── Fallback sections ───────────────────────────────────────────────────────

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

// ── Base64 encoder ──────────────────────────────────────────────────────────

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

// ── Public API ──────────────────────────────────────────────────────────────

export async function analyzePDF(file: File): Promise<Section[]> {
  const contentBase64 = await fileToBase64(file);
  if (!contentBase64) {
    throw new Error(
      "Failed to convert PDF to base64. File might be empty or corrupted.",
    );
  }

  const fromApi = (await requestJson("/api/analyze-pdf", {
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
}

export async function assessFIRPriority(
  file: File,
  sections: Section[],
): Promise<FIRPriorityAssessment> {
  const combinedText = buildFIRTextFromSections(file.name, sections);
  const fromApi = (await requestJson("/api/fir/assess-priority", {
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
}

export function assessCaseRouting(caseItem: {
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
}

function buildFIRTextFromSections(filename: string, sections: Section[]): string {
  const sectionText = sections
    .map(
      (s) => `${s.title} ${s.summary} ${s.content} ${s.highlights.join(" ")}`,
    )
    .join(" ");
  return `${filename} ${sectionText}`.trim();
}

// Re-export getJudges for backward compat with pages that import from pdfService
export { getJudges };
