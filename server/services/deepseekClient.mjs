const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-r1";
const DEFAULT_TIMEOUT_MS = 30000;

function normalizeText(value) {
  return `${value || ""}`.replace(/\s+/g, " ").trim();
}

function truncate(value, maxLength) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function readDeepSeekConfig() {
  const apiKey = `${process.env.DEEPSEEK_API_KEY || ""}`.trim();
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl: `${process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL}`.replace(
      /\/+$/,
      "",
    ),
    model: `${process.env.DEEPSEEK_MODEL || DEFAULT_MODEL}`.trim(),
    timeoutMs:
      Number.parseInt(
        process.env.DEEPSEEK_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`,
        10,
      ) || DEFAULT_TIMEOUT_MS,
  };
}

function buildSystemPrompt(mode) {
  if (mode === "explain") {
    return [
      "You are a legal explanation engine for a court operations platform.",
      "Use only the supplied case metadata, retrieved chunks, and local explanation.",
      "Return a concise explanation in plain language.",
      "Do not invent facts, citations, or legal outcomes.",
      "If the query is in another language, answer in the same language when possible.",
    ].join(" ");
  }

  return [
    "You are a legal retrieval-augmented generation engine for a court operations platform.",
    "Use only the supplied retrieved legal chunks and local answer draft.",
    "Produce a concise, grounded answer with no hallucinations.",
    "If the query is in another language, answer in the same language when possible.",
    "Prefer bullet points only when it improves readability.",
  ].join(" ");
}

function buildUserPrompt({
  query,
  localAnswer,
  sources,
  retrievedChunks,
  mode,
  caseTitle,
  localExplanation,
}) {
  const sourceLines = sources
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} | ${source.court} | ${source.year} | ${source.section} | score=${source.score} | ${truncate(source.excerpt, 200)}`,
    )
    .join("\n");

  const chunkLines = retrievedChunks
    .map(
      (chunk, index) =>
        `${index + 1}. ${chunk.section} | ${chunk.caseId} | score=${chunk.score} | ${truncate(chunk.text, 200)}`,
    )
    .join("\n");

  if (mode === "explain") {
    return [
      `Case title: ${caseTitle || "Unknown case"}`,
      `Query: ${query}`,
      `Local explanation: ${localExplanation || localAnswer}`,
      "Retrieved sources:",
      sourceLines || "None",
      "Retrieved chunks:",
      chunkLines || "None",
      "Rewrite the explanation for a judge-facing legal workflow.",
    ].join("\n");
  }

  return [
    `Query: ${query}`,
    `Local answer draft: ${localAnswer}`,
    "Retrieved sources:",
    sourceLines || "None",
    "Retrieved chunks:",
    chunkLines || "None",
    "Answer the query using only the retrieved material. Include the main legal takeaway and mention uncertainty if the evidence is limited.",
  ].join("\n");
}

async function callDeepSeek(messages, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: 900,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content?.trim() || "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateDeepSeekGroundedAnswer({
  query,
  localAnswer,
  sources,
  retrievedChunks,
  mode = "rag",
  caseTitle,
  localExplanation,
}) {
  const config = readDeepSeekConfig();
  if (!config) {
    return null;
  }

  try {
    const content = await callDeepSeek(
      [
        { role: "system", content: buildSystemPrompt(mode) },
        {
          role: "user",
          content: buildUserPrompt({
            query,
            localAnswer,
            sources,
            retrievedChunks,
            mode,
            caseTitle,
            localExplanation,
          }),
        },
      ],
      config,
    );

    return content || null;
  } catch (error) {
    console.warn(
      "DeepSeek generation unavailable, falling back to local answer:",
      error?.message || error,
    );
    return null;
  }
}
