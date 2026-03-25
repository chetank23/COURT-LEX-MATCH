import assert from "node:assert/strict";
import { createServer } from "./index.mjs";

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  return { status: res.status, body };
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

    const cases = await fetchJson("http://127.0.0.1:4101/api/cases");
    assert.equal(cases.status, 200);
    assert.ok(Array.isArray(cases.body));
    assert.ok(cases.body.length > 1000);

    const search = await fetchJson("http://127.0.0.1:4101/api/cases/search?q=article%2014");
    assert.equal(search.status, 200);
    assert.ok(Array.isArray(search.body));

    const topPriority = await fetchJson("http://127.0.0.1:4101/api/cases/priority?limit=5");
    assert.equal(topPriority.status, 200);
    assert.equal(topPriority.body.length, 5);

    const firstId = encodeURIComponent(cases.body[0].id);
    const detail = await fetchJson(`http://127.0.0.1:4101/api/cases/${firstId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.id, cases.body[0].id);

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
