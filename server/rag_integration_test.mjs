import assert from "node:assert/strict";
import { createServer } from "./index.mjs";

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const legalQuery = await fetchJson(`http://127.0.0.1:${port}/api/rag/query?q=property dispute between brothers over inheritance&topK=6`);
    assert.equal(legalQuery.status, 200);
    assert.equal(typeof legalQuery.body.answer, "string");
    assert.equal(typeof legalQuery.body.grounded, "boolean");
    assert.ok(Array.isArray(legalQuery.body.sources));
    assert.ok(Array.isArray(legalQuery.body.retrievedChunks));
    assert.ok(legalQuery.body.sources.length > 0, "Expected sources for legal query");
    assert.ok(legalQuery.body.retrievedChunks.length > 0, "Expected retrieved chunks for legal query");

    const nonLegalQuery = await fetchJson(`http://127.0.0.1:${port}/api/rag/query?q=best cake recipe with chocolate chips`);
    assert.equal(nonLegalQuery.status, 200);
    assert.equal(nonLegalQuery.body.grounded, false);
    assert.ok(Array.isArray(nonLegalQuery.body.sources) && nonLegalQuery.body.sources.length === 0);
    assert.ok(Array.isArray(nonLegalQuery.body.retrievedChunks) && nonLegalQuery.body.retrievedChunks.length === 0);

    console.log("RAG integration test passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
