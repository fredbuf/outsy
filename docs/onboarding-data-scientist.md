# Outsy — Data Scientist Onboarding

Welcome. This doc covers the product, the data model, the ingestion pipeline, known quality issues, the privacy rules you must respect, and your first tasks. Read it alongside `docs/ingestion.md` and `docs/venue-audit.sql`.

---

## 1. Product overview

Outsy is a Montreal-first event discovery app. It aggregates public events from external sources — **Ticketmaster** (Discovery API), **Eventbrite**, and venue scrapers for **SAT** (Société des arts technologiques) and **New City Gas** — into a single feed, and also supports user-created private/social events, RSVPs, friends, messaging, and organizer pages.

- **Stack:** Next.js (App Router) on Vercel, Supabase (Postgres + Auth + RLS), Vercel Cron for ingestion.
- **Focus:** music, nightlife, and arts/culture in Montreal; categories are `concerts | nightlife | arts_culture | comedy | sports | family`.
- **Your mandate:** event inventory quality, venue deduplication, categorization, recommendation/ranking logic, and future analytics.

## 2. Data architecture and key Supabase tables

All data lives in one Supabase Postgres database. The app reads it two ways:

- **Browser client** (`src/lib/supabase-browser.ts`) — anon/authenticated role, **RLS enforced**.
- **Server client** (`src/lib/supabase-server.ts`) — service-role key, **bypasses RLS**. Used by ingestion, cron, and some server routes.

### Core catalog (public data — your main playground)

| Table | What it is |
|---|---|
| `events` | The central table. Key columns: `title`, `title_normalized`, `description`, `start_at`/`end_at` (UTC), `timezone` (`America/Toronto`), `status` (`scheduled`/`announced`/`postponed`/`cancelled`), `category_primary`, `tags`, `min_price`/`max_price`/`currency`, `image_url`, `source`, `source_event_id`, `source_url`, `venue_id`, `city_normalized`, `visibility` (`public`/`private`/`unlisted`), `is_approved`, `is_rejected`, `creator_id`. Unique on `(source, source_event_id)`. |
| `venues` | Canonical venues: `name`, `name_normalized`, `city_normalized`, `address_line1`, `postal_code`, `lat`/`lng`, `timezone`. Unique on `(name_normalized, city_normalized)`. |
| `venue_aliases` | Maps name variants → canonical venue (`alias_normalized`, `city_normalized`, `venue_id`). This is the venue-dedup mechanism; see `supabase/migrations/20260426_venue_aliases_and_escogriffe_merge.sql` for the pattern. |
| `organizers` | Venues-as-organizers (`type='venue'`, auto-created at ingest) plus real promoter/organizer accounts, with slugs, handles, and social links. |
| `event_organizers` | Join table event ↔ organizer with `role` and `sort_order`. |
| `ingest_runs` | One row per ingestion run: `source`, timings, `status`, `ingested_count`, `skipped_count`, `venues_upserted`, `error_message`. Your first stop for pipeline observability. |

### Social / user data (PII — handle with care, see §5 and §8)

| Table | What it is |
|---|---|
| `profiles` | User profiles (username, bio, links, avatar). |
| `rsvps` | User ↔ event attendance intents (user-based, deduped). |
| `friendships` | Friend graph. |
| `messages` | DMs, including event sharing and organizer messaging. |
| `notifications` | Per-user notifications. |
| `moments` (+ `comments`, `survey_options`, `survey_votes`) | Social posts with comments and polls. |
| `organizer_follows` / `organizer_followers` | Follow graph for organizers. |
| `handles` | Global handle registry (users + organizers) with rename cooldown. |

Schema DDL is split between `supabase/migrations/` (newer, dated) and `migrations/` (older, run manually in the SQL editor). Some early DDL (e.g. the original `events`/`venues` creation) predates the migration files, so treat the live database as the source of truth and the SQL files as documentation of intent.

## 3. Event ingestion pipeline

All adapters live in `src/lib/ingestion-*.ts` and are triggered by Vercel Cron via `src/app/api/cron/ingest-*` routes (auth via `CRON_SECRET`). `src/lib/ingestion-shared.ts` holds the shared logic: text normalization (lowercase, strip diacritics), HTML entity decoding/tag stripping, `upsertVenue`, cross-source duplicate detection, and venue-organizer attachment.

