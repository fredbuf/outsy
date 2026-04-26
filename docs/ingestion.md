# Outsy Ingestion

## Ticketmaster Ingestion Strategy

### Current Setup (Vercel Hobby constraints)

Ticketmaster's Discovery API returns roughly 850 Montreal-area events across a
9-month window (10 pages at `size=100`). Fetching all pages in a single
serverless invocation risks a Vercel function timeout. The Hobby plan supports
up to 100 cron jobs, but each job may run at most once per day — sub-daily
intervals require Pro.

To work around both limits, ingestion is split into four rolling date-window
cron jobs, each covering a narrow calendar slice that fits within 3–4 API pages
and completes well inside the timeout budget.

### Workaround: Rolling Date Windows

| Window | Offset | Schedule | maxPages | ~Events | ~Pages |
|--------|--------|----------|----------|---------|--------|
| W1 | 0 – 30 days | Daily 10:00 UTC | 3 | 176 | 2 |
| W2 | 31 – 90 days | Daily 11:30 UTC | 4 | 262 | 3 |
| W3 | 91 – 180 days | Mon + Thu 12:00 UTC | 3 | 280 | 3 |
| W4 | 181 – 270 days | Monday 13:00 UTC | 3 | 133 | 2 |

Each cron passes `startOffset` and `endOffset` (integer days from now) to
`/api/cron/ingest-ticketmaster`, which converts them to absolute ISO datetimes
at runtime. The windows therefore roll forward automatically with the calendar —
no deploy needed when dates change.

Event counts and page numbers were measured via a read-only probe against the
live Ticketmaster API (`scripts/probe-ticketmaster-windows.ts`) on 2026-04-25.
Re-run the probe periodically as Montreal event volume grows.

**W2 uses `maxPages=4`** as a safety margin: the probe showed it at exactly 3
pages. One additional popular event could push it to 4, silently dropping the
last page at `maxPages=3`.

### Upsert / Deduplication

Events are upserted on `(source, source_event_id)` where `source_event_id` is
the stable Ticketmaster event ID. Running the same event through multiple
windows or multiple runs is safe — each run updates the existing row rather than
creating a duplicate.

### Known Limitations

- **Newly announced events may take up to a few days to appear.** Events
  announced today for the near future land on page 4+ of a wide date-sorted
  window. The narrow W1 window (0–30 days) catches them daily, but only after
  its scheduled run.
- **Ingestion is not real-time.** Near-term events are refreshed daily; events
  3–9 months out are only refreshed 1–2 times per week.
- **Hobby plan crons run at most once per day.** The current 7-cron setup is
  fully Hobby-compatible — all windows run daily or less frequently. Sub-daily
  sweeps (e.g. a "recently announced" check every few hours) require Pro.

### Future Improvements (Vercel Pro)

- **Add a "recently announced" sweep running multiple times per day.** Query
  Ticketmaster with `onsaleStartDateTime=now-7days` (or sort by on-sale date)
  to catch events announced in the last week regardless of their performance
  date. This directly fixes the "newly announced near-term event is missing"
  problem. Sub-daily scheduling requires Pro.
- **Target <24h ingestion freshness for all events.** Far-future events are
  currently only refreshed 1–2 times per week. On Pro, all windows can run
  daily or more frequently.
- **Consolidate into fewer jobs if desired.** A single orchestrated job with
  `maxPages=10` could replace all four TM windows, though the windowed approach
  is cleaner for rate-limit control and easier to debug.
- **Add a `locked` boolean column to the events table.** Currently every upsert
  overwrites all fields, including any manual edits made in the admin panel.
  A `locked` flag would protect hand-curated events from being overwritten.
