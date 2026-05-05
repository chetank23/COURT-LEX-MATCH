import assert from "node:assert/strict";
import { createServer } from "../index.mjs";

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json();
  return { status: res.status, body, headers: res.headers };
}

async function main() {
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  assert.equal(typeof port, "number");
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetchJson(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(typeof health.body.uptimeSeconds, "number");

    const saveSearch = await fetchJson(`${base}/api/history/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "article 21", results: 4 }),
    });
    assert.equal(saveSearch.status, 201);

    const metrics = await fetchJson(`${base}/api/metrics`);
    assert.equal(metrics.status, 200);
    assert.ok(metrics.body.requests.total >= 2);
    assert.equal(typeof metrics.body.requests.avgLatencyMs, "number");
    assert.ok(Array.isArray(metrics.body.requests.topPaths));

    const audit = await fetchJson(`${base}/api/audit?limit=20`);
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.body));
    assert.ok(
      audit.body.some((event) => event.action === "create_history_search"),
    );

    console.log("Observability API tests passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
