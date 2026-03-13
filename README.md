# Outsy

Outsy is a Montréal event discovery platform focused on music, nightlife, and art.

The goal is to centralize events from multiple platforms (Ticketmaster, promoters, manual submissions) into a single discovery experience.

## Stack

Frontend: Next.js (App Router)
Backend: Next.js API routes
Database: Supabase (PostgreSQL)
Hosting: Vercel
Cron jobs: Vercel Cron
External APIs: Ticketmaster

## Features

- Ticketmaster ingestion (admin and cron endpoints)
- Automatic event and venue upsert into `events` and `venues`
- Nightlife classification tuned for Montreal events
- Manual event submission via `/api/events/submit`
- Events discovery page with search and filters

## Environment Variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TICKETMASTER_API_KEY=...
INGEST_SECRET=...
CRON_SECRET=...
```

## Local Development

```bash
npm install
npm run dev
```

Visit [http://localhost:3000/events](http://localhost:3000/events).

## Ingestion Endpoints

- Admin manual run:
  - `POST /api/admin/ingest-ticketmaster?maxPages=1&size=50`
  - Header: `Authorization: Bearer <INGEST_SECRET>`
- Cron run:
  - `GET /api/cron/ingest-ticketmaster?maxPages=8&size=50`
  - Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel cron)
  - Query `key=<CRON_SECRET>` fallback is accepted only outside production for local testing.

## Vercel Cron

`vercel.json` is configured to call ingestion daily:

- path: `/api/cron/ingest-ticketmaster?maxPages=8&size=50`
- schedule: `0 10 * * *`
  - This is UTC (10:00 UTC daily).

Set `CRON_SECRET` in Vercel project environment variables so cron calls are authorized.

# Outsy

Outsy is a Montréal event discovery platform focused on **music, nightlife, and art events**.

The goal is to **centralize events from multiple platforms** (Ticketmaster, promoters, manual submissions) into a single discovery experience.

The product is currently an **MVP** focused on aggregating events and validating the discovery experience.

---

# Tech Stack

Frontend
- Next.js (App Router)
- TypeScript

Backend
- Next.js API Routes

Database
- Supabase (PostgreSQL)

Infrastructure
- Vercel hosting
- Vercel Cron jobs

External APIs
- Ticketmaster API

---

# Core Architecture

Event data currently comes from two sources.

## 1. Automated ingestion

Ticketmaster events are fetched and stored in Supabase.

Flow:

Ticketmaster API
↓
ingestion-ticketmaster.ts
↓
Supabase (events + venues tables)
↓
/events page

## 2. Manual submissions

Users can submit events through a form.

Flow:

Submit form
↓
POST /api/events/submit
↓
Supabase events table
↓
Visible on /events

Manual submissions currently publish immediately but may move to a **moderation flow** later.

---

# Repository Structure

src/

app/
  events/
    page.tsx                → Events discovery page
    SubmitEventForm.tsx     → Event submission form

  api/
    events/submit/           → Manual event submission endpoint
    cron/ingest-ticketmaster → Daily ingestion endpoint
    admin/ingest-ticketmaster → Manual ingestion endpoint

lib/
  ingestion-ticketmaster.ts → Ticketmaster ingestion logic
  supabase-browser.ts       → Browser Supabase client
  supabase-server.ts        → Server-only Supabase client

---

# Database Schema Notes

## event_source enum

The `events.source` column is backed by a PostgreSQL enum type called `event_source`.

Current values: `ticketmaster`, `manual`

**Adding a new ingestion source (e.g. Eventbrite) requires a migration before the first upsert:**

```sql
ALTER TYPE event_source ADD VALUE 'eventbrite';
```

Run this in the Supabase SQL editor before deploying the corresponding ingestion adapter.
Without it, any insert/upsert with the new source value will fail with a type error.

The `ingest_runs.source` column is plain `text` and does not require a migration.

---

# Supabase Security Model

Two Supabase clients are used.

## Browser client

src/lib/supabase-browser.ts

Uses:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

This client is safe for the browser and respects Supabase Row Level Security (RLS).

## Server client

src/lib/supabase-server.ts

Uses:

SUPABASE_SERVICE_ROLE_KEY

This file includes:

import "server-only"

The **service role key must never reach the browser bundle**.

It is used only for:

- ingestion
- secure server mutations
- admin endpoints

---

# Features

Current MVP features:

- Ticketmaster ingestion (admin + cron)
- Automatic event and venue upsert
- Nightlife classification tuned for Montréal events
- Manual event submission
- Events discovery page
- Search and filters

---

# Environment Variables

Create `.env.local`:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

SUPABASE_SERVICE_ROLE_KEY=...

TICKETMASTER_API_KEY=...

INGEST_SECRET=...
CRON_SECRET=...

Never expose the following values in the browser:

SUPABASE_SERVICE_ROLE_KEY
INGEST_SECRET
CRON_SECRET

---

# Local Development

Install dependencies:

npm install

Run the development server:

npm run dev

Visit:

http://localhost:3000/events

---

# Ingestion Endpoints

## Manual admin ingestion

POST /api/admin/ingest-ticketmaster

Query parameters:

maxPages
size

Auth header:

Authorization: Bearer <INGEST_SECRET>

---

## Cron ingestion

GET /api/cron/ingest-ticketmaster

Auth header:

Authorization: Bearer <CRON_SECRET>

Query parameters:

maxPages
size

Query `key=<CRON_SECRET>` fallback is accepted **only outside production** for local testing.

---

# Vercel Cron

`vercel.json` triggers ingestion daily.

path: /api/cron/ingest-ticketmaster?maxPages=8&size=50
schedule: 0 10 * * *

This runs **10:00 UTC daily**.

Set `CRON_SECRET` in Vercel environment variables.

---

# Product Status

Outsy is currently an **early MVP**.

Working features:

- Ticketmaster ingestion
- Events discovery
- Manual event submissions
- Search and filters

Planned improvements:

- Event moderation
- Promoter accounts
- Additional event sources
- Improved nightlife classification

---

# AI Development Workflow

This repository is designed to work with AI coding assistants (Claude Code, Codex, etc).

When modifying code:

1. Prefer **small safe changes**
2. Avoid exposing secrets
3. Respect Supabase client separation
4. Do not introduce build-time network dependencies
5. Do not break ingestion endpoints

Before committing changes run:

npm run lint
npm run build

---

# Deployment

Deployments are handled automatically by **Vercel**.

Any push to:

main

triggers a production deployment.

Environment variables must be configured in the Vercel project settings.