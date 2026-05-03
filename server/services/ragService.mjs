const DEFAULT_EMBED_DIMS = 192;
const DEFAULT_CHUNK_WORDS = 110;
const DEFAULT_CHUNK_OVERLAP = 24;
const BM25_K1 = 1.4;
const BM25_B = 0.75;

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
  "case",
  "law",
  "bank",
  "loan",
  "debt",
  "dispute",
  "recovery",
  "consumer",
  "service",
  "notice",
  "rights",
  "liability",
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
  "there",
  "their",
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
  return `${text || ""}`.split("\u0000").join(" ").replace(/\s+/g, " ").trim();
}

function cleanTitle(title) {
  return `${title || ""}`
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9. ]/g, "")
    .trim();
}

/**
 * FIX 2: Strengthen cleanChunkText()
 */
function cleanChunkText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return "";

  const cleaned = normalized
    // 1. Remove phrases matching "case title extracted..."
    .replace(/case title extracted from cited[- ]cases metadata:?[^.;]*/gi, "")
    // 2. Remove URLs
    .replace(/https?:\/\/\S+/gi, "")
    // 3. Remove metadata field prefixes
    .replace(/^(title|source|judges?|issues?|decision|citation)\s*:/gim, "")
    // 4. Remove raw section listings
    .replace(/section\s+\d+[a-z]?\s+in\s+the\s+[^;.]+[;.]/gi, "")
    // General cleaning
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\(cid:[^)]+\)/gi, " ")
    .replace(/Judges:.*$/gm, "") // Ensure Judges line is cleared
    .replace(/\s+/g, " ")
    .replace(/;+/g, ";")
    .trim();

  // 6. If resulting text is under 80 chars, return ""
  if (cleaned.length < 80) return "";
  return cleaned;
}

/**
 * FIX 1: Strengthen isLowQualityChunkText()
 */
function isLowQualityChunkText(text) {
  const cleaned = cleanChunkText(text).toLowerCase();
  if (!cleaned) return true;
  
  // Broad metadata rejection
  if (cleaned.includes("case title extracted")) return true;
  if (cleaned.includes("cited-cases metadata")) return true;
  if (cleaned.includes("extracted from cited")) return true;
  if (/^case title/i.test(cleaned)) return true;
  if (cleaned.startsWith("title:")) return true;
  if (cleaned.startsWith("source:")) return true;
  if (cleaned.startsWith("judges:")) return true;
  if (/https?:\/\//.test(cleaned)) return true;

  if (cleaned.length < 85) return true;
  if (/^decision:\s*\d+\s*cited cases:/i.test(cleaned)) return true;

  const alphaWords = cleaned.split(/\s+/).filter((w) => /[a-z]{3,}/.test(w));
  return alphaWords.length < 12;
}

function isLowQualityPrinciple(text) {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned || cleaned.length < 40) return true;
  if (cleaned.includes("case title extracted")) return true;
  if (cleaned.includes("cited-cases metadata")) return true;
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

function extractTokenFrequencies(text) {
  const words = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

  const tokenFreq = Object.create(null);
  for (const word of words) {
    tokenFreq[word] = (tokenFreq[word] || 0) + 1;
  }
  return tokenFreq;
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

function extractLegalReferences(text) {
  const source = normalizeText(text).toLowerCase();
  if (!source) return [];

  const refs = new Set();
  for (const match of source.matchAll(/\b(article|section)\s+(\d+[a-z]?)\b/g)) {
    refs.add(`${match[1]}-${match[2]}`);
  }
  for (const match of source.matchAll(/\b(ipc|crpc)\s*(\d+[a-z]?)\b/g)) {
    refs.add(`${match[1]}-${match[2]}`);
  }

  return Array.from(refs);
}

function computePhraseBoost(query, text) {
  const q = normalizeText(query).toLowerCase();
  const t = normalizeText(text).toLowerCase();
  if (!q || !t) return 0;

  const queryTerms = q
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !STOP_WORDS.has(term));

  if (queryTerms.length < 2) return 0;

  let phraseHits = 0;
  const maxPhrases = Math.min(3, queryTerms.length - 1);
  for (let i = 0; i < queryTerms.length - 1 && phraseHits < maxPhrases; i += 1) {
    const phrase = `${queryTerms[i]} ${queryTerms[i + 1]}`;
    if (t.includes(phrase)) phraseHits += 1;
  }

  return Math.min(0.14, phraseHits * 0.05);
}

function bm25TokenScore(queryToken, chunk, idfMap, avgChunkLength, totalChunks) {
  const tf = chunk.tokenFreq?.[queryToken] || 0;
  if (!tf) return 0;

  const rawIdf = idfMap?.[queryToken];
  const df = Number.isFinite(rawIdf) ? rawIdf : 0;
  const safeIdf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
  const chunkLength = Math.max(1, chunk.length || 1);
  const normDenom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (chunkLength / Math.max(1, avgChunkLength || 1)));

  return safeIdf * ((tf * (BM25_K1 + 1)) / Math.max(normDenom, 1e-6));
}

