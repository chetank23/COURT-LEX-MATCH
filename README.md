# Court-Lex-Match

> AI-powered legal research and case-intelligence platform — search Indian court cases, analyse PDFs, manage judge assignments, and track hearings with a real-time dashboard.

[![CI](https://github.com/chetank23/COURT-LEX-MATCH/actions/workflows/ci.yml/badge.svg)](https://github.com/chetank23/COURT-LEX-MATCH/actions/workflows/ci.yml)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Features](#features)
- [API Reference](#api-reference)
  - [Cases](#cases)
  - [RAG Query](#rag-query)
  - [Case Analysis](#case-analysis)
  - [Judges](#judges)
  - [Hearings](#hearings)
  - [PDF Analysis](#pdf-analysis)
  - [Observability](#observability)
- [PDF Analysis Runtime Controls](#pdf-analysis-runtime-controls)
- [Search Engine Notes](#search-engine-notes)
- [Optional DeepSeek-R1 Generation](#optional-deepseek-r1-generation)
- [Deployment](#deployment)
  - [Frontend (Vercel / Netlify)](#frontend-vercel--netlify)
  - [Backend (Node.js server)](#backend-nodejs-server)
  - [Database Setup](#database-setup)
- [CI/CD Pipeline](#cicd-pipeline)
- [Contributing](#contributing)

---

## Overview

Court-Lex-Match is a full-stack legal intelligence workspace built with **React + Vite** on the frontend and a standalone **Node.js HTTP server** on the backend. It ingests a corpus of Indian court judgments, indexes them with a local hashed-vector semantic search engine, and exposes a rich set of APIs for search, PDF analysis, RAG-grounded Q&A, judge management, and hearing scheduling.

---

## Tech Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Animation  | Framer Motion                                       |
| Charts     | Recharts                                            |
| Backend    | Node.js (ESM), built-in `http` module               |
| Database   | SQLite via `better-sqlite3`                         |
| PDF        | `pdf-parse` + `tesseract.js` OCR fallback           |
| AI (opt.)  | DeepSeek-R1 via REST API                            |
| Testing    | Vitest (unit), Playwright (E2E)                     |
| CI/CD      | GitHub Actions                                      |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20 LTS
- **npm** ≥ 10

### Installation

```bash
# Clone the repo
git clone https://github.com/chetank23/COURT-LEX-MATCH.git
cd COURT-LEX-MATCH

# Install all dependencies
npm install

# Copy and edit the environment file
cp .env.example .env
```

### Running Locally

Both the frontend dev server and the API server must run simultaneously:

```bash
# Option 1 — run both in one terminal (recommended)
npm run dev:all

# Option 2 — run in separate terminals
npm run dev          # Frontend on http://localhost:8080
npm run dev:server   # API server on http://localhost:4000
```

> **First-run setup**: The SQLite database is created automatically on first start via `npm run db:migrate`.
> If you want to seed it with sample data from `lexmatch_database_dump.json`, run:
> ```bash
> npm run db:migrate
> ```

---

## Environment Variables

Copy `.env.example` to `.env` and set the values:

```env
# API server port (default: 4000)
PORT=4000

# Node environment (development | production | test)
NODE_ENV=development

# SQLite database file path (auto-created if missing)
# DATABASE_PATH=data/lexmatch.db

# Frontend API base URL — set this in your hosting environment
VITE_API_BASE=http://localhost:4000
```

### PDF Analysis Controls

| Variable                        | Default    | Description                                        |
|---------------------------------|------------|----------------------------------------------------|
| `LEXMATCH_ENABLE_PDF_OCR`       | `1`        | Set to `0` to disable Tesseract OCR fallback       |
| `LEXMATCH_PDF_OCR_TIMEOUT_MS`   | `15000`    | OCR timeout in milliseconds                        |
| `LEXMATCH_PDF_OCR_MAX_BYTES`    | `8388608`  | Max PDF size allowed for OCR (8 MB)                |
| `LEXMATCH_PDF_OCR_WIDTH`        | `1400`     | Rendered page width used before OCR                |
| `LEXMATCH_MAX_JSON_BODY_BYTES`  | `12582912` | Max JSON request body accepted by the API (12 MB)  |

### Rate Limiting Controls

| Variable                         | Default  | Description                                            |
|----------------------------------|----------|--------------------------------------------------------|
| `LEXMATCH_RATE_LIMIT_WINDOW_MS`  | `60000`  | Rate-limit window in ms (1 minute)                     |
| `LEXMATCH_RATE_LIMIT_SEARCH_MAX` | `120`    | Max `/api/cases/search` requests per client per window |
| `LEXMATCH_RATE_LIMIT_ANALYZE_MAX`| `20`     | Max `/api/analyze-pdf` requests per client per window  |

### Observability Controls

| Variable                       | Default | Description                                        |
|--------------------------------|---------|----------------------------------------------------|
| `LEXMATCH_ENABLE_REQUEST_LOGS` | `1`     | Set to `0` to disable JSON request logs            |
| `LEXMATCH_AUDIT_MAX_EVENTS`    | `3000`  | Max in-memory audit events retained                |

### DeepSeek-R1 (Optional)

| Variable              | Default                         | Description                        |
|-----------------------|---------------------------------|------------------------------------|
| `DEEPSEEK_API_KEY`    | _(unset)_                       | Enables DeepSeek generation when set |
| `DEEPSEEK_BASE_URL`   | `https://api.deepseek.com`      | Override the API base URL          |
| `DEEPSEEK_MODEL`      | `deepseek-r1`                   | Model name                         |
| `DEEPSEEK_TIMEOUT_MS` | `30000`                         | Request timeout in ms              |

If `DEEPSEEK_API_KEY` is not set, the API uses the local retrieval and explanation pipeline — **no paid API key is required for core functionality**.

---

## Available Scripts

| Script                      | Description                                              |
|-----------------------------|----------------------------------------------------------|
| `npm run dev`               | Start Vite frontend dev server (port 8080)               |
| `npm run dev:server`        | Start Node.js API server (port 4000)                     |
| `npm run dev:all`           | Start both frontend and backend concurrently             |
| `npm run build`             | Production build of the frontend (outputs to `dist/`)    |
| `npm run preview`           | Preview the production build locally                     |
| `npm run lint`              | Run ESLint across the entire project                     |
| `npm run typecheck`         | TypeScript project check (no emit)                       |
| `npm run test`              | Run Vitest unit tests                                    |
| `npm run test:watch`        | Run Vitest in watch mode                                 |
| `npm run test:e2e`          | Run Playwright E2E smoke tests                           |
| `npm run db:migrate`        | Create / migrate the SQLite database                     |
| `npm run db:reset`          | Delete and recreate the database from scratch            |
| `npm run rag:index`         | Build the RAG vector index from the case corpus          |
| `npm run data:fetch`        | Fetch latest public case data                            |
| `npm run test:api`          | API smoke tests against a running server                 |
| `npm run test:api:pdf`      | PDF analysis API tests                                   |
| `npm run test:api:ratelimit`| Rate limit tests                                         |
| `npm run test:api:limits`   | Request size and malformed JSON tests                    |
| `npm run test:api:obs`      | Observability endpoint tests                             |
| `npm run test:api:load`     | Load / performance smoke test                            |
| `npm run test:api:rag`      | RAG integration tests                                    |

---

## Project Structure

```
COURT-LEX-MATCH/
├── public/
│   └── data/
│       └── cases_import.json   # Indian court case corpus (~14 MB)
├── server/
│   ├── index.mjs               # API server entry point
│   ├── db/
│   │   ├── schema.sql          # SQLite schema
│   │   └── store.mjs           # DB query layer
│   ├── services/
│   │   ├── summarizer.mjs
│   │   ├── similarity.mjs
│   │   ├── ragService.mjs
│   │   ├── deepseekClient.mjs
│   │   ├── explanationGenerator.mjs
│   │   └── judgementMapper.mjs
│   └── tests/                  # API integration tests
├── src/
│   ├── components/             # Shared UI components
│   ├── contexts/               # React contexts (Auth, Search)
│   ├── hooks/                  # Custom React hooks
│   ├── pages/                  # Page-level components
│   ├── services/
│   │   └── dataService.ts      # Frontend API client
│   ├── types/                  # TypeScript type definitions
│   └── main.tsx                # App entry point
├── scripts/                    # Utility scripts (migrate, rag index, etc.)
├── e2e/                        # Playwright E2E tests
├── .env.example                # Environment variable template
├── .github/workflows/ci.yml    # GitHub Actions CI pipeline
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Features

| Feature                     | Description                                                                     |
|-----------------------------|---------------------------------------------------------------------------------|
| **AI Case Search**          | Combines keyword + local hashed-vector semantic search — no external AI API needed |
| **RAG Q&A**                 | Retrieval-augmented generation answers grounded in your case corpus             |
| **PDF Analyzer**            | Upload a legal PDF → structured section extraction with OCR fallback            |
| **Case Priority Dashboard** | Auto-scores cases by urgency, impact, deadline risk, and severity               |
| **Judge Assignment Center** | Assign judges based on availability, case type, and AI recommendation           |
| **Hearing Calendar**        | Schedule, view, and manage court hearings with conflict detection                |
| **Insights Dashboard**      | Similarity distribution, trending topics, case cluster charts                   |
| **Secure Workspace**        | Protected routes with role-based access                                         |
| **History Timeline**        | Audit trail of all user actions                                                 |
| **Observability**           | `/api/health`, `/api/metrics`, `/api/audit` endpoints                           |

---

## API Reference

All endpoints are served by the Node.js server on port **4000** by default. The frontend reads `VITE_API_BASE` to locate the server.

### Cases

| Method | Path                             | Description                           |
|--------|----------------------------------|---------------------------------------|
| GET    | `/api/cases`                     | List all cases (filterable by `court`, `type`) |
| GET    | `/api/cases/search?q=&limit=5`   | Semantic + keyword case search         |
| GET    | `/api/cases/:id`                 | Get a single case by ID                |
| GET    | `/api/cases/:id/explain`         | Get match explanation for a case       |
| GET    | `/api/cases/:id/humanize`        | Get humanized narrative for a case     |

### RAG Query

| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| GET    | `/api/rag/query?q=` | RAG-grounded answer (GET form)   |
| POST   | `/api/rag/query`  | RAG-grounded answer (POST JSON)    |

### Case Analysis

| Method | Path                  | Description                               |
|--------|-----------------------|-------------------------------------------|
| POST   | `/api/case-analysis`  | Structured legal reasoning on a case context |

### Judges

| Method | Path               | Description              |
|--------|--------------------|--------------------------|
| GET    | `/api/judges`      | List all judges          |
| POST   | `/api/judges`      | Create a judge           |
| GET    | `/api/judges/:id`  | Get a judge by ID        |
| PUT    | `/api/judges/:id`  | Update a judge           |
| DELETE | `/api/judges/:id`  | Delete a judge           |

### Hearings

| Method | Path                  | Description                          |
|--------|-----------------------|--------------------------------------|
| GET    | `/api/hearings`       | List hearings (filterable by `caseId`, `judgeId`) |
| POST   | `/api/hearings`       | Schedule a hearing (conflict detection included) |
| PUT    | `/api/hearings/:id`   | Update a hearing                     |
| DELETE | `/api/hearings/:id`   | Cancel a hearing                     |

### PDF Analysis

| Method | Path               | Description                                |
|--------|--------------------|--------------------------------------------|
| POST   | `/api/analyze-pdf` | Upload and analyse a legal PDF (base64 body) |

### Observability

| Method | Path                     | Description                                         |
|--------|--------------------------|-----------------------------------------------------|
| GET    | `/api/health`            | Service status and uptime                           |
| GET    | `/api/metrics`           | Request counters, status rates, latency percentiles |
| GET    | `/api/audit?limit=50`    | Latest mutation audit events                        |

---

## PDF Analysis Runtime Controls

The backend `/api/analyze-pdf` pipeline uses layered extraction:

1. Direct PDF text extraction via `pdf-parse`
2. OCR fallback on a rendered page image via `tesseract.js`
3. Metadata fallback if both fail

Control behaviour via environment variables (see [Environment Variables](#environment-variables) above).

---

## Search Engine Notes

- `/api/cases/search` combines **lexical keyword matching** with a **local hashed-vector semantic score**.
- No paid AI API is required for this retrieval path.
- The RAG index is pre-built from the case corpus using `npm run rag:index` and persisted to `public/data/rag_index.json`. This file is excluded from git (it is ~29 MB) — rebuild it after cloning:

```bash
npm run rag:index
```

---

## Optional DeepSeek-R1 Generation

The server can optionally post-process RAG answers and case explanations with DeepSeek-R1. Set `DEEPSEEK_API_KEY` in your `.env` to enable. Without it, all features work using the local pipeline.

---

## Deployment

### Frontend (Vercel / Netlify)

1. Set the build command to `npm run build`
2. Set the output directory to `dist`
3. Add the environment variable `VITE_API_BASE` pointing to your deployed API server URL

```
VITE_API_BASE=https://your-api-server.example.com
```

### Backend (Node.js server)

The API server (`server/index.mjs`) is a plain Node.js ESM script with no framework dependencies beyond `better-sqlite3` and `pdf-parse`.

**Example — run with PM2:**

```bash
npm install -g pm2
pm run db:migrate           # one-time setup
pm2 start server/index.mjs --name court-lex-api
pm2 save
```

**Example — Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN node scripts/migrate.mjs
EXPOSE 4000
CMD ["node", "server/index.mjs"]
```

### Database Setup

The SQLite database is auto-created on first start. To initialise manually:

```bash
npm run db:migrate
```

To reset (drops all data):

```bash
npm run db:reset
```

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request:

1. **Lint** — ESLint with TypeScript rules
2. **Typecheck** — `tsc --noEmit`
3. **Unit tests** — Vitest (12 tests across 3 suites)
4. **Build** — Vite production build
5. **DB migrate** — initialise SQLite
6. **Start API server** — background process
7. **E2E smoke tests** — Playwright (Chromium)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and ensure all quality gates pass:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
4. Commit your changes: `git commit -m "feat: my feature"`
5. Push and open a pull request
