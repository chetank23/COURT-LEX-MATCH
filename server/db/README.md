# PostgreSQL Setup

This folder contains the database schema for LexMatch AI.

## Files

- `schema.sql`: core schema for `cases`, `tags`, `case_tags`, `case_metadata`, `judges`, `hearings`, and `activity_history`.
- `store.mjs`: storage adapter used by the API. Uses PostgreSQL when `DATABASE_URL` is set; falls back to in-memory storage otherwise.

## Prerequisites

1. Install PostgreSQL 15+ on your machine.
2. Ensure `psql` command is available in your terminal.

## Local Setup Steps (Windows / PowerShell)

1. Create a database user (or use existing `postgres` user).
2. Create the project database:

```powershell
createdb lexmatch_ai
```

3. Apply schema:

```powershell
psql -d lexmatch_ai -f server/db/schema.sql
```

4. Verify tables:

```powershell
psql -d lexmatch_ai -c "\dt"
```

You should see:

- `cases`
- `tags`
- `case_tags`
- `case_metadata`
- `judges`
- `hearings`
- `activity_history`

## Optional: use explicit connection URL

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lexmatch_ai"
psql $env:DATABASE_URL -f server/db/schema.sql
```

## Runtime behavior

- If `DATABASE_URL` is provided, server APIs read/write to PostgreSQL.
- If `DATABASE_URL` is not set (or database is unavailable), APIs for judges/hearings/history continue to work using in-memory fallback data for local development.
