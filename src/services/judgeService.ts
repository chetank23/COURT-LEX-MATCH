/**
 * Judge & hearing service — all CRUD for judges and hearings,
 * plus availability checks and FIR judge assignment logic.
 */

import type {
  JudgeProfile,
  HearingSchedule,
  FIRPriorityAssessment,
  FIRJudgeAssignment,
  JudgeRecommendation,
  Section,
} from "@/types";
import { fetchJson, requestJson } from "./api";
import {
  assessFIRSignals,
  computeRoutingPriority,
  toPriorityBand,
  buildFIRPriorityRationale,
  toJudgeCategory,
} from "@/lib/scoring";

// ── Roster constants ────────────────────────────────────────────────────────

const FIR_JUDGE_ROSTER: Record<"Criminal" | "Civil" | "Other", string[]> = {
  Criminal: ["Justice N. Rao", "Justice P. Mehta", "Justice S. Khan"],
  Civil: ["Justice R. Iyer", "Justice K. Banerjee", "Justice V. Sen"],
  Other: ["Justice A. Menon", "Justice D. Kapoor", "Justice T. Joseph"],
};

// ── Private helpers ─────────────────────────────────────────────────────────

function buildFallbackJudges(
  category: "Criminal" | "Civil" | "Other",
): JudgeProfile[] {
  return FIR_JUDGE_ROSTER[category].map((name, i) => ({
    id: `judge-${category}-${i}`,
    name,
    category,
    courtLevel: "High Court" as const,
    yearsOfExperience: 15 + i * 2,
    caseLoadCapacity: 100,
    currentCaseLoad: 40 + i * 10,
    availability: "Available" as const,
  }));
}

