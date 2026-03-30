const DEFAULT_EMBED_DIMS = 192;
const DEFAULT_CHUNK_WORDS = 110;
const DEFAULT_CHUNK_OVERLAP = 24;

const LEGAL_TERMS = new Set([
  "article",
  "section",
  "act",
  "ipc",
  "crpc",
  "evidence",
  "appeal",
  "petition",
  "writ",
  "injunction",
  "bail",
  "conviction",
  "acquittal",
  "tax",
  "contract",
  "property",
  "inheritance",
  "constitutional",
  "court",
  "judgment",
  "judgement",
  "precedent",
  "fir",
  "tribunal",
]);

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "over",
  "under",
  "about",
  "between",
  "after",
  "before",
  "where",
  "which",
  "what",
  "when",
  "why",
  "how",
  "who",
  "whom",
  "have",
  "has",
  "had",
  "were",
  "was",
  "are",
  "been",
  "being",
  "shall",
  "would",
  "could",
  "should",
  "can",
  "may",
  "might",
  "will",
  "also",
  "than",
  "then",
  "their",
  "there",
  "here",
  "your",
  "best",
  "make",
  "made",
  "using",
  "used",
]);

const LEGAL_SYNONYMS = {
  inheritance: ["succession", "heir", "estate"],
  property: ["title", "ownership", "possession"],
  bail: ["custody", "release"],
  conviction: ["guilty", "sentence"],
  acquittal: ["not", "guilty"],
  writ: ["mandamus", "certiorari", "habeas"],
  contract: ["agreement", "breach", "consideration"],
  tax: ["assessment", "revenue", "gst"],
};

function normalizeText(text) {
  return `${text || ""}`.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTitle(title) {
  return `${title || ""}`
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9. ]/g, "")
    .trim();
}

function cleanChunkText(text) {
  return normalizeText(text)
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\(cid:[^)]+\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLowQualityChunkText(text) {
  const cleaned = cleanChunkText(text).toLowerCase();
  if (!cleaned) return true;
  if (cleaned.length < 70) return true;
  if (cleaned.includes("case title extracted from cited-cases metadata")) return true;
  if (/^decision:\s*\d+\s*cited cases:/i.test(cleaned)) return true;

  const alphaWords = cleaned.split(/\s+/).filter((w) => /[a-z]{3,}/.test(w));
  return alphaWords.length < 10;
}

function isLowQualityPrinciple(text) {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned || cleaned.length < 40) return true;
  if (cleaned.includes("cited cases")) return true;
  if (cleaned.includes("judges:")) return true;
  if ((cleaned.match(/;/g) || []).length >= 3) return true;
  if (!/[a-z]{4,}/.test(cleaned)) return true;
  return false;
}

function extractTokens(text) {
  const words = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return Array.from(new Set(words));
}

function expandQueryTokens(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const related = LEGAL_SYNONYMS[token] || [];
    for (const synonym of related) {
      expanded.add(synonym);
    }
  }
  return expanded;
}

function hashToken(token, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(text, dims = DEFAULT_EMBED_DIMS) {
  const vector = new Float32Array(dims);
  const tokens = extractTokens(text).slice(0, 900);
  for (const token of tokens) {
    const h1 = hashToken(token, 2166136261);
    const h2 = hashToken(token, 16777619);
    vector[h1 % dims] += 1;
    vector[h2 % dims] += 0.45;
  }
  return vector;
}

function vectorNorm(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) {
    sum += vector[i] * vector[i];
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a, b, aNorm, bNorm) {
  if (!aNorm || !bNorm) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }
  return dot / (aNorm * bNorm);
}

function chunkWords(text, chunkSize = DEFAULT_CHUNK_WORDS, overlap = DEFAULT_CHUNK_OVERLAP) {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const chunks = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + chunkSize).join(" ").trim();
    if (chunk.length >= 60) {
      chunks.push(chunk);
    }
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

function isLegalLikeQuery(query) {
  const normalized = normalizeText(query).toLowerCase();
  if (!normalized) return false;
  if (/\b(vs\.?|versus|article\s+\d+|section\s+\d+|fir|ipc|crpc|writ|appeal|petition)\b/.test(normalized)) {
    return true;
  }
  const tokens = extractTokens(normalized);
  return tokens.some((token) => LEGAL_TERMS.has(token));
}

