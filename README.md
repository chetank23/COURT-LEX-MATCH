# LexMatch AI

Legal research and case-analysis workspace with API-backed search, PDF analysis, and dashboard flows.

## Key Scripts

- `npm run dev` - start frontend
- `npm run dev:server` - start backend API
- `npm run test:api` - API smoke tests
- `npm run test:api:pdf` - PDF analysis API tests
- `npm run test:api:ratelimit` - API rate limit tests
- `npm run test:api:limits` - request size and malformed JSON tests
- `npm run test:api:obs` - observability endpoint tests
- `npm run test:api:load` - load/performance smoke test
- `npm run typecheck` - TypeScript project checks

## PDF Analysis Runtime Controls

The backend `/api/analyze-pdf` pipeline uses layered extraction:

1. direct PDF text extraction
2. OCR fallback on rendered page image
3. metadata fallback if both fail

Environment variables:

- `LEXMATCH_ENABLE_PDF_OCR` : set to `0` to disable OCR fallback
- `LEXMATCH_PDF_OCR_TIMEOUT_MS` : OCR timeout in ms (default `15000`)
- `LEXMATCH_PDF_OCR_MAX_BYTES` : max PDF size (bytes) allowed for OCR (default `8388608`)
- `LEXMATCH_PDF_OCR_WIDTH` : rendered page width used before OCR (default `1400`)
- `LEXMATCH_MAX_JSON_BODY_BYTES` : max JSON request body size accepted by API (default `12582912`)
- `LEXMATCH_RATE_LIMIT_WINDOW_MS` : shared rate-limit window in ms (default `60000`)
- `LEXMATCH_RATE_LIMIT_SEARCH_MAX` : max `/api/cases/search` requests per client/window (default `120`)
- `LEXMATCH_RATE_LIMIT_ANALYZE_MAX` : max `/api/analyze-pdf` requests per client/window (default `20`)
- `LEXMATCH_ENABLE_REQUEST_LOGS` : set to `0` to disable JSON request logs with request-id and latency
- `LEXMATCH_AUDIT_MAX_EVENTS` : max in-memory audit events retained (default `3000`)

## Observability Endpoints

- `GET /api/health` : service status + uptime
- `GET /api/metrics` : request counters, status-class rates, and latency snapshots
- `GET /api/audit?limit=50` : latest mutation audit events (judge/hearing/history/pdf actions)

## Search Engine Notes

- `/api/cases/search` now combines lexical matching with a local hashed-vector semantic score.
- No paid AI API is required for this retrieval path.

## Optional DeepSeek-R1 Generation

The server can optionally post-process grounded RAG answers and case explanations with DeepSeek-R1.

Environment variables:

- `DEEPSEEK_API_KEY` : enables DeepSeek generation when set
- `DEEPSEEK_BASE_URL` : overrides the API base URL, default `https://api.deepseek.com`
- `DEEPSEEK_MODEL` : model name to use, default `deepseek-r1`
- `DEEPSEEK_TIMEOUT_MS` : request timeout in ms, default `30000`

If these variables are not configured, the API keeps using the local retrieval and explanation pipeline.
