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
 * FIX 1 (strengthened): cleanChunkText() — aggressive metadata stripping.
 */
function cleanChunkText(text) {
  let t = normalizeText(text);
  if (!t) return "";

  // Step 1 — Remove "Decision: 0" / "Decision: <number>" raw numeric tags
  t = t.replace(/decision\s*:\s*\d+/gi, "");

  // Step 2 — Collapse semicolon-heavy metadata lists:
  //   If 2+ semicolons present, keep only segments that contain real legal prose.
  if ((t.match(/;/g) || []).length >= 2) {
    const parts = t
      .split(";")
      .map((p) => p.trim())
      .filter(
        (p) =>
          p.length > 40 &&
          /\b(court|held|ruled|judgment|plaintiff|defendant|appeal|petition|order|relief|tribunal|bench|decision|convicted|acquitted|dismissed|allowed)\b/i.test(
            p,
          ),
      );
    t = parts.join(". ");
  }

  // Step 3 — Remove bare section references with no surrounding prose context
  t = t.replace(
    /\bsection\s+\d+[a-z]?\s+(?:of\s+)?[\w\s]{0,30}(?:act|code|cpc|crpc)\s*[;,]?/gi,
    "",
  );

  // Step 4 — Remove "Order [roman/arabic] Rule [number]" patterns
  t = t.replace(/\border\s+[ivxlcdm\d]+\s+rule\s+\d+/gi, "");

  // Step 5 — Remove "filter: <term>" labels
  t = t.replace(/\bfilter\s*:\s*[\w\s]+/gi, "");

  // Legacy passes (preserved from earlier fix)
  t = t
    .replace(/case title extracted from cited[- ]cases metadata:?[^.;]*/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^(title|source|judges?|issues?|decision|citation)\s*:/gim, "")
    .replace(/section\s+\d+[a-z]?\s+in\s+the\s+[^;.]+[;.]/gi, "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\(cid:[^)]+\)/gi, " ")
    .replace(/Judges:.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/;+/g, ";")
    .trim();

  // Step 6 — Minimum length gate (tightened to 60)
  if (t.length < 60) return "";
  return t;
}

/**
 * FIX 2 (strengthened): isLowQualityChunkText() — rejects metadata-heavy chunks.
 */
function isLowQualityChunkText(text) {
  const raw = normalizeText(text).toLowerCase();
  if (!raw) return true;

  // FIX 2a — Reject semicolon-heavy text (≥3 semicolons = raw metadata list)
  if ((raw.match(/;/g) || []).length >= 3) return true;

  // FIX 2b — Reject raw "Decision: <number>" lines
  if (/decision\s*:\s*\d/i.test(raw)) return true;

  // FIX 2c — Reject text dominated by section references (>3 = bare section list)
  if ((raw.match(/\bsection\b/gi) || []).length > 3) return true;

  const cleaned = cleanChunkText(text).toLowerCase();
  if (!cleaned) return true;

  // Broad metadata rejection (preserved)
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

function chunkWords(
  text,
  chunkSize = DEFAULT_CHUNK_WORDS,
  overlap = DEFAULT_CHUNK_OVERLAP,
) {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const chunks = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let i = 0; i < words.length; i += step) {
    const chunk = words
      .slice(i, i + chunkSize)
      .join(" ")
      .trim();
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
  if (
    /\b(vs\.?|versus|article\s+\d+|section\s+\d+|fir|ipc|crpc|writ|appeal|petition)\b/.test(
      normalized,
    )
  ) {
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
  for (
    let i = 0;
    i < queryTerms.length - 1 && phraseHits < maxPhrases;
    i += 1
  ) {
    const phrase = `${queryTerms[i]} ${queryTerms[i + 1]}`;
    if (t.includes(phrase)) phraseHits += 1;
  }

  return Math.min(0.14, phraseHits * 0.05);
}

function bm25TokenScore(
  queryToken,
  chunk,
  idfMap,
  avgChunkLength,
  totalChunks,
) {
  const tf = chunk.tokenFreq?.[queryToken] || 0;
  if (!tf) return 0;

  const rawIdf = idfMap?.[queryToken];
  const df = Number.isFinite(rawIdf) ? rawIdf : 0;
  const safeIdf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
  const chunkLength = Math.max(1, chunk.length || 1);
  const normDenom =
    tf +
    BM25_K1 *
      (1 - BM25_B + BM25_B * (chunkLength / Math.max(1, avgChunkLength || 1)));

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
        maxSimilarity = Math.max(
          maxSimilarity,
          tokenJaccardSimilarity(candidate.tokens, chosen.tokens),
        );
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
  const dims = Number.isFinite(options.dims)
    ? options.dims
    : DEFAULT_EMBED_DIMS;
  const chunks = [];
  const tokenDocFreq = Object.create(null);
  let totalChunkLength = 0;

  for (const item of cases || []) {
    const sections = [
      { name: "Summary", text: item.summary || "" },
      { name: "Judgment", text: item.judgment || "" },
      {
        name: "Context",
        text: `${item.whyMatch || ""} ${(item.tags || []).join(" ")}`,
      },
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

  const avgChunkLength =
    chunks.length > 0 ? totalChunkLength / chunks.length : 1;

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
  const dims = Number.isFinite(payload?.dims)
    ? payload.dims
    : DEFAULT_EMBED_DIMS;
  const chunks = (payload?.chunks || []).map((chunk) => {
    const vector = new Float32Array(
      Array.isArray(chunk.vector) ? chunk.vector : [],
    );
    const norm = Number.isFinite(chunk.norm) ? chunk.norm : vectorNorm(vector);
    return {
      ...chunk,
      vector,
      norm,
      tokens: Array.isArray(chunk.tokens)
        ? chunk.tokens
        : extractTokens(chunk.text || ""),
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
                : extractTokenFrequencies(chunk.text || ""),
            ).reduce((acc, n) => acc + Number(n || 0), 0),
    };
  });

  const tokenDocFreq =
    payload?.tokenDocFreq && typeof payload.tokenDocFreq === "object"
      ? payload.tokenDocFreq
      : {};
  const avgChunkLength =
    Number.isFinite(payload?.avgChunkLength) && payload.avgChunkLength > 0
      ? payload.avgChunkLength
      : chunks.reduce((acc, chunk) => acc + Math.max(1, chunk.length || 1), 0) /
        Math.max(1, chunks.length);

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
  return [
    ...new Map(
      (chunks || []).map((c) => [cleanTitle(c.title || ""), c]),
    ).values(),
  ].filter((item) => cleanTitle(item.title || ""));
}

// ── Helpers for structured legal analysis ────────────────────────────────

/**
 * Detect case type from combined query + chunk text.
 */
function detectCaseType(query, chunkTexts) {
  const source = `${query} ${chunkTexts.join(" ")}`.toLowerCase();
  if (
    /murder|ipc|bail|fir|arrest|crpc|criminal|ndps|sentenc|convict|acquit|accused/.test(
      source,
    )
  )
    return "Criminal";
  if (
    /article\s+\d+|fundamental rights|writ|habeas|mandamus|constitution|directive/.test(
      source,
    )
  )
    return "Constitutional";
  if (/tax|gst|income.?tax|vat|excise|customs|revenue|assessment/.test(source))
    return "Tax";
  if (
    /labour|labor|employment|industrial|workmen|wages|service matter|termination/.test(
      source,
    )
  )
    return "Service/Labour";
  if (
    /property|contract|rent|land|tenancy|lease|ownership|eviction|succession|partition/.test(
      source,
    )
  )
    return "Civil";
  return "General Legal Matter";
}

/**
 * Extract 3 key fact bullets from the query string.
 * Treats the query as a condensed case description.
 */
function extractKeyFacts(query, caseType) {
  const q = normalizeText(query).trim();
  const words = q.split(/\s+/);

  // Heuristic: split query into rough thirds and summarise each
  const third = Math.max(1, Math.floor(words.length / 3));
  const segment1 = words.slice(0, third).join(" ");
  const segment2 = words.slice(third, third * 2).join(" ");
  const segment3 = words.slice(third * 2).join(" ");

  const FALLBACK = {
    Criminal: [
      "Party involved in an alleged criminal offence.",
      "An FIR or complaint has been filed before the competent court.",
      "Liberty and legal rights of the accused are at stake.",
    ],
    Civil: [
      "Dispute over property, contract, or civil rights.",
      "One party claims wrongful deprivation of a civil entitlement.",
      "Financial interest or property rights are at stake.",
    ],
    Constitutional: [
      "Allegation of violation of fundamental rights under the Constitution.",
      "A writ petition has been filed before the High Court or Supreme Court.",
      "Constitutional rights and state authority are at stake.",
    ],
    Tax: [
      "A tax demand or assessment has been challenged.",
      "The taxpayer disputes the computation or jurisdiction.",
      "Financial liability and compliance are at stake.",
    ],
    "Service/Labour": [
      "An employee disputes termination or service conditions.",
      "The employer has taken adverse action against the employee.",
      "Livelihood and statutory service rights are at stake.",
    ],
    "General Legal Matter": [
      "Parties are engaged in a legal dispute.",
      "The matter requires determination of rights and obligations.",
      "Legal entitlements and remedies are at stake.",
    ],
  };

  const facts = [];
  if (segment1 && segment1.length > 4)
    facts.push(`${segment1.charAt(0).toUpperCase()}${segment1.slice(1)}.`);
  if (segment2 && segment2.length > 4)
    facts.push(`${segment2.charAt(0).toUpperCase()}${segment2.slice(1)}.`);
  if (segment3 && segment3.length > 4)
    facts.push(`${segment3.charAt(0).toUpperCase()}${segment3.slice(1)}.`);

  const fallbacks = FALLBACK[caseType] || FALLBACK["General Legal Matter"];
  while (facts.length < 3) facts.push(fallbacks[facts.length]);
  return facts.slice(0, 3);
}

/**
 * Extract legal issues from chunk texts; infer from case type if not found.
 */
function extractLegalIssues(chunkTexts, caseType) {
  const combined = chunkTexts.join(" ").toLowerCase();

  // Look for explicit "whether" phrases — common in Indian judgments
  const whetherMatches = [];
  const whetherRe = /whether\s+[^.;,]{10,120}/gi;
  let m;
  while ((m = whetherRe.exec(combined)) !== null && whetherMatches.length < 2) {
    const clean = m[0].replace(/\s+/g, " ").trim();
    whetherMatches.push(`${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`);
  }

  if (whetherMatches.length >= 2) return whetherMatches.slice(0, 2);

  const INFERRED = {
    Criminal: [
      "Whether the offence has been proven beyond reasonable doubt.",
      "Whether the accused is entitled to bail or statutory protection under the relevant act.",
    ],
    Civil: [
      "Whether the plaintiff has a valid legal title or right over the disputed property or contract.",
      "Whether the defendant's actions constitute a breach giving rise to legal remedies.",
    ],
    Constitutional: [
      "Whether the action of the State violates the fundamental rights of the petitioner.",
      "Whether the impugned order or legislation is constitutionally valid.",
    ],
    Tax: [
      "Whether the tax assessment or demand raised by the authority is legally sustainable.",
      "Whether the taxpayer qualifies for the claimed exemption or deduction under the applicable act.",
    ],
    "Service/Labour": [
      "Whether the termination or adverse action against the employee is in accordance with service rules.",
      "Whether the employee is entitled to reinstatement, back wages, or statutory relief.",
    ],
    "General Legal Matter": [
      "Whether the legal rights and obligations of the parties have been correctly identified.",
      "To be determined based on full case documents.",
    ],
  };

  const fallback = INFERRED[caseType] || INFERRED["General Legal Matter"];
  if (whetherMatches.length === 1) return [whetherMatches[0], fallback[1]];
  return fallback;
}

/**
 * Extract or infer relevant laws from chunk text + case type.
 */
function extractRelevantLaws(chunkTexts, caseType) {
  const combined = chunkTexts.join(" ");

  // Known act patterns
  const ACT_PATTERNS = [
    /Indian\s+Penal\s+Code[^,;.]{0,30}/gi,
    /Code\s+of\s+Criminal\s+Procedure[^,;.]{0,30}/gi,
    /Transfer\s+of\s+Property\s+Act[^,;.]{0,30}/gi,
    /Indian\s+Evidence\s+Act[^,;.]{0,30}/gi,
    /Income.?Tax\s+Act[^,;.]{0,30}/gi,
    /Industrial\s+Disputes\s+Act[^,;.]{0,30}/gi,
    /Constitution\s+of\s+India[^,;.]{0,30}/gi,
    /Consumer\s+Protection\s+Act[^,;.]{0,30}/gi,
    /Goods\s+and\s+Services\s+Tax[^,;.]{0,30}/gi,
    /Specific\s+Relief\s+Act[^,;.]{0,30}/gi,
    /Payment\s+of\s+Wages\s+Act[^,;.]{0,30}/gi,
    /Rent\s+Control\s+Act[^,;.]{0,30}/gi,
    /Motor\s+Vehicles\s+Act[^,;.]{0,30}/gi,
    /Prevention\s+of\s+Corruption\s+Act[^,;.]{0,30}/gi,
    /NDPS\s+Act[^,;.]{0,30}/gi,
    /Companies\s+Act[^,;.]{0,30}/gi,
  ];

  const found = new Set();
  for (const pattern of ACT_PATTERNS) {
    const matches = combined.match(pattern) || [];
    for (const hit of matches.slice(0, 1)) {
      found.add(hit.replace(/\s+/g, " ").trim());
    }
  }

  // Also pull explicit IPC/CrPC section refs
  const sectionRe = /(?:IPC|CrPC|Section)\s+\d+[A-Za-z]?/gi;
  const sectionMatches = combined.match(sectionRe) || [];
  for (const s of sectionMatches.slice(0, 2)) found.add(s.trim());

  if (found.size >= 2) return Array.from(found).slice(0, 3);

  // Fallback per case type
  const FALLBACKS = {
    Criminal: [
      "Indian Penal Code (IPC), applicable sections",
      "Code of Criminal Procedure (CrPC)",
    ],
    Civil: ["Transfer of Property Act, 1882", "Indian Evidence Act, 1872"],
    Constitutional: [
      "Constitution of India, applicable Article(s)",
      "The Supreme Court Rules",
    ],
    Tax: ["Income Tax Act, 1961", "Goods and Services Tax Act, 2017"],
    "Service/Labour": [
      "Industrial Disputes Act, 1947",
      "Payment of Wages Act, 1936",
    ],
    "General Legal Matter": [
      "Applicable statutory provisions",
      "To be determined based on full case documents",
    ],
  };

  const base = Array.from(found);
  const fallbacks = FALLBACKS[caseType] || FALLBACKS["General Legal Matter"];
  while (base.length < 2) base.push(fallbacks[base.length]);
  return base.slice(0, 3);
}

/**
 * Infer predicted outcome from top source verdict + case type + chunk text.
 */
function inferPredictedOutcome(sources, chunkTexts, caseType) {
  const topVerdict = (sources[0]?.finalVerdict || "").trim();
  if (
    topVerdict &&
    topVerdict.length > 4 &&
    !/to be determined/i.test(topVerdict)
  ) {
    return (
      topVerdict.charAt(0).toUpperCase() +
      topVerdict.slice(1) +
      (topVerdict.endsWith(".") ? "" : ".")
    );
  }

  const combined = chunkTexts.join(" ").toLowerCase();
  if (
    /strong\s+evidence|beyond\s+reasonable\s+doubt|conclusively\s+proved/.test(
      combined,
    )
  ) {
    return caseType === "Criminal"
      ? "Likely conviction, as evidence on record appears to establish guilt beyond reasonable doubt."
      : "Likely ruling in favour of the plaintiff, given the strength of documentary evidence.";
  }
  if (/dismissed|rejected|no\s+merit|not\s+maintainable/.test(combined)) {
    return "The petition or appeal is likely to be dismissed for want of merit or maintainability.";
  }
  if (/remanded|remand\s+back|sent\s+back|fresh\s+inquiry/.test(combined)) {
    return "The matter is likely to be remanded back to the lower court or authority for fresh consideration.";
  }
  if (/partly\s+allowed|partial\s+relief|some\s+relief/.test(combined)) {
    return "The court may grant partial relief, allowing the petition or appeal in part.";
  }

  const OUTCOME_DEFAULTS = {
    Criminal:
      "Outcome depends on the weight of evidence and credibility of witnesses; bail or acquittal possible if evidence is weak.",
    Civil:
      "If the plaintiff establishes clear title and prior possession, the court is likely to grant the relief sought.",
    Constitutional:
      "The court will examine proportionality of State action; relief likely if fundamental rights violation is established.",
    Tax: "The tribunal is expected to rule in favour of the taxpayer if procedural and substantive compliance is demonstrated.",
    "Service/Labour":
      "Reinstatement with back wages is a probable outcome if the termination is found to be without just cause.",
    "General Legal Matter":
      "To be determined based on full case documents and arguments of counsel.",
  };

  return OUTCOME_DEFAULTS[caseType] || OUTCOME_DEFAULTS["General Legal Matter"];
}

/**
 * FIX 3: Rewritten summarizeGroundedAnswer() — strict structured legal analysis.
 */
function summarizeGroundedAnswer(
  query,
  topChunks,
  sources,
  cleanContext,
  confidenceInt,
) {
  const FALLBACK_LINE = "To be determined based on full case documents.";

  if ((topChunks || []).length === 0 || !cleanContext) {
    return "No relevant legal precedents found to answer this query.";
  }

  // Gather clean chunk texts (pre-filtered)
  // FIX 3 — Also reject chunks with excessive section refs or semicolons.
  const chunkTexts = topChunks
    .map((c) => cleanChunkText(c.text))
    .filter((t) => {
      if (!t || t.length < 80) return false;
      const lower = t.toLowerCase();
      if (lower.includes("case title extracted")) return false;
      if (lower.includes("cited-cases metadata")) return false;
      if (/https?:\/\//.test(lower)) return false;
      // FIX 3 — Skip chunks still dominated by section refs or semicolons
      const sectionCount = (lower.match(/\bsection\b/gi) || []).length;
      const semicolonCount = (t.match(/;/g) || []).length;
      if (sectionCount > 2 || semicolonCount > 2) return false;
      return true;
    });

  // ── Field 1: Case Title ──────────────────────────────────────────────────
  const caseTitle = sources[0]?.title
    ? cleanTitle(sources[0].title)
    : FALLBACK_LINE;

  // ── Field 2: Case Type ───────────────────────────────────────────────────
  const caseType = detectCaseType(query, chunkTexts);

  // ── Field 3: Key Facts ───────────────────────────────────────────────────
  const keyFacts = extractKeyFacts(query, caseType);

  // ── Field 4: Legal Issues ────────────────────────────────────────────────
  const legalIssues = extractLegalIssues(chunkTexts, caseType);

  // ── Field 5: Relevant Laws ───────────────────────────────────────────────
  const relevantLaws = extractRelevantLaws(chunkTexts, caseType);

  // ── Field 6: Arguments ──────────────────────────────────────────────────
  const qWords = normalizeText(query).split(/\s+/);
  const half = Math.max(1, Math.floor(qWords.length / 2));
  const plaintiffArg = qWords.slice(0, half).join(" ").trim();
  const defendantArg = qWords.slice(half).join(" ").trim();

  const plaintiffLine =
    plaintiffArg.length > 6
      ? `The affected party contends that ${plaintiffArg.charAt(0).toLowerCase()}${plaintiffArg.slice(1)}, and therefore seeks appropriate legal remedy.`
      : FALLBACK_LINE;
  const defendantLine =
    defendantArg.length > 6
      ? `The opposing party argues that ${defendantArg.charAt(0).toLowerCase()}${defendantArg.slice(1)}, and that no liability or breach has occurred.`
      : FALLBACK_LINE;

  // ── Field 7: Predicted Outcome ───────────────────────────────────────────
  const predictedOutcome = inferPredictedOutcome(sources, chunkTexts, caseType);

  // ── Field 8: Reasoning ───────────────────────────────────────────────────
  const topSource = sources[0];
  const secondSource = sources[1];

  let reasoning = FALLBACK_LINE;
  if (topSource?.title) {
    const year = topSource.year || "N.A.";
    const base = `Based on ${cleanTitle(topSource.title)} (${year}), courts have held that established legal precedent supports a reasoned adjudication on the merits of this claim.`;
    const extra = secondSource?.title
      ? ` This position is further supported by ${cleanTitle(secondSource.title)} (${secondSource.year || "N.A."}).`
      : "";
    reasoning = base + extra;
  }

  // ── Field 9: Confidence Score ────────────────────────────────────────────
  const safeConf = Number.isFinite(confidenceInt) ? confidenceInt : 55;
  const confidenceDecimal = (Math.min(99, Math.max(0, safeConf)) / 100).toFixed(
    2,
  );

  // ── Assemble output ──────────────────────────────────────────────────────
  const lines = [
    `**Case Title:** ${caseTitle}`,
    `**Case Type:** ${caseType}`,
    "",
    "**Key Facts:**",
    ...keyFacts.map((f) => `- ${f}`),
    "",
    "**Legal Issues:**",
    ...legalIssues.map((i) => `- ${i}`),
    "",
    "**Relevant Laws:**",
    ...relevantLaws.map((l) => `- ${l}`),
    "",
    "**Arguments:**",
    `- Plaintiff/Petitioner: ${plaintiffLine}`,
    `- Defendant/Respondent: ${defendantLine}`,
    "",
    "**Predicted Outcome:**",
    `- ${predictedOutcome}`,
    "",
    "**Reasoning:**",
    `- ${reasoning}`,
    "",
    `**Confidence Score:** ${confidenceDecimal}`,
  ];

  return lines.join("\n");
}

export function queryRag({ query, index, topK = 4, minScore = 0.22 }) {
  const cleanQuery = normalizeText(query);
  const safeTopK = Number.isFinite(topK) ? Math.min(Math.max(topK, 1), 12) : 4;

  if (!cleanQuery) {
    return {
      query: "",
      answer:
        "Please provide a legal question to run retrieval-augmented analysis.",
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

  const ragIndex = index || {
    chunks: [],
    dims: DEFAULT_EMBED_DIMS,
    tokenDocFreq: {},
    avgChunkLength: 1,
  };
  const queryVec = embedText(cleanQuery, ragIndex.dims || DEFAULT_EMBED_DIMS);
  const queryNorm = vectorNorm(queryVec);
  const queryTokens = extractTokens(cleanQuery);
  const expandedTokens = expandQueryTokens(queryTokens);
  const queryReferenceSet = new Set(extractLegalReferences(cleanQuery));
  const expandedTokenList = Array.from(expandedTokens);

  const safeMinScore = Number.isFinite(minScore)
    ? Math.max(0.12, Math.min(0.6, minScore))
    : 0.22;
  const totalChunks = Math.max(1, (ragIndex.chunks || []).length);

  const candidatePool = (ragIndex.chunks || [])
    .map((chunk) => {
      const cosine = Math.max(
        0,
        cosineSimilarity(queryVec, chunk.vector, queryNorm, chunk.norm),
      );
      const tokens = chunk.tokens || [];
      const overlapCount = tokens.reduce(
        (acc, token) => (expandedTokens.has(token) ? acc + 1 : acc),
        0,
      );
      const keywordOverlap =
        expandedTokens.size > 0 ? overlapCount / expandedTokens.size : 0;
      const exactQueryHits = queryTokens.reduce(
        (acc, token) => (tokens.includes(token) ? acc + 1 : acc),
        0,
      );
      const exactCoverage =
        queryTokens.length > 0 ? exactQueryHits / queryTokens.length : 0;
      const titleOverlap = queryTokens.reduce(
        (acc, token) =>
          `${chunk.title || ""}`.toLowerCase().includes(token) ? acc + 1 : acc,
        0,
      );
      const titleBoost =
        queryTokens.length > 0 ? titleOverlap / queryTokens.length : 0;
      const lexicalBm25 = bm25Score(
        expandedTokenList,
        chunk,
        ragIndex.tokenDocFreq || {},
        ragIndex.avgChunkLength || 1,
        totalChunks,
      );
      const bm25Normalized = lexicalBm25 / (lexicalBm25 + 6);
      const phraseBoost = computePhraseBoost(cleanQuery, chunk.text || "");
      const chunkRefSet = new Set(
        extractLegalReferences(`${chunk.title || ""} ${chunk.text || ""}`),
      );
      let legalRefBoost = 0;
      if (queryReferenceSet.size > 0 && chunkRefSet.size > 0) {
        let matches = 0;
        for (const ref of queryReferenceSet) {
          if (chunkRefSet.has(ref)) matches += 1;
        }
        legalRefBoost = Math.min(0.12, matches * 0.06);
      }
      const blendedCore =
        cosine * 0.5 +
        bm25Normalized * 0.32 +
        keywordOverlap * 0.1 +
        titleBoost * 0.03;
      const calibratedCore = scoreCalibration(blendedCore);
      const sectionWeight =
        chunk.section === "Judgment"
          ? 1
          : chunk.section === "Summary"
            ? 0.92
            : 0.85;
      const score = Math.min(
        0.995,
        (calibratedCore + exactCoverage * 0.22 + phraseBoost + legalRefBoost) *
          sectionWeight,
      );
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
   * FIX 4 (strengthened): source excerpts — full dirty-text replacement.
   */
  const sources = Array.from(grouped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => {
      let excerpt = cleanChunkText(toExcerpt(entry.text, 240));

      // FIX 4 — Replace excerpt if still dirty after cleaning
      const excerptStillDirty =
        !excerpt ||
        excerpt.length < 40 ||
        excerpt.toLowerCase().includes("case title extracted") ||
        (excerpt.match(/;/g) || []).length > 2 ||
        /decision\s*:\s*0/i.test(excerpt);

      if (excerptStillDirty) {
        excerpt = `${entry.type || "General"} judgment — ${entry.court || "Supreme Court of India"} (${entry.year || "N.A."})`;
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

  const topScores = scored
    .slice(0, Math.min(3, scored.length))
    .map((item) => item.score);
  const averageTop =
    topScores.reduce((acc, n) => acc + n, 0) / Math.max(1, topScores.length);
  const sourceCoverage = Math.min(
    1,
    sources.length / Math.max(1, Math.min(5, safeTopK)),
  );
  const confidence = Math.min(
    99,
    Math.max(40, Math.round((averageTop * 0.9 + sourceCoverage * 0.1) * 100)),
  );

  return {
    query: cleanQuery,
    answer: summarizeGroundedAnswer(
      cleanQuery,
      scored,
      sources,
      cleanContext,
      confidence,
    ),
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
