import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PRIMARY_SOURCE_URL =
  "https://raw.githubusercontent.com/NoelShallum/Indian_SC_Judgment_database/main/final_judge_database.csv";
const INDIANKANOON_BROWSE_URL = "https://indiankanoon.org/browse/supremecourt/";
const CASES_TARGET = Number.parseInt(process.env.CASES_TARGET || "12000", 10);
const MAX_PAGES_PER_MONTH = Number.parseInt(
  process.env.INDIANKANOON_MAX_PAGES_PER_MONTH || "80",
  10,
);
const FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.LEXMATCH_FETCH_TIMEOUT_MS || "15000",
  10,
);
const USER_AGENT = "lexmatch-ai-data-fetch/1.0";

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
      .replace(/^_+|_+$/g, ""),
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

function decodeHtmlEntities(input) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(input) {
  return decodeHtmlEntities(`${input || ""}`)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCaseType(text) {
  const source = `${text || ""}`.toLowerCase();

  if (
    /criminal|crl\.?|murder|ipc|bail|ndps|fir|arrest|sentenc|convict|acquit/.test(
      source,
    )
  ) {
    return "Criminal";
  }
  if (
    /tax|income\s*tax|gst|vat|excise|customs|assessment|revenue/.test(source)
  ) {
    return "Tax";
  }
  if (
    /labour|labor|employment|service\s+matter|industrial|workmen|wage/.test(
      source,
    )
  ) {
    return "Service/Labour";
  }
  if (
    /constitution|article\s+\d+|fundamental rights|writ|habeas|mandamus/.test(
      source,
    )
  ) {
    return "Constitutional";
  }
  if (
    /property|contract|tenancy|rent|land|civil|succession|partition/.test(
      source,
    )
  ) {
    return "Civil";
  }

  return "General";
}

function toNormalizedCase(item, index) {
  const title = (item.case_title || "").trim();
  const judges = (item.judges_name_s || "").trim();
  const issues = (item.issues || "").trim();
  const decision = (item.decision || "").trim();
  const citedCases = (item.cited_cases || "").trim();
  const citation = (item.citation || "").trim();

  const summaryParts = [title, inferCaseType(`${title} ${issues}`) + " case"];
  if (issues && !issues.toLowerCase().includes("section")) {
    summaryParts.push(issues.slice(0, 120));
  }

  const fullTextParts = [judges, issues, decision, citedCases]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    case_id: `IN-SC-${String(index + 1).padStart(6, "0")}`,
    title,
    court: "Supreme Court of India",
    jurisdiction: "India",
    decision_date: parseDecisionDate(item.date_of_judgment),
    citation,
    case_type: inferCaseType(`${title} ${issues}`),
    summary: summaryParts.join(". "),
    full_text: fullTextParts,
    source_url: "https://github.com/NoelShallum/Indian_SC_Judgment_database",
    source_name: "Indian_SC_Judgment_database",
  };
}

