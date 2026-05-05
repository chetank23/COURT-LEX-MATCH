import assert from "node:assert/strict";
import { createServer } from "../index.mjs";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  return { status: res.status, body: payload };
}

async function main() {
  const server = await createServer();

  await new Promise((resolve) => {
    server.listen(4102, "127.0.0.1", resolve);
  });

  try {
    const extractedMode = await postJson(
      "http://127.0.0.1:4102/api/analyze-pdf",
      {
        filename: "constitutional_petition.pdf",
        extractedText:
          "This petition invokes Article 21 and seeks interim injunction with compensation for violation of statutory duties. Reported in AIR 1980 SC 820 and (1980) 2 SCC 831.",
      },
    );

    assert.equal(extractedMode.status, 200);
    assert.ok(Array.isArray(extractedMode.body.sections));
    assert.equal(extractedMode.body.sections.length, 3);
    assert.equal(extractedMode.body.sections[0].title, "Facts");
    assert.ok(
      extractedMode.body.sections[0].highlights.includes(
        "Text provided by upstream extractor",
      ),
      "Expected extracted-text override path to be reflected in highlights",
    );
    assert.ok(
      extractedMode.body.sections[0].matches.some((item) =>
        String(item.reason || "")
          .toLowerCase()
          .includes("citation"),
      ),
      "Expected at least one citation-aware ranking explanation",
    );

    const fallbackMode = await postJson(
      "http://127.0.0.1:4102/api/analyze-pdf",
      {
        filename: "fir_crime_case.pdf",
        contentBase64: "bm90LWEtdmFsaWQtcGRmLWNvbnRlbnQ=",
      },
    );

    assert.equal(fallbackMode.status, 200);
    assert.ok(Array.isArray(fallbackMode.body.sections));
    assert.equal(fallbackMode.body.sections.length, 3);
    assert.equal(fallbackMode.body.sections[0].title, "Facts");
    assert.ok(
      fallbackMode.body.sections[0].highlights.includes("fallback mode"),
      "Expected metadata fallback mode when text extraction and OCR fail",
    );

    const nonLegalMode = await postJson(
      "http://127.0.0.1:4102/api/analyze-pdf",
      {
        filename: "birthday-party-menu.pdf",
        extractedText:
          "This document lists cake flavors, music schedule, guest count, and decoration checklist for a birthday party.",
      },
    );

    assert.equal(nonLegalMode.status, 200);
    assert.ok(Array.isArray(nonLegalMode.body.sections));
    assert.ok(
      nonLegalMode.body.sections.every(
        (section) =>
          Array.isArray(section.matches) && section.matches.length === 0,
      ),
    );
    assert.ok(
      String(nonLegalMode.body.sections[0].summary || "")
        .toLowerCase()
        .includes("no case matches"),
      "Expected explicit no-match summary for non-legal document",
    );

    console.log("PDF analysis API tests passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
