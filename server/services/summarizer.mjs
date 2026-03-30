const NOISE_PATTERNS = [
  /\bissues?\s*:/gi,
  /\bdecision\s*:/gi,
  /\bjudg(?:e)?ment\s*:/gi,
  /\bsection\s+\d+[a-z]?\b/gi,
  /\barticle\s+\d+[a-z]?\b/gi,
  /\bact\s*,?/gi,
  /\s{2,}/g,
];

function normalizeCaseText(caseText) {
  let text = `${caseText || ""}`.replace(/\u0000/g, " ");
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 25);
}

function scoreSentence(sentence) {
  const source = sentence.toLowerCase();
  let score = 0;

  if (/dispute|conflict|appeal|petition|ownership|inheritance|criminal|civil/.test(source)) score += 3;
  if (/court|judge|bench|ruled|held|decided|order/.test(source)) score += 3;
  if (/rights|liability|property|contract|evidence|remedy/.test(source)) score += 2;

  return score;
}

export function generateSummary(caseText) {
  const normalized = normalizeCaseText(caseText);
  if (!normalized) {
    return "This case concerns a legal dispute reviewed by the court. The final outcome was decided after assessing the key facts and applicable law.";
  }

  const sentences = splitSentences(normalized);
  if (sentences.length === 0) {
    return normalized.slice(0, 260);
  }

  const selected = sentences
    .map((sentence) => ({ sentence, score: scoreSentence(sentence) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.sentence);

  const ordered = selected.length > 0 ? selected : sentences.slice(0, 3);
  return ordered.join(" ").slice(0, 420).trim();
}