function extractDocAnchors(html) {
  const out = [];
  const fromDocFragment =
    /<a[^>]*href=["']\/docfragment\/([0-9]+)\/?[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  const fromDocHref =
    /<a[^>]*href=["'](\/doc\/[0-9]+\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = fromDocFragment.exec(html)) !== null) {
    const docId = cleanText(match[1]);
    const label = cleanText(match[2]);
    if (!docId || !label) continue;
    out.push({ href: `/doc/${docId}/`, label });
  }

  while ((match = fromDocHref.exec(html)) !== null) {
    const href = cleanText(match[1]);
    const label = cleanText(match[2]);
    if (!href || !label || /^full\s+document$/i.test(label)) continue;
    out.push({ href, label });
  }

  return out;
}

function extractBrowseUrls(html) {
  const re = /href=["'](\/browse\/supremecourt\/[^"'#]*)["']/gi;
  const seen = new Set();
  const links = [];
  let match;

  while ((match = re.exec(html)) !== null) {
    const relative = match[1].trim();
    if (!relative) continue;
    if (!seen.has(relative)) {
      seen.add(relative);
      links.push(new URL(relative, INDIANKANOON_BROWSE_URL).toString());
    }
  }

  return links;
}

function extractSearchUrls(html) {
  const re =
    /href=["'](\/search\/\?formInput=[^"'#]*(doctypes:supremecourt|doctypes%3A%20supremecourt|doctypes%3Asupremecourt)[^"'#]*)["']/gi;
  const seen = new Set();
  const links = [];
  let match;

  while ((match = re.exec(html)) !== null) {
    const relative = match[1].trim();
    if (!relative) continue;
    if (!seen.has(relative)) {
      seen.add(relative);
      links.push(new URL(relative, INDIANKANOON_BROWSE_URL).toString());
    }
  }

  return links;
}

function buildPagedUrl(url, pageNum) {
  return `${url}${url.includes("?") ? "&" : "?"}pagenum=${pageNum}`;
}

function makeKanoonCase(doc, index) {
  const rawTitle = cleanText(doc.label);
  const dateMatch = rawTitle.match(
    /\s+on\s+([0-9]{1,2}\s+[A-Za-z]+,\s*[0-9]{4})\s*$/i,
  );
  const decisionDate = dateMatch ? parseDecisionDate(dateMatch[1]) : "";
  const title = dateMatch
    ? rawTitle.slice(0, dateMatch.index).trim()
    : rawTitle;
  return {
    case_id: `IN-KN-${String(index + 1).padStart(6, "0")}`,
    title,
    court: "Supreme Court of India",
    jurisdiction: "India",
    decision_date: decisionDate,
    citation: "",
    case_type: inferCaseType(title),
    summary: `Supreme Court of India judgment: ${title}`,
    full_text: `${title}. Judgment of the Supreme Court of India.`,
    source_url: "https://indiankanoon.org",
    source_name: "IndianKanoonBrowse",
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }
  return response.text();
}

function dedupeCases(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = `${(item.title || "").toLowerCase()}|${item.decision_date || ""}|${(item.court || "").toLowerCase()}`;
    if (!item.title || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function reindexCases(items) {
  return items.map((item, index) => ({
    ...item,
    case_id: `CASE-${String(index + 1).padStart(6, "0")}`,
  }));
}

async function fetchKanoonCases(targetCount) {
  console.log("Fetching supplemental cases from Indian Kanoon browse pages...");

  const queue = [INDIANKANOON_BROWSE_URL];
  const listingVisited = new Set();
  const docs = [];
  const docSeen = new Set();
  const maxListingPages = 500;

  while (
    queue.length > 0 &&
    listingVisited.size < maxListingPages &&
    docs.length < targetCount
  ) {
    const listingUrl = queue.shift();
    if (!listingUrl || listingVisited.has(listingUrl)) continue;
    listingVisited.add(listingUrl);

    for (
      let page = 0;
      page < MAX_PAGES_PER_MONTH && docs.length < targetCount;
      page += 1
    ) {
      const pageUrl = page === 0 ? listingUrl : buildPagedUrl(listingUrl, page);
      let html;
      try {
        html = await fetchText(pageUrl);
      } catch {
        break;
      }

      const browseLinks = extractBrowseUrls(html);
      for (const browseUrl of browseLinks) {
        if (
          !listingVisited.has(browseUrl) &&
          queue.length < maxListingPages * 2
        ) {
          queue.push(browseUrl);
        }
      }

      const searchLinks = extractSearchUrls(html);
      for (const searchUrl of searchLinks) {
        if (
          !listingVisited.has(searchUrl) &&
          queue.length < maxListingPages * 2
        ) {
          queue.push(searchUrl);
        }
      }

      const anchors = extractDocAnchors(html);
      if (anchors.length === 0 && page > 0) {
        break;
      }

      let newOnPage = 0;
      for (const anchor of anchors) {
        if (docs.length >= targetCount) break;
        if (docSeen.has(anchor.href)) continue;
        docSeen.add(anchor.href);
        docs.push(anchor);
        newOnPage += 1;
      }

      if (newOnPage === 0 && page > 0) {
        break;
      }
    }
  }

  return docs.map(makeKanoonCase);
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
  const publicDataDir = path.join(root, "public", "data");

  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  console.log("Downloading base public legal dataset...");
  const baseController = new AbortController();
  const baseTimeout = setTimeout(
    () => baseController.abort(),
    FETCH_TIMEOUT_MS,
  );
  const response = await fetch(PRIMARY_SOURCE_URL, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    signal: baseController.signal,
  });
  clearTimeout(baseTimeout);
  if (!response.ok) {
    throw new Error(`Failed to download source CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  await writeFile(path.join(rawDir, "indian_sc_source.csv"), csvText, "utf8");

  const rows = parseCsv(csvText).filter((r) =>
    r.some((cell) => `${cell}`.trim().length > 0),
  );
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

  const primaryCases = records
    .map(toNormalizedCase)
    .filter((item) => item.title.length > 0 && item.full_text.length > 0);

  let mergedCases = [...primaryCases];

  if (mergedCases.length < CASES_TARGET) {
    const needed = CASES_TARGET - mergedCases.length;
    const supplementalCases = await fetchKanoonCases(
      needed + Math.ceil(needed * 0.2),
    );
    mergedCases = mergedCases.concat(supplementalCases);
  }

  mergedCases = dedupeCases(mergedCases);
  if (mergedCases.length > CASES_TARGET) {
    mergedCases = mergedCases.slice(0, CASES_TARGET);
  }

  const cases = reindexCases(mergedCases);

  const jsonPath = path.join(processedDir, "cases_import.json");
  const csvPath = path.join(processedDir, "cases_import.csv");
  const publicJsonPath = path.join(publicDataDir, "cases_import.json");

  await writeFile(jsonPath, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${toCsv(cases)}\n`, "utf8");
  await writeFile(publicJsonPath, `${JSON.stringify(cases)}\n`, "utf8");

  console.log(
    `Fetched and normalized ${cases.length} cases (target: ${CASES_TARGET}).`,
  );
  console.log(`Primary source cases: ${primaryCases.length}`);
  console.log(
    `Supplemental cases: ${Math.max(0, cases.length - primaryCases.length)}`,
  );
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV:  ${csvPath}`);
  console.log(`Public JSON: ${publicJsonPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