export function buildRagIndex(cases, options = {}) {
  const dims = Number.isFinite(options.dims) ? options.dims : DEFAULT_EMBED_DIMS;
  const chunks = [];

  for (const item of cases || []) {
    const sections = [
      { name: "Summary", text: item.summary || "" },
      { name: "Judgment", text: item.judgment || "" },
      { name: "Context", text: `${item.whyMatch || ""} ${(item.tags || []).join(" ")}` },
    ];

    for (const section of sections) {
      const sectionChunks = chunkWords(section.text);
      for (let i = 0; i < sectionChunks.length; i += 1) {
        const text = sectionChunks[i];
        if (isLowQualityChunkText(text)) continue;
        const vector = embedText(`${item.title || ""} ${text}`, dims);
        const norm = vectorNorm(vector);
        const tokens = extractTokens(text);
        chunks.push({
          id: `rag-${item.id}-${section.name.toLowerCase()}-${i + 1}`,
          caseId: item.id,
          title: item.title,
          court: item.court,
          year: item.year,
          type: item.type,
          finalVerdict: item.finalVerdict || item.final_verdict || "",
          section: section.name,
          text,
          tokens,
          vector,
          norm,
        });
      }
    }
  }

  return {
    dims,
    chunks,
    builtAt: new Date().toISOString(),
  };
}

export function serializeRagIndex(index) {
  const serializedChunks = (index?.chunks || []).map((chunk) => ({
    ...chunk,
    vector: Array.from(chunk.vector || []),
  }));

  return {
    dims: index?.dims || DEFAULT_EMBED_DIMS,
    builtAt: index?.builtAt || new Date().toISOString(),
    chunks: serializedChunks,
  };
}

export function hydrateRagIndex(payload) {
  const dims = Number.isFinite(payload?.dims) ? payload.dims : DEFAULT_EMBED_DIMS;
  const chunks = (payload?.chunks || []).map((chunk) => {
    const vector = new Float32Array(Array.isArray(chunk.vector) ? chunk.vector : []);
    const norm = Number.isFinite(chunk.norm) ? chunk.norm : vectorNorm(vector);
    return {
      ...chunk,
      vector,
      norm,
      tokens: Array.isArray(chunk.tokens) ? chunk.tokens : extractTokens(chunk.text || ""),
    };
  });

  return {
    dims,
    builtAt: payload?.builtAt || new Date().toISOString(),
    chunks,
  };
}