**Sources:**
- **Ticketmaster** (`ingestion-ticketmaster.ts`) — the workhorse. ~850 Montreal events over 9 months, fetched via **four rolling date-window cron jobs** (0–30d daily, 31–90d daily, 91–180d 2×/week, 181–270d weekly) to fit Vercel Hobby's one-run-per-day cron limit and function timeout. Details and measured page counts: `docs/ingestion.md`.
- **Eventbrite** (`ingestion-eventbrite.ts`).
- **SAT** and **New City Gas** (`ingestion-venue-sat.ts`, `ingestion-venue-newcitygas.ts`) — per-venue scrapers (JSON-LD / site parsing).
- **Manual submissions** via `/api/events/submit` (moderated through `is_approved`).

**Write path per event:**
1. `upsertVenue` — alias lookup first (`venue_aliases`), then upsert on `(name_normalized, city_normalized)`; backfills missing address/lat/lng on alias matches.
2. Status derivation — Ticketmaster's status codes are unreliable, so `announced` is derived from `sales.public.startDateTime > now`; `postponed`/`cancelled` from status codes. Rescheduled TM events get a *new* source ID; the old row is kept but marked `postponed`.
3. Event upsert on `(source, source_event_id)` — safe to re-run; **overwrites all fields on every run** (no `locked` flag yet, so manual admin edits get clobbered).
4. `attachVenueOrganizer` — ensures a `type='venue'` organizer exists and links it.
5. Cross-source dedup — `findDuplicateEvent` suppresses an incoming event if another source already has the same `title_normalized` on the same local date at the same venue (or same city if no venue).
6. Run bookkeeping in `ingest_runs`.

## 4. Known data quality issues

These are your problem space, roughly in priority order:

1. **Venue duplicates.** Alias-based dedup only catches known variants. Unknown name variants across sources still create duplicate venue rows. `docs/venue-audit.sql` has ready-made read-only audit queries (exact-name dupes, geo-proximity ~50 m near-dupes, etc.).
2. **Cross-source event duplicates.** `findDuplicateEvent` requires an *exact* `title_normalized` match on the same date. Title variations ("DJ X at SAT" vs "DJ X — SAT Montréal") slip through. No fuzzy matching exists.
3. **Ingest overwrites manual curation.** Every upsert rewrites all fields; hand-edited events revert on the next cron run. A `locked` column is planned but not built.
4. **Freshness gaps.** Near-term events refresh daily; events 3–9 months out only refresh 1–2×/week. Newly announced near-term events can take days to appear (see `docs/ingestion.md`).
5. **Category quality.** `category_primary` comes from per-source heuristics (`pickCategory` in each adapter); `tags` is empty (`[]`) for ingested events. Nightlife classification is hand-tuned; no evaluation of accuracy exists.
6. **Description noise.** Descriptions are scraped/sanitized (HTML stripped, TM boilerplate discarded — sometimes to `NULL`). Coverage and quality vary a lot by source. Bilingual (FR/EN) content is mixed with no language tagging.
7. **Sparse price data.** `min_price`/`max_price` only exist where the source exposes them; many rows are null.

## 5. Privacy and RLS rules you must respect

RLS is the real security boundary — the browser client enforces it, but the **service-role key bypasses it entirely**.

- **Public events surface:** anon and authenticated read policies on `events` allow only `is_approved = true AND is_rejected = false AND status IN ('scheduled','announced') AND visibility = 'public'`. Any analysis that feeds *user-facing* output must respect the same filter — never leak `private`/`unlisted` events, unapproved submissions, or rejected rows into recommendations, counts, or exports.
- **Venues** are fully readable (no sensitive data).
- **PII tables** (`profiles`, `rsvps`, `friendships`, `messages`, `notifications`, `moments`, `survey_votes`) have per-user RLS policies. With service-role access you can see everything, so the rules are on you:
  - **Never read `messages` content** for analytics. Metadata (counts, timestamps) only, and only if aggregated.
  - RSVP, friendship, and follow data may be used **only in aggregate or for the user's own recommendations** — never expose "who is going" beyond what the app already shows.
  - No PII in exported datasets, notebooks committed to the repo, third-party tools, or LLM prompts. Use user IDs (UUIDs), not usernames/emails, in any analysis artifacts.
- Migration history shows RLS policies have been hand-tuned to fix real bugs (`migrations/fix_rls_authenticated_read.sql`, `rls_allow_announced_events.sql`). **Do not modify any policy without approval** — a wrong policy either leaks private data or blanks the app for all users.

