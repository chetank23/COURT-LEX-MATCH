# Data Folder

This folder stores fetched and normalized legal case data.

## Structure

- `data/raw/indian_sc_source.csv`: raw source file downloaded from a public dataset.
- `data/processed/cases_import.json`: normalized JSON for ingestion.
- `data/processed/cases_import.csv`: normalized CSV for ingestion.
- `public/data/cases_import.json`: runtime JSON used directly by the frontend.

## Fetch Command

Run:

```bash
npm run data:fetch
```

To target a larger/smaller dataset size, set `CASES_TARGET`:

```bash
CASES_TARGET=12000 npm run data:fetch
```

Optional crawl depth control:

```bash
INDIANKANOON_MAX_PAGES_PER_MONTH=80 npm run data:fetch
```

## Source

- Dataset: Indian Supreme Court judgments
- Repository: https://github.com/NoelShallum/Indian_SC_Judgment_database
- Supplemental source: Indian Kanoon Supreme Court public browse listings
- URL: https://indiankanoon.org/browse/supremecourt/
- Fallback enrichment: unique cited-case titles extracted from public cited-cases metadata in the primary dataset