function toExcerpt(text, maxLen = 200) {
  const cleaned = cleanChunkText(text);
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen).trim()}...`;
}

function toSentence(text, maxLen = 180) {
  const excerpt = toExcerpt(text, maxLen);
  if (!excerpt) return "";
  if (/[.!?]$/.test(excerpt)) return excerpt;
  return `${excerpt}.`;
}

function dedupeByTitle(chunks) {
  return [...new Map((chunks || []).map((c) => [cleanTitle(c.title || ""), c])).values()].filter(
    (item) => cleanTitle(item.title || "")
  );
}

function summarizeGroundedAnswer(query, topChunks, sources, cleanContext) {
  if ((topChunks || []).length === 0 || !cleanContext) {
    return "No relevant legal precedents found to answer this query.";
  }

  const issue = toSentence(`The legal issue concerns ${normalizeText(query).toLowerCase()}`, 140);

  const principleCandidates = topChunks
    .filter((chunk) => !isLowQualityChunkText(chunk.text))
    .map((chunk) => toSentence(cleanChunkText(chunk.text).slice(0, 170), 170))
    .filter((line) => !isLowQualityPrinciple(line))
    .filter(Boolean);

  const fallbackPrinciples = [
    "Courts assess the dispute on statutory provisions and fact-specific evidence.",
    "Documentary records and legally admissible proof carry significant weight.",
    "Precedents are applied by aligning material facts with governing principles.",
  ];

  const uniquePrinciples = [];
  const seenPrinciples = new Set();
  for (const principle of [...principleCandidates, ...fallbackPrinciples]) {
    const key = principle.toLowerCase();
    if (seenPrinciples.has(key)) continue;
    seenPrinciples.add(key);
    uniquePrinciples.push(`- ${principle}`);
    if (uniquePrinciples.length >= 3) break;
  }

  const verdict = topChunks.find((item) => item.finalVerdict)?.finalVerdict;
  const conclusion = verdict
    ? toSentence(`Based on the cited precedents, the likely legal inference is: ${cleanChunkText(verdict)}`, 200)
    : "Based on the cited precedents, the likely legal inference depends on proof of key facts and statutory compliance.";

  const citedCases = (sources || [])
    .slice(0, 2)
    .map((item) => `- ${cleanTitle(item.title)}`);

  return [
    "Issue:",
    issue,
    "",
    "Key Legal Principles:",
    uniquePrinciples.join("\n"),
    "",
    "Conclusion:",
    conclusion,
    "",
    "Cited Cases:",
    (citedCases.length > 0 ? citedCases : ["- No high-confidence citation found"]).join("\n"),
  ].join("\n");
}

export function queryRag({ query, index, topK = 8, minScore = 0.22 }) {
  const cleanQuery = normalizeText(query);
  const safeTopK = Number.isFinite(topK) ? Math.min(Math.max(topK, 1), 12) : 8;

  if (!cleanQuery) {
    return {
      query: "",
      answer: "Please provide a legal question to run retrieval-augmented analysis.",
      grounded: false,
      confidence: 0,
      sources: [],
      retrievedChunks: [],
    };
  }

  if (!isLegalLikeQuery(cleanQuery)) {
    return {
      query: cleanQuery,
      answer: "No relevant legal case found for this query.",
      grounded: false,
      confidence: 0,
      sources: [],
      retrievedChunks: [],
    };
  }

  const ragIndex = index || { chunks: [], dims: DEFAULT_EMBED_DIMS };
  const queryVec = embedText(cleanQuery, ragIndex.dims || DEFAULT_EMBED_DIMS);
  const queryNorm = vectorNorm(queryVec);
  const queryTokens = extractTokens(cleanQuery);
  const expandedTokens = expandQueryTokens(queryTokens);

  const safeMinScore = Number.isFinite(minScore) ? Math.max(0.12, Math.min(0.6, minScore)) : 0.22;

  const candidatePool = (ragIndex.chunks || [])
    .map((chunk) => {
      const cosine = Math.max(0, cosineSimilarity(queryVec, chunk.vector, queryNorm, chunk.norm));
      const tokens = chunk.tokens || [];
      const overlapCount = tokens.reduce((acc, token) => (expandedTokens.has(token) ? acc + 1 : acc), 0);
      const keywordOverlap = expandedTokens.size > 0 ? overlapCount / expandedTokens.size : 0;
      const titleOverlap = queryTokens.reduce(
        (acc, token) => (`${chunk.title || ""}`.toLowerCase().includes(token) ? acc + 1 : acc),
        0
      );
      const titleBoost = queryTokens.length > 0 ? titleOverlap / queryTokens.length : 0;
      const sectionWeight = chunk.section === "Judgment" ? 1 : chunk.section === "Summary" ? 0.92 : 0.85;
      const score = (cosine * 0.68 + keywordOverlap * 0.24 + titleBoost * 0.08) * sectionWeight;
      return {
        ...chunk,
        score,
      };
    })
    .filter((item) => item.score >= safeMinScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(safeTopK * 6, 24));

  const perCaseLimit = 2;
  const caseCounter = new Map();
  const diverseScored = [];

  for (const candidate of candidatePool) {
    if (diverseScored.length >= safeTopK) break;
    const count = caseCounter.get(candidate.caseId) || 0;
    if (count >= perCaseLimit) continue;
    caseCounter.set(candidate.caseId, count + 1);
    diverseScored.push(candidate);
  }

  const topChunks = diverseScored.filter((c) => c.score > 0.4).slice(0, 3);
  const scored = topChunks.length > 0 ? topChunks : diverseScored.slice(0, 3);

  if (scored.length === 0) {
    return {
      query: cleanQuery,
      answer: "No relevant legal case found for this query.",
      grounded: false,
      confidence: 0,
      sources: [],
      retrievedChunks: [],
    };
  }

  const uniqueCases = dedupeByTitle(scored);

  const grouped = new Map();
  for (const chunk of uniqueCases) {
    const previous = grouped.get(chunk.caseId);
    if (!previous || chunk.score > previous.score) {
      grouped.set(chunk.caseId, chunk);
    }
  }

  const sources = Array.from(grouped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => ({
      caseId: entry.caseId,
      title: cleanTitle(entry.title),
      court: entry.court,
      year: entry.year,
      type: entry.type,
      finalVerdict: entry.finalVerdict,
      section: entry.section,
      score: Number(entry.score.toFixed(4)),
      excerpt: `${toExcerpt(entry.text, 240)}`,
    }));

  const cleanContext = scored
    .map((c) => cleanChunkText(c.text).slice(0, 500))
    .filter(Boolean)
    .join("\n\n");

  const topScores = scored.slice(0, Math.min(3, scored.length)).map((item) => item.score);
  const averageTop = topScores.reduce((acc, n) => acc + n, 0) / Math.max(1, topScores.length);
  const sourceCoverage = Math.min(1, sources.length / Math.max(1, Math.min(5, safeTopK)));
  const confidence = Math.min(99, Math.max(40, Math.round((averageTop * 0.9 + sourceCoverage * 0.1) * 100)));

  return {
    query: cleanQuery,
    answer: summarizeGroundedAnswer(cleanQuery, scored, sources, cleanContext),
    grounded: true,
    confidence,
    sources,
    retrievedChunks: scored.map((item) => ({
      chunkId: item.id,
      caseId: item.caseId,
      score: Number(item.score.toFixed(4)),
      section: item.section,
      text: cleanChunkText(item.text).slice(0, 500),
    })),
  };
}
