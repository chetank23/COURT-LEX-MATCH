import { describe, expect, test } from "vitest";
import { generateSummary } from "../../server/services/summarizer.mjs";
import { mapJudgement } from "../../server/services/judgementMapper.mjs";

describe("summarizer", () => {
  test("creates concise plain-English summary", () => {
    const input = "Issues: Section 4 in the Inter-State Water Disputes Act, 1956. Decision: The court held that ownership rights must be decided using statutory interpretation and family inheritance rules. The petition was allowed.";
    const result = generateSummary(input);

    expect(result.length).toBeGreaterThan(40);
    expect(result.length).toBeLessThan(430);
    expect(result.toLowerCase()).toContain("court");
  });
});

describe("judgement mapper", () => {
  test("maps numeric decision marker 1", () => {
    expect(mapJudgement("1")).toBe("Case Allowed / In Favor");
  });

  test("maps numeric decision marker 0", () => {
    expect(mapJudgement("0")).toBe("Case Dismissed / Rejected");
  });
});
