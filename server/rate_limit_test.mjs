import assert from "node:assert/strict";

process.env.LEXMATCH_RATE_LIMIT_WINDOW_MS = "60000";
process.env.LEXMATCH_RATE_LIMIT_SEARCH_MAX = "2";
process.env.LEXMATCH_RATE_LIMIT_ANALYZE_MAX = "2";
process.env.LEXMATCH_ENABLE_PDF_OCR = "0";

const { createServer } = await import("./index.mjs");

const server = await createServer();
await new Promise((resolve) => server.listen(0, resolve));

const { port } = server.address();
assert.equal(typeof port, "number");
const baseUrl = `http://127.0.0.1:${port}`;

try {
  for (let i = 0; i < 2; i += 1) {
    const response = await fetch(`${baseUrl}/api/cases/search?q=contract`);
    assert.equal(response.status, 200);
  }

  const blockedSearch = await fetch(`${baseUrl}/api/cases/search?q=contract`);
  assert.equal(blockedSearch.status, 429);
  const blockedSearchJson = await blockedSearch.json();
  assert.ok(String(blockedSearchJson.error || "").toLowerCase().includes("rate limit"));

  for (let i = 0; i < 2; i += 1) {
    const response = await fetch(`${baseUrl}/api/analyze-pdf`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "limit-test.pdf",
        contentBase64: "not-a-real-pdf",
        extractedText: "This is stable extracted text for tests.",
      }),
    });
    assert.equal(response.status, 200);
  }

  const blockedAnalyze = await fetch(`${baseUrl}/api/analyze-pdf`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fileName: "limit-test.pdf",
      contentBase64: "not-a-real-pdf",
      extractedText: "This is stable extracted text for tests.",
    }),
  });
  assert.equal(blockedAnalyze.status, 429);
  const blockedAnalyzeJson = await blockedAnalyze.json();
  assert.ok(String(blockedAnalyzeJson.error || "").toLowerCase().includes("rate limit"));

  console.log("Rate limit API tests passed.");
} finally {
  server.close();
}
