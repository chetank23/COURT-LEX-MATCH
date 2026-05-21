/**
 * RAG and Case Analysis service.
 */

import type { RagQueryResponse, CaseAnalysisReport } from "@/types";
import { requestJson } from "./api";

export async function queryRag(
  query: string,
  topK = 8,
): Promise<RagQueryResponse> {
  const payload = (await requestJson("/api/rag/query", {
    method: "POST",
    body: JSON.stringify({ query, topK }),
  })) as RagQueryResponse | null;

  if (payload) return payload;

  throw new Error(
    "Backend server not running. Start with: npm run dev:server",
  );
}

export async function analyzeCaseContext(
  context: string,
): Promise<CaseAnalysisReport> {
  const fromApi = (await requestJson("/api/case-analysis", {
    method: "POST",
    body: JSON.stringify({ context }),
  })) as CaseAnalysisReport | null;

  if (fromApi) return fromApi;

  throw new Error(
    "Backend server not running. Start with: npm run dev:server",
  );
}
