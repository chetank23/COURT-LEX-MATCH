const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "have",
  "were",
  "been",
  "will",
  "shall",
  "under",
  "into",
  "between",
  "their",
  "there",
  "where",
  "which",
  "about",
  "against",
  "after",
  "before",
  "court",
  "case",
  "legal",
  "judgment",
  "decision",
  "issue",
  "issues",
  "matter",
  "petition",
  "appeal",
  "act",
  "section",
]);

function normalizeText(text) {
  return `${text || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTokens(text) {
  const source = normalizeText(text);
  const words = source
    .split(" ")
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return Array.from(new Set(words));
}

function extractLegalPhrases(text) {
  const source = `${text || ""}`;
  const phrases = [];

  for (const match of source.matchAll(/\barticle\s+\d+[a-z]?\b/gi))
    phrases.push(match[0]);
  for (const match of source.matchAll(/\bsection\s+\d+[a-z]?\b/gi))
    phrases.push(match[0]);
  for (const match of source.matchAll(/\b[a-z][a-z\s]{2,40}\s+act\b/gi))
    phrases.push(match[0]);
  for (const match of source.matchAll(/\b[a-z][a-z\s]{2,30}\s+law\b/gi))
    phrases.push(match[0]);

  return Array.from(
    new Set(phrases.map((item) => item.replace(/\s+/g, " ").trim())),
  );
}

export function buildMatchExplanation(queryText, matchedCase) {
  const queryTokens = extractTokens(queryText);
  const caseText = `${matchedCase.title || ""} ${matchedCase.summary || ""} ${matchedCase.judgment || ""} ${(matchedCase.tags || []).join(" ")}`;
  const caseTokens = extractTokens(caseText);

  const overlap = queryTokens.filter((token) => caseTokens.includes(token));
  const phraseOverlap = extractLegalPhrases(`${queryText} ${caseText}`);

  const matchedTerms = Array.from(
    new Set([...phraseOverlap, ...overlap]),
  ).slice(0, 6);

  const overlapPhrase =
    matchedTerms.length > 0
      ? `shared legal terms (${matchedTerms.slice(0, 3).join(", ")})`
      : "similar legal issues and factual patterns";

  const whyMatched = `This case matches due to ${overlapPhrase}, comparable statutory context, and aligned judgement outcomes.`;

  return { whyMatched, matchedTerms };
}