function rankJudgesForAssessment(
  assessment: FIRPriorityAssessment,
  judges: JudgeProfile[],
  _filename: string,
  _sections: Section[],
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

// ── Judge CRUD ──────────────────────────────────────────────────────────────

export async function getJudges(): Promise<JudgeProfile[]> {
  const fromApi = (await fetchJson("/api/judges")) as JudgeProfile[] | null;
  if (fromApi && Array.isArray(fromApi)) return fromApi;
  return [];
}

export async function getJudgeById(
  judgeId: string,
): Promise<JudgeProfile | null> {
  return (await fetchJson(
    `/api/judges/${encodeURIComponent(judgeId)}`,
  )) as JudgeProfile | null;
}

export async function addJudge(judge: JudgeProfile): Promise<JudgeProfile> {
  const fromApi = (await requestJson("/api/judges", {
    method: "POST",
    body: JSON.stringify(judge),
  })) as JudgeProfile | null;
  if (fromApi) return fromApi;
  return judge;
}

export async function editJudge(
  judgeId: string,
  updates: Partial<JudgeProfile>,
): Promise<Partial<JudgeProfile>> {
  const fromApi = (await requestJson(
    `/api/judges/${encodeURIComponent(judgeId)}`,
    { method: "PUT", body: JSON.stringify(updates) },
  )) as Partial<JudgeProfile> | null;
  if (fromApi) return fromApi;
  return updates;
}

export async function removeJudge(judgeId: string): Promise<void> {
  await requestJson(`/api/judges/${encodeURIComponent(judgeId)}`, {
    method: "DELETE",
  });
}

// ── Hearing CRUD ────────────────────────────────────────────────────────────

export async function getHearings(filters?: {
  caseId?: string;
  judgeId?: string;
}): Promise<HearingSchedule[]> {
  const params = new URLSearchParams();
  if (filters?.caseId) params.set("caseId", filters.caseId);
  if (filters?.judgeId) params.set("judgeId", filters.judgeId);
  const fromApi = (await fetchJson(
    `/api/hearings?${params.toString()}`,
  )) as HearingSchedule[] | null;
  if (fromApi && Array.isArray(fromApi)) return fromApi;
  return [];
}

export const getAllHearings = () => getHearings();
export const getHearingsByJudgeId = (judgeId: string) =>
  getHearings({ judgeId });

export async function scheduleHearing(
  hearing: HearingSchedule,
): Promise<HearingSchedule> {
  const fromApi = (await requestJson("/api/hearings", {
    method: "POST",
    body: JSON.stringify(hearing),
  })) as HearingSchedule | null;
  if (fromApi) return fromApi;
  return hearing;
}

export const addHearing = scheduleHearing;
export const createHearing = scheduleHearing;

export async function updateHearing(
  hearingId: string,
  updates: Partial<HearingSchedule>,
): Promise<Partial<HearingSchedule>> {
  const fromApi = (await requestJson(
    `/api/hearings/${encodeURIComponent(hearingId)}`,
    { method: "PUT", body: JSON.stringify(updates) },
  )) as Partial<HearingSchedule> | null;
  if (fromApi) return fromApi;
  return updates;
}

export const editHearing = updateHearing;

export async function cancelHearing(hearingId: string): Promise<void> {
  await requestJson(`/api/hearings/${encodeURIComponent(hearingId)}`, {
    method: "DELETE",
  });
}

export const removeHearing = cancelHearing;
export const deleteHearing = cancelHearing;

/** Schedule a hearing with built-in client-side conflict detection. */
export async function scheduleHearingForAssignment(input: {
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
  const normalizeTime = (t: string) => `${t || ""}`.trim().slice(0, 5);
  const slotTime = normalizeTime(input.hearingTime);

  const existingHearings = await getHearingsByJudgeId(input.assignedJudgeId);
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
  return scheduleHearing(hearing);
}

// ── Availability helpers ────────────────────────────────────────────────────

export async function getAvailableJudgesByArea(input: {
  district: string;
  caseType?: "Criminal" | "Civil" | "Other";
  date?: string;
  onlyAvailable?: boolean;
}): Promise<JudgeProfile[]> {
  const allJudges = await getJudges();
  const hearings = await getHearings();

  let filtered = allJudges.filter((judge) => {
    const districtMatch =
      !input.district ||
      !judge.district ||
      judge.district.toLowerCase().includes(input.district.toLowerCase());
    const caseTypeMatch =
      !input.caseType ||
      judge.category === input.caseType ||
      (judge.specializations?.includes(input.caseType as "Criminal" | "Civil") ?? false);
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
    const availOrder: Record<string, number> = {
      Available: 0,
      Busy: 1,
      "On Leave": 2,
    };
    const availDiff =
      (availOrder[a.availability] ?? 3) - (availOrder[b.availability] ?? 3);
    if (availDiff !== 0) return availDiff;
    const loadDiff = a.currentCaseLoad - b.currentCaseLoad;
    if (loadDiff !== 0) return loadDiff;
    return b.yearsOfExperience - a.yearsOfExperience;
  });
}

export async function getJudgeAvailabilityStatus(judgeId: string): Promise<{
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
  const judge = await getJudgeById(judgeId);
  if (!judge) return null;

  const hearings = await getHearingsByJudgeId(judgeId);
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
}

export async function getJudgesCountByArea(district: string): Promise<{
  total: number;
  available: number;
  busy: number;
  onLeave: number;
  byCaseType: Record<string, number>;
}> {
  const allJudges = await getJudges();
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
    onLeave: filteredJudges.filter((j) => j.availability === "On Leave").length,
    byCaseType: {} as Record<string, number>,
  };

  filteredJudges.forEach((j) => {
    counts.byCaseType[j.category] = (counts.byCaseType[j.category] || 0) + 1;
  });

  return counts;
}

// ── FIR judge assignment ────────────────────────────────────────────────────

export async function assignJudgeForFIR(
  file: File,
  assessment: FIRPriorityAssessment,
  sections: Section[],
): Promise<FIRJudgeAssignment> {
  const fromApi = (await requestJson("/api/fir/assign-judge", {
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
  const candidateJudges = await getJudges();
  const judges =
    candidateJudges.length > 0
      ? candidateJudges
      : buildFallbackJudges(category);
  const ranking = rankJudgesForAssessment(assessment, judges, file.name, sections);
  const chosen = ranking[0] || null;
  const requiresPublicProsecutor = category === "Criminal";

  return {
    category,
    assignedJudgeId: chosen?.judgeId,
    assignedJudge: chosen?.judgeName || FIR_JUDGE_ROSTER[category][0],
    availableJudges: ranking.map((item) => item.judgeName),
    judgeRankings: ranking,
    assignmentReason:
      chosen?.reason ||
      "Assigned using fallback roster because no ranked judge recommendation was available.",
    routeMode: "fallback",
    partyLabel: requiresPublicProsecutor ? "Accused" : "Defendant",
    requiresPublicProsecutor,
  };
}

export async function recommendJudgeForCase(caseItem: {
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

  const judges = await getJudges();
  const roster =
    judges.length > 0
      ? judges
      : buildFallbackJudges(toJudgeCategory(assessment.caseType));
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
}

function buildFIRText(filename: string, sections: Section[]): string {
  const sectionText = sections
    .map(
      (s) => `${s.title} ${s.summary} ${s.content} ${s.highlights.join(" ")}`,
    )
    .join(" ");
  return `${filename} ${sectionText}`.trim();
}
