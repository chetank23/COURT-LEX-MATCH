import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/NoelShallum/Indian_SC_Judgment_database/main/final_judge_database.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return header.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  );
}

function parseDecisionDate(rawDate) {
  const source = (rawDate || "").trim();
  if (!source) return "";

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;

  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toNormalizedCase(item, index) {
  const title = (item.case_title || "").trim();
  const citation = (item.citation || "").trim();
  const judges = (item.judges_name_s || "").trim();
  const issues = (item.issues || "").trim();
  const decision = (item.decision || "").trim();
  const citedCases = (item.cited_cases || "").trim();

  const summary = [
    issues ? `Issues: ${issues}` : "",
    decision ? `Decision: ${decision}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const fullText = [
    judges ? `Judges: ${judges}` : "",
    issues ? `Issues: ${issues}` : "",
    decision ? `Decision: ${decision}` : "",
    citedCases ? `Cited Cases: ${citedCases}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    case_id: `IN-SC-${String(index + 1).padStart(6, "0")}`,
    title,
    court: "Supreme Court of India",
    jurisdiction: "India",
    decision_date: parseDecisionDate(item.date_of_judgment),
    citation,
    case_type: "General",
    summary,
    full_text: fullText,
    source_url: "https://github.com/NoelShallum/Indian_SC_Judgment_database",
    source_name: "Indian_SC_Judgment_database",
  };
}

function toCsv(items) {
  const headers = [
    "case_id",
    "title",
    "court",
    "jurisdiction",
    "decision_date",
    "citation",
    "case_type",
    "summary",
    "full_text",
    "source_url",
    "source_name",
  ];

  const escapeCell = (value) => {
    const str = `${value ?? ""}`;
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];
  for (const item of items) {
    lines.push(headers.map((key) => escapeCell(item[key])).join(","));
  }

  return lines.join("\n");
}

async function main() {
  const root = process.cwd();
  const rawDir = path.join(root, "data", "raw");
  const processedDir = path.join(root, "data", "processed");

  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });

  console.log("Downloading public legal dataset...");
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download source CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  await writeFile(path.join(rawDir, "indian_sc_source.csv"), csvText, "utf8");

  const rows = parseCsv(csvText).filter((r) => r.some((cell) => `${cell}`.trim().length > 0));
  if (rows.length < 2) {
    throw new Error("Source CSV did not contain enough rows.");
  }

  const normalizedHeaders = normalizeHeader(rows[0]);
  const records = rows.slice(1).map((row) => {
    const out = {};
    normalizedHeaders.forEach((header, idx) => {
      out[header] = (row[idx] || "").trim();
    });
    return out;
  });

  const cases = records
    .map(toNormalizedCase)
    .filter((item) => item.title.length > 0 && item.full_text.length > 0);

  const jsonPath = path.join(processedDir, "cases_import.json");
  const csvPath = path.join(processedDir, "cases_import.csv");

  await writeFile(jsonPath, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${toCsv(cases)}\n`, "utf8");

  console.log(`Fetched and normalized ${cases.length} cases.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV:  ${csvPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
