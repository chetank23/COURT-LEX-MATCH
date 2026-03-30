import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRagIndex, serializeRagIndex } from "../server/services/ragService.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const INPUT_PATH = path.join(ROOT, "public", "data", "cases_import.json");
const OUTPUT_PROCESSED = path.join(ROOT, "data", "processed", "rag_index.json");
const OUTPUT_PUBLIC = path.join(ROOT, "public", "data", "rag_index.json");

function extractSegment(text, label) {
  const source = `${text || ""}`;
  const start = source.indexOf(label);
  if (start < 0) return "";
  const after = source.slice(start + label.length);
  const endIndex = after.indexOf("\n");
  return (endIndex >= 0 ? after.slice(0, endIndex) : after).trim();
}

function mapRawCase(raw) {
  const decision = extractSegment(raw.full_text, "Decision:");
  return {
    id: raw.case_id,
    title: raw.title,
    court: raw.court,
    year: Number.parseInt(`${raw.decision_date || ""}`.slice(0, 4), 10) || 2000,
    type: raw.case_type || "General",
    summary: raw.summary || `${raw.full_text || ""}`.slice(0, 600),
    judgment: decision || `${raw.full_text || ""}`.slice(0, 600),
    finalVerdict: decision,
    whyMatch: "RAG chunk from public case corpus",
    tags: [raw.jurisdiction || "India", raw.case_type || "General"],
  };
}

async function main() {
  const rawPayload = await readFile(INPUT_PATH, "utf8");
  const rawCases = JSON.parse(rawPayload);
  const mappedCases = rawCases.map(mapRawCase);

  const ragIndex = buildRagIndex(mappedCases);
  const serialized = serializeRagIndex(ragIndex);

  await mkdir(path.dirname(OUTPUT_PROCESSED), { recursive: true });
  await mkdir(path.dirname(OUTPUT_PUBLIC), { recursive: true });
  await writeFile(OUTPUT_PROCESSED, `${JSON.stringify(serialized)}\n`, "utf8");
  await writeFile(OUTPUT_PUBLIC, `${JSON.stringify(serialized)}\n`, "utf8");

  console.log(`RAG index built with ${serialized.chunks.length} chunks.`);
  console.log(`Processed index: ${OUTPUT_PROCESSED}`);
  console.log(`Public index: ${OUTPUT_PUBLIC}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
