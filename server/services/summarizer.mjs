/**
 * summarizer.mjs — Generates clean, human-readable summaries from raw case text.
 * Strips all metadata artifacts (Cited Cases dicts, Decision: 0/1, Issues: prefixes,
 * semicolon-delimited section references) and produces coherent prose.
 */

const NOISE_PATTERNS = [
  // Remove "Cited Cases: { ... }" blocks (including multiline dict content)
  /Cited\s+Cases\s*:\s*\{[^}]*\}?/gi,
  // Remove "Decision: 0" or "Decision: 1" or "Decision: 1.0"
  /\bDecision\s*:\s*[01](?:\.0)?\b/gi,
  // Remove "Judges: ..." until end-of-line or next label
  /\bJudges?\s*:\s*[^\n;]*/gi,
  // Remove "Issues:" label (we keep the content but not the label)
  /\bIssues?\s*:\s*/gi,
  // Remove "filter:" labels
  /\bfilter\s*:\s*[^;]*/gi,
  // Remove raw score values like ': 1.0' or ': 0.8'
  /'\s*:\s*\d+\.?\d*/g,
  // Remove leftover dict brackets and quotes
  /[{}[\]]/g,
  // Remove orphan single quotes from dict keys
  /'\s*,\s*'/g,
  // Clean excess whitespace
  /\s{2,}/g,
];

/** Patterns that indicate a sentence is just metadata, not real content */
const JUNK_SENTENCE_PATTERNS = [
  /^in\s+the\s+\w+.*?\d{4}\s*$/i, // "in The Delhi Rent 1995"
  /cited\s+cases/i,
  /^\s*decision\s*:\s*\d/i,
  /^\s*\d+\s*$/,               // just a number
  /^\s*[{}'":,\d.\s]+\s*$/,    // just dict-like content
  /^c-\w?\]\s*/i,              // leftover dict key fragments like "c-d]"
  /^\s*filter\s*:/i,
];

function isJunkSentence(sentence) {
  const trimmed = sentence.trim();
  if (trimmed.length < 15) return true;
  return JUNK_SENTENCE_PATTERNS.some((p) => p.test(trimmed));
}

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
    .filter((line) => line.length > 25 && !isJunkSentence(line));
}

function scoreSentence(sentence) {
  const source = sentence.toLowerCase();
  let score = 0;

  if (
    /dispute|conflict|appeal|petition|ownership|inheritance|criminal|civil/.test(
      source,
    )
  )
    score += 3;
  if (/court|judge|bench|ruled|held|decided|order/.test(source)) score += 3;
  if (/rights|liability|property|contract|evidence|remedy/.test(source))
    score += 2;
  // Penalize sentences that still smell like metadata
  if (/\b\d+\.\d+\b/.test(source)) score -= 2; // floating point numbers
  if (/v\.\s/.test(source) && source.split(/v\./).length > 3) score -= 2; // too many case names

  return score;
}

export function generateSummary(caseText) {
  const normalized = normalizeCaseText(caseText);
  if (!normalized || normalized.length < 20) {
    return "This case concerns a legal dispute reviewed by the court. The final outcome was decided after assessing the key facts and applicable law.";
  }

  const sentences = splitSentences(normalized);
  if (sentences.length === 0) {
    // Even after cleaning, no good sentences — use generic fallback
    const cleaned = normalized.slice(0, 260).replace(/[{}'"]/g, "").trim();
    if (cleaned.length < 30) {
      return "This case concerns a legal dispute reviewed by the court. The final outcome was decided after assessing the key facts and applicable law.";
    }
    return cleaned;
  }

  const selected = sentences
    .map((sentence) => ({ sentence, score: scoreSentence(sentence) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.sentence);

  const ordered = selected.length > 0 ? selected : sentences.slice(0, 3);
  return ordered.join(" ").slice(0, 420).trim();
}
