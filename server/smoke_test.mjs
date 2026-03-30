import assert from "node:assert/strict";
import { createServer } from "./index.mjs";

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  const requestId = res.headers.get("x-request-id");
  return { status: res.status, body, requestId };
}

async function main() {
  const server = await createServer();

  await new Promise((resolve) => {
    server.listen(4101, "127.0.0.1", resolve);
  });

  try {
    const health = await fetchJson("http://127.0.0.1:4101/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.ok(health.requestId && health.requestId.startsWith("req_"));

    const cases = await fetchJson("http://127.0.0.1:4101/api/cases");
    assert.equal(cases.status, 200);
    assert.ok(Array.isArray(cases.body));
    assert.ok(cases.body.length > 1000);

    const search = await fetchJson("http://127.0.0.1:4101/api/cases/search?q=article%2014");
    assert.equal(search.status, 200);
    assert.ok(search.body && Array.isArray(search.body.results));
    assert.ok(search.body.results.length > 0);
    assert.equal(typeof search.body.results[0].final_verdict, "string");
    assert.equal(typeof search.body.results[0].judgment, "string");
    assert.ok(search.body.results[0].final_verdict.trim().length > 0);

    const topPriority = await fetchJson("http://127.0.0.1:4101/api/cases/priority?limit=5");
    assert.equal(topPriority.status, 200);
    assert.equal(topPriority.body.length, 5);

    const firstId = encodeURIComponent(cases.body[0].id);
    const detail = await fetchJson(`http://127.0.0.1:4101/api/cases/${firstId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.id, cases.body[0].id);
    assert.equal(typeof detail.body.final_verdict, "string");
    assert.equal(typeof detail.body.judgment, "string");
    assert.ok(detail.body.final_verdict.trim().length > 0);

    const knownCase = await fetchJson("http://127.0.0.1:4101/api/cases/CASE-000001");
    assert.equal(knownCase.status, 200);
    assert.ok(typeof knownCase.body.judgment === "string" && knownCase.body.judgment.trim().length > 0);
    assert.ok(typeof knownCase.body.final_verdict === "string" && knownCase.body.final_verdict.trim().length > 0);
    assert.notEqual(knownCase.body.final_verdict, "Unknown");

    const insights = await fetchJson("http://127.0.0.1:4101/api/insights");
    assert.equal(insights.status, 200);
    assert.ok(Array.isArray(insights.body.similarityDistribution));

    const history = await fetchJson("http://127.0.0.1:4101/api/history");
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.body));

    console.log("API smoke tests passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
