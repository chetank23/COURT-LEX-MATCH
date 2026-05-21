/**
 * History service — local-storage persistence + server sync for the
 * user activity timeline (searches, PDF uploads, case views).
 */

import type { TimelineEvent } from "@/types";
import { fetchJson, requestJson } from "./api";

const LOCAL_HISTORY_KEY = "courtcaseai.activity.history.v1";

// ── Local-storage helpers ───────────────────────────────────────────────────

export function getLocalHistory(): TimelineEvent[] {
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
}

export function setLocalHistory(events: TimelineEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCAL_HISTORY_KEY,
      JSON.stringify(events.slice(0, 100)),
    );
  } catch {
    // Ignore storage failures — keep app flow intact.
  }
}

export function appendLocalHistory(input: {
  type: TimelineEvent["type"];
  title: string;
  results?: number;
}): void {
  if (!input.title.trim()) return;
  const current = getLocalHistory();
  const event: TimelineEvent = {
    id: `hist-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    title: input.title,
    date: new Date().toISOString(),
    ...(typeof input.results === "number" ? { results: input.results } : {}),
  };
  setLocalHistory([event, ...current]);
}

// ── API-backed methods ──────────────────────────────────────────────────────

export async function getActivityHistory(): Promise<TimelineEvent[]> {
  const fromApi = (await fetchJson("/api/history")) as TimelineEvent[] | null;
  if (fromApi && Array.isArray(fromApi) && fromApi.length > 0) return fromApi;
  return getLocalHistory();
}

export async function saveSearch(
  query: string,
  results: number,
): Promise<void> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return;

  const response = await requestJson("/api/history/search", {
    method: "POST",
    body: JSON.stringify({ query: normalizedQuery, results }),
  });

  if (!response) {
    appendLocalHistory({
      type: "search",
      title: normalizedQuery,
      results: Number.isFinite(results) ? Math.max(0, results) : 0,
    });
  }
}

export async function savePDFUpload(
  filename: string,
  matchesFound: number,
): Promise<void> {
  const normalizedFilename = filename.trim();
  if (!normalizedFilename) return;

  const response = await requestJson("/api/history/upload", {
    method: "POST",
    body: JSON.stringify({ filename: normalizedFilename, matchesFound }),
  });

  if (!response) {
    appendLocalHistory({
      type: "upload",
      title: normalizedFilename,
      results: Number.isFinite(matchesFound) ? Math.max(0, matchesFound) : 0,
    });
  }
}

export async function saveViewedCase(
  caseId: string,
  caseTitle: string,
): Promise<void> {
  const normalizedTitle = caseTitle.trim();
  if (!normalizedTitle) return;

  const response = await requestJson("/api/history/view", {
    method: "POST",
    body: JSON.stringify({ caseId, caseTitle }),
  });

  if (!response) {
    appendLocalHistory({ type: "view", title: normalizedTitle });
  }
}