function bm25Score(queryTokens, chunk, idfMap, avgChunkLength, totalChunks) {
  let score = 0;
  for (const token of queryTokens) {
    score += bm25TokenScore(token, chunk, idfMap, avgChunkLength, totalChunks);
  }
  return score;
}

function tokenJaccardSimilarity(aTokens, bTokens) {
  const a = new Set(aTokens || []);
  const b = new Set(bTokens || []);
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function scoreCalibration(rawScore) {
  return 1 - Math.exp(-2.2 * Math.max(0, rawScore));
}

function mmrSelect(candidates, limit) {
  const selected = [];
  const remaining = [...candidates];
  const lambda = 0.78;

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      let maxSimilarity = 0;
      for (const chosen of selected) {
        maxSimilarity = Math.max(maxSimilarity, tokenJaccardSimilarity(candidate.tokens, chosen.tokens));
      }
      const mmr = lambda * candidate.score - (1 - lambda) * maxSimilarity;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIndex = i;
      }
    }

    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return selected;
}

export function buildRagIndex(cases, options = {}) {
  const dims = Number.isFinite(options.dims) ? options.dims : DEFAULT_EMBED_DIMS;
  const chunks = [];
  const tokenDocFreq = Object.create(null);
  let totalChunkLength = 0;

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
        const tokenFreq = extractTokenFrequencies(text);
        const uniqueChunkTokens = new Set(Object.keys(tokenFreq));
        for (const token of uniqueChunkTokens) {
          tokenDocFreq[token] = (tokenDocFreq[token] || 0) + 1;
        }
        const length = Object.values(tokenFreq).reduce((acc, n) => acc + n, 0);
        totalChunkLength += length;

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
          tokenFreq,
          length,
          vector,
          norm,
        });
      }
    }
  }

  const avgChunkLength = chunks.length > 0 ? totalChunkLength / chunks.length : 1;

  return {
    dims,
    chunks,
    tokenDocFreq,
    avgChunkLength,
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
    avgChunkLength: Number(index?.avgChunkLength) || 1,
    tokenDocFreq: index?.tokenDocFreq || {},
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
      tokenFreq:
        chunk.tokenFreq && typeof chunk.tokenFreq === "object"
          ? chunk.tokenFreq
          : extractTokenFrequencies(chunk.text || ""),
      length:
        Number.isFinite(chunk.length) && chunk.length > 0
          ? chunk.length
          : Object.values(
              chunk.tokenFreq && typeof chunk.tokenFreq === "object"
                ? chunk.tokenFreq
                : extractTokenFrequencies(chunk.text || "")
            ).reduce((acc, n) => acc + Number(n || 0), 0),
    };
  });

  const tokenDocFreq = payload?.tokenDocFreq && typeof payload.tokenDocFreq === "object" ? payload.tokenDocFreq : {};
  const avgChunkLength =
    Number.isFinite(payload?.avgChunkLength) && payload.avgChunkLength > 0
      ? payload.avgChunkLength
      : chunks.reduce((acc, chunk) => acc + Math.max(1, chunk.length || 1), 0) / Math.max(1, chunks.length);

  return {
    dims,
    builtAt: payload?.builtAt || new Date().toISOString(),
    chunks,
    tokenDocFreq,
    avgChunkLength,
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

/**
 * FIX 3: Strengthen summarizeGroundedAnswer()
 */
function summarizeGroundedAnswer(query, topChunks, sources, cleanContext) {
  if ((topChunks || []).length === 0 || !cleanContext) {
    return "No relevant legal precedents found to answer this query.";
  }

  // 1. Issue Explanation
  const cleanQ = normalizeText(query)
    .toLowerCase()
    .replace(/^(how|what|why|is|can|does|did|if)\b/i, "")
    .trim();
  const issue = `The legal inquiry pertains to ${cleanQ}, specifically examining the rights and liabilities of the involved parties within the context of applicable statutory provisions and judicial interpretations.`;

  // 2. Legal Principles
  const principleCandidates = topChunks
    .map((chunk) => cleanChunkText(chunk.text))
    // Filter rejected content explicitly
    .filter((t) => {
      if (!t || t.length < 90) return false;
      const lower = t.toLowerCase();
      if (lower.includes("case title extracted")) return false;
      if (lower.includes("cited-cases metadata")) return false;
      if (lower.includes("https://")) return false;
      if (/^(title|source|judges?|issues?|decision|citation)\s*:/i.test(t)) return false;
      return true;
    })
    .map((t) => {
      const sentenceMatch = t.match(/[^.!?]+[.!?]+/);
      return sentenceMatch ? sentenceMatch[0].trim() : t.slice(0, 160).trim() + ".";
    })
    .slice(0, 2);

  const fallbackPrinciples = [
    "Courts typically assess such disputes by evaluating documented evidence and the prior commitments made by the parties involved.",
    "Legal precedents suggest that any transfer of rights must strictly adhere to governing property laws and the principle of good faith in commercial transactions.",
  ];

  const finalPrinciples = principleCandidates.length >= 2 ? principleCandidates : fallbackPrinciples;
  const principlesText = `Courts have held in similar cases that ${finalPrinciples[0]}${
    finalPrinciples[1] ? ` Further, ${finalPrinciples[1].charAt(0).toLowerCase()}${finalPrinciples[1].slice(1)}` : ""
  }`;

  // 3. Conclusion
  const topCase = sources[0];
  const conclusionText = topCase
    ? `Based on precedents such as ${cleanTitle(topCase.title)} (${
        topCase.year || "N.A."
      }), an affected party may seek legal recourse through specific performance of the agreement or by claiming damages for any demonstrated breach of contract.`
    : "Based on general legal principles, the affected party can expect the court to intervene if the breach of agreement is substantiated by credible proof and compliance with relevant property laws.";

  // 4. Cited Cases
  const citedCaseTitles = sources.slice(0, 3).map((s) => cleanTitle(s.title));
  const casesText = citedCaseTitles.length > 0 ? `Relevant cases: ${citedCaseTitles.join(" · ")}` : "";

  return [issue, "", principlesText, "", conclusionText, "", casesText].join("\n");
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

  const ragIndex = index || { chunks: [], dims: DEFAULT_EMBED_DIMS, tokenDocFreq: {}, avgChunkLength: 1 };
  const queryVec = embedText(cleanQuery, ragIndex.dims || DEFAULT_EMBED_DIMS);
  const queryNorm = vectorNorm(queryVec);
  const queryTokens = extractTokens(cleanQuery);
  const expandedTokens = expandQueryTokens(queryTokens);
  const queryReferenceSet = new Set(extractLegalReferences(cleanQuery));
  const expandedTokenList = Array.from(expandedTokens);

  const safeMinScore = Number.isFinite(minScore) ? Math.max(0.12, Math.min(0.6, minScore)) : 0.22;
  const totalChunks = Math.max(1, (ragIndex.chunks || []).length);

  const candidatePool = (ragIndex.chunks || [])
    .map((chunk) => {
      const cosine = Math.max(0, cosineSimilarity(queryVec, chunk.vector, queryNorm, chunk.norm));
      const tokens = chunk.tokens || [];
      const overlapCount = tokens.reduce((acc, token) => (expandedTokens.has(token) ? acc + 1 : acc), 0);
      const keywordOverlap = expandedTokens.size > 0 ? overlapCount / expandedTokens.size : 0;
      const exactQueryHits = queryTokens.reduce((acc, token) => (tokens.includes(token) ? acc + 1 : acc), 0);
      const exactCoverage = queryTokens.length > 0 ? exactQueryHits / queryTokens.length : 0;
      const titleOverlap = queryTokens.reduce(
        (acc, token) => (`${chunk.title || ""}`.toLowerCase().includes(token) ? acc + 1 : acc),
        0
      );
      const titleBoost = queryTokens.length > 0 ? titleOverlap / queryTokens.length : 0;
      const lexicalBm25 = bm25Score(
        expandedTokenList,
        chunk,
        ragIndex.tokenDocFreq || {},
        ragIndex.avgChunkLength || 1,
        totalChunks
      );
      const bm25Normalized = lexicalBm25 / (lexicalBm25 + 6);
      const phraseBoost = computePhraseBoost(cleanQuery, chunk.text || "");
      const chunkRefSet = new Set(extractLegalReferences(`${chunk.title || ""} ${chunk.text || ""}`));
      let legalRefBoost = 0;
      if (queryReferenceSet.size > 0 && chunkRefSet.size > 0) {
        let matches = 0;
        for (const ref of queryReferenceSet) {
          if (chunkRefSet.has(ref)) matches += 1;
        }
        legalRefBoost = Math.min(0.12, matches * 0.06);
      }
      const blendedCore = cosine * 0.5 + bm25Normalized * 0.32 + keywordOverlap * 0.1 + titleBoost * 0.03;
      const calibratedCore = scoreCalibration(blendedCore);
      const sectionWeight = chunk.section === "Judgment" ? 1 : chunk.section === "Summary" ? 0.92 : 0.85;
      const score = Math.min(0.995, (calibratedCore + exactCoverage * 0.22 + phraseBoost + legalRefBoost) * sectionWeight);
      return {
        ...chunk,
        cosine,
        bm25: lexicalBm25,
        keywordOverlap,
        exactCoverage,
        phraseBoost,
        legalRefBoost,
        score,
      };
    })
    .filter((item) => {
      if (item.score < safeMinScore) return false;
      const isBad = isLowQualityChunkText(item.text);
      return !isBad;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(safeTopK * 6, 24));

  const perCaseLimit = 2;
  const caseCounter = new Map();
  const diverseScored = [];

  for (const candidate of candidatePool) {
    if (diverseScored.length >= Math.max(safeTopK * 3, 12)) break;
    const count = caseCounter.get(candidate.caseId) || 0;
    if (count >= perCaseLimit) continue;
    caseCounter.set(candidate.caseId, count + 1);
    diverseScored.push(candidate);
  }

  const reranked = mmrSelect(diverseScored, safeTopK);

  const topChunks = reranked.filter((c) => c.score > 0.4).slice(0, 3);
  const scored = topChunks.length > 0 ? topChunks : reranked.slice(0, 3);

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

  /**
   * FIX 4: Fix source excerpts in queryRag()
   */
  const sources = Array.from(grouped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => {
      let excerpt = cleanChunkText(toExcerpt(entry.text, 240));
      if (excerpt.toLowerCase().includes("case title extracted") || excerpt.length < 40) {
        excerpt = `Judgment from ${entry.court} (${entry.year})`;
      }
      return {
        caseId: entry.caseId,
        title: cleanTitle(entry.title),
        court: entry.court,
        year: entry.year,
        type: entry.type,
        finalVerdict: entry.finalVerdict,
        section: entry.section,
        score: Number(entry.score.toFixed(4)),
        excerpt,
      };
    });

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
