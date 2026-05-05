import assert from "node:assert/strict";
import { createServer } from "../index.mjs";

async function timedFetch(url, init) {
  const started = performance.now();
  const res = await fetch(url, init);
  const ended = performance.now();
  return { status: res.status, durationMs: ended - started };
}

function summarizeDurations(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avg: sorted.reduce((sum, n) => sum + n, 0) / Math.max(1, sorted.length),
    p95: sorted[p95Index] || 0,
    max: sorted[sorted.length - 1] || 0,
  };
}

async function main() {
  process.env.LEXMATCH_ENABLE_PDF_OCR = "0";
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  assert.equal(typeof port, "number");
  const base = `http://127.0.0.1:${port}`;

  try {
    const searchRequests = Array.from({ length: 30 }, (_, i) =>
      timedFetch(`${base}/api/cases/search?q=article+${14 + (i % 5)}`),
    );
    const searchResults = await Promise.all(searchRequests);
    const searchDurations = searchResults.map((result) => result.durationMs);

    const analyzeRequests = Array.from({ length: 10 }, () =>
      timedFetch(`${base}/api/analyze-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "perf-check.pdf",
          extractedText:
            "Article 21 liberty interim injunction constitutional challenge.",
        }),
      }),
    );
    const analyzeResults = await Promise.all(analyzeRequests);
    const analyzeDurations = analyzeResults.map((result) => result.durationMs);

    assert.ok(
      searchResults.every((result) => result.status === 200),
      "Search load run returned non-200 responses",
    );
    assert.ok(
      analyzeResults.every((result) => result.status === 200),
      "Analyze load run returned non-200 responses",
    );

    const searchStats = summarizeDurations(searchDurations);
    const analyzeStats = summarizeDurations(analyzeDurations);

    // Broad ceilings to catch obvious regressions while avoiding flaky CI behavior.
    assert.ok(
      searchStats.p95 < 8000,
      `Search p95 too high: ${searchStats.p95.toFixed(2)}ms`,
    );
    assert.ok(
      analyzeStats.p95 < 5000,
      `Analyze p95 too high: ${analyzeStats.p95.toFixed(2)}ms`,
    );

    console.log(
      `Load smoke tests passed. search(avg=${searchStats.avg.toFixed(1)}ms,p95=${searchStats.p95.toFixed(1)}ms,max=${searchStats.max.toFixed(1)}ms) ` +
        `analyze(avg=${analyzeStats.avg.toFixed(1)}ms,p95=${analyzeStats.p95.toFixed(1)}ms,max=${analyzeStats.max.toFixed(1)}ms)`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