## 6. Recommendation opportunities

Signals already in the database, roughly by strength:

- **RSVPs** — the strongest explicit signal (user ↔ event, with category/venue/organizer/price/time features derivable via joins).
- **Friend graph** — social proof ("friends going") and collaborative filtering over friends' RSVPs.
- **Organizer/venue follows** — direct interest declarations; new events from followed organizers are easy, high-precision recommendations.
- **Event sharing in messages** — implicit interest signal (metadata only, per §5).
- **Content features** — `category_primary`, venue, price range, day-of-week/time, organizer.

Sensible progression: (1) heuristic ranking — boost followed organizers, friends' RSVPs, category affinity from a user's RSVP history, with time/distance decay; (2) simple collaborative filtering once RSVP volume justifies it; (3) learned ranking later. **Missing today:** no impression/click/view tracking — you can't compute CTR or build implicit-feedback models until an events-analytics table exists. Proposing that schema is one of your first tasks.

## 7. Suggested first tasks

1. **Run the venue audit** (`docs/venue-audit.sql`, read-only) → produce a ranked list of duplicate venue clusters with a proposed canonical row for each. Then propose (not run) merge SQL following the `20260426_venue_aliases_and_escogriffe_merge.sql` pattern.
2. **Quantify cross-source event duplication.** Fuzzy-match `title_normalized` (trigram similarity is available in Postgres) within same-date/same-venue-or-city windows. Report precision on a hand-checked sample before proposing any suppression rule changes.
3. **Audit `category_primary`.** Sample ~200 events across sources, hand-label, and measure the heuristics' accuracy per source and per category. Propose fixes (rules or a lightweight classifier).
4. **Data-quality dashboard queries** off `events` + `ingest_runs`: null-rates per field per source, freshness (time since last successful run per source/window), event counts per category/venue, description coverage.
5. **Draft the analytics event schema** (impressions, detail views, outbound ticket clicks, RSVP funnel) and a privacy-respecting design for it, so ranking work has training data later.
6. **Prototype a heuristic feed ranking** (SQL or notebook) using RSVPs, follows, and friend signals — evaluated offline against recent RSVP behavior.

## 8. Safe access guidelines

**Read freely (analysis/notebooks):**
- `events`, `venues`, `venue_aliases`, `organizers`, `event_organizers`, `ingest_runs` — the full catalog, including non-public rows, for *internal* quality analysis.
- Aggregates over `rsvps`, `friendships`, `organizer_follows` (counts, distributions — no per-user exports).

**Do not read without a specific approved purpose:**
- `messages` content, `notifications`, individual `profiles` fields beyond IDs, `moments` content.

**Do not modify without explicit approval:**
- Any **RLS policy**, database function/RPC, or trigger.
- Production rows in `events`/`venues` (including "obvious" dedup merges — propose SQL for review instead; merges must repoint `events.venue_id`, `organizers.venue_id`, and add `venue_aliases` rows atomically).
- Ingestion code paths or cron schedules (`vercel.json`, `src/app/api/cron/*`, `src/lib/ingestion-*`) — the window/page settings encode measured API limits.
- Never write with the service-role key from a notebook. For experiments, use a Supabase branch/staging project or local snapshot.

**Secrets:** you'll receive `SUPABASE_SERVICE_ROLE_KEY` (read analysis), `TICKETMASTER_API_KEY`, etc. via `.env.local` — never commit them, never paste them into notebooks that get committed.

## 9. Questions to answer after your data review

1. How many venue rows exist, and what fraction are duplicates (exact, geo-proximate, fuzzy-name)? What's the top-20 merge list?
2. What's the cross-source event duplication rate that slips past the exact-title check, and which source pairs collide most?
3. Per source: what are the null-rates for `description`, `image_url`, price fields, `end_at`, and venue lat/lng? Which source needs adapter fixes first?
4. How accurate is `category_primary` per source, and where do the heuristics systematically fail (e.g. nightlife vs concerts)?
5. What does the RSVP distribution look like (per user, per event, per category)? Is there enough signal for collaborative filtering, or should ranking stay heuristic for now?
6. How fresh is the inventory in practice — distribution of `updated_at` lag by event date window, and how often do `ingest_runs` fail?
7. What share of events have no `venue_id`, and what would it take to resolve them?
8. Is the current 4-window Ticketmaster schedule still sized right (re-run `scripts/probe-ticketmaster-windows.ts`), or is a page silently being dropped?
