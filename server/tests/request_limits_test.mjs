import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../index.mjs";

function sendRawRequest({ method, path, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 4103,
        method,
        path,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = payload ? JSON.parse(payload) : null;
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const previousLimit = process.env.LEXMATCH_MAX_JSON_BODY_BYTES;
  process.env.LEXMATCH_MAX_JSON_BODY_BYTES = "128";

  const server = await createServer();
  await new Promise((resolve) => server.listen(4103, "127.0.0.1", resolve));

  try {
    const invalidJson = await sendRawRequest({
      method: "POST",
      path: "/api/analyze-pdf",
      body: '{"filename":"broken.pdf",',
      headers: {
        "Content-Type": "application/json",
      },
    });

    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJson.body?.error, "Invalid JSON request body");

    const tooLargeBody = await sendRawRequest({
      method: "POST",
      path: "/api/analyze-pdf",
      body: JSON.stringify({
        filename: "oversized.pdf",
        contentBase64: "A".repeat(512),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    assert.equal(tooLargeBody.status, 413);
    assert.ok(
      `${tooLargeBody.body?.error || ""}`.includes(
        "Request body exceeds limit",
      ),
      "Expected request-body size limit error",
    );

    console.log("Request limits API tests passed.");
  } finally {
    if (previousLimit === undefined) {
      delete process.env.LEXMATCH_MAX_JSON_BODY_BYTES;
    } else {
      process.env.LEXMATCH_MAX_JSON_BODY_BYTES = previousLimit;
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
