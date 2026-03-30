import assert from "node:assert/strict";
import { createServer } from "./index.mjs";

async function fetchJson(url) {
  const response = await fetch(url);
  return { status: response.status, body: await response.json() };
}

async function main() {
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const payload = await fetchJson(`http://127.0.0.1:${port}/api/cases/search?q=property+ownership+brothers`);
    assert.equal(payload.status, 200);
    assert.ok(payload.body && Array.isArray(payload.body.results));
    assert.ok(payload.body.results.length > 0 && payload.body.results.length <= 5);

    const first = payload.body.results[0];
    for (const key of ["id", "title", "court", "year", "similarity", "matchLevel", "summary", "judgement", "whyMatched", "matchedTerms"]) {
      assert.ok(key in first, `Missing key: ${key}`);
    }

    assert.ok(Array.isArray(first.matchedTerms));
    assert.equal(typeof first.judgement, "string");
    assert.equal(typeof first.whyMatched, "string");

    console.log("Smart search integration test passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
