const VERDICT_RULES = [
  {
    label: "Case Allowed / In Favor",
    pattern:
      /\b(allowed|granted|in favor|successful|petition allowed|appeal allowed)\b/i,
  },
  {
    label: "Case Dismissed / Rejected",
    pattern: /\b(dismissed|rejected|declined|denied|failed)\b/i,
  },
  {
    label: "Conviction Recorded",
    pattern: /\b(convicted|found guilty|sentenced)\b/i,
  },
  { label: "Acquittal Recorded", pattern: /\b(acquitted|not guilty)\b/i },
];

function normalize(text) {
  return `${text || ""}`.replace(/\s+/g, " ").trim();
}

export function mapJudgement(rawJudgment, summary = "") {
  const value = normalize(rawJudgment);
  if (!value) return "Judgement unavailable";

  if (/^(1|1\.0)$/.test(value) || /\bdecision\s*:\s*1(?:\.0)?\b/i.test(value)) {
    return "Case Allowed / In Favor";
  }

  if (/^(0|0\.0)$/.test(value) || /\bdecision\s*:\s*0(?:\.0)?\b/i.test(value)) {
    return "Case Dismissed / Rejected";
  }

  for (const rule of VERDICT_RULES) {
    if (rule.pattern.test(value)) {
      return rule.label;
    }
  }

  if (/\ballowed|granted\b/i.test(summary)) return "Case Allowed / In Favor";
  if (/\bdismissed|rejected\b/i.test(summary))
    return "Case Dismissed / Rejected";

  return "Judgement reserved / Mixed outcome";
}
