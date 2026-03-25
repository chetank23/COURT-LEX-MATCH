# Data Folder

This folder stores fetched and normalized legal case data.

## Structure

- `data/raw/indian_sc_source.csv`: raw source file downloaded from a public dataset.
- `data/processed/cases_import.json`: normalized JSON for ingestion.
- `data/processed/cases_import.csv`: normalized CSV for ingestion.

## Fetch Command

Run:

```bash
npm run data:fetch
```

## Source

- Dataset: Indian Supreme Court judgments
- Repository: https://github.com/NoelShallum/Indian_SC_Judgment_database
