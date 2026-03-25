# PostgreSQL Setup

This folder contains the database schema for LexMatch AI.

## Files

- `schema.sql`: core schema for `cases`, `tags`, `case_tags`, and `case_metadata`.

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

## Optional: use explicit connection URL

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lexmatch_ai"
psql $env:DATABASE_URL -f server/db/schema.sql
```
