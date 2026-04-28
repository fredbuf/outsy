-- =============================================================================
-- Venue Duplicate Audit Queries
-- Read-only. Does not modify any data.
-- Run each section independently in the Supabase SQL editor.
-- Review order: highest-confidence duplicates first.
-- =============================================================================


-- ─── SECTION 1 ───────────────────────────────────────────────────────────────
-- Exact duplicate: same name_normalized + city_normalized
-- Confidence: EXACT — should never exist after the unique constraint was added,
-- but may exist if the constraint was added after data was already loaded.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  v.id,
  v.name,
  v.name_normalized,
  v.address_line1,
  v.lat,
  v.lng,
  v.created_at,
  v.updated_at,
  COUNT(e.id)            AS event_count,
  -- Marks the row with the most data as the recommended canonical row.
  ROW_NUMBER() OVER (
    PARTITION BY v.name_normalized, v.city_normalized
    ORDER BY
      (v.address_line1 IS NOT NULL) DESC,
      (v.lat IS NOT NULL) DESC,
      v.created_at ASC
  )                      AS row_rank   -- rank=1 → keep, rank>1 → merge into rank=1
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
WHERE (v.name_normalized, v.city_normalized) IN (
  SELECT name_normalized, city_normalized
  FROM venues
  GROUP BY name_normalized, city_normalized
  HAVING COUNT(*) > 1
)
GROUP BY v.id, v.name, v.name_normalized, v.city_normalized, v.address_line1,
         v.lat, v.lng, v.created_at, v.updated_at
ORDER BY v.name_normalized, row_rank;


-- ─── SECTION 2 ───────────────────────────────────────────────────────────────
-- Near-duplicate: same city, lat/lng within ~50 metres (≈ 0.0005 degrees).
-- Different name_normalized → different DB rows, but physically the same place.
-- Confidence: HIGH
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  a.id          AS venue_a_id,
  a.name        AS venue_a_name,
  a.address_line1 AS venue_a_address,
  a.lat         AS venue_a_lat,
  a.lng         AS venue_a_lng,
  (SELECT COUNT(*) FROM events WHERE venue_id = a.id) AS venue_a_events,

  b.id          AS venue_b_id,
  b.name        AS venue_b_name,
  b.address_line1 AS venue_b_address,
  b.lat         AS venue_b_lat,
  b.lng         AS venue_b_lng,
  (SELECT COUNT(*) FROM events WHERE venue_id = b.id) AS venue_b_events,

  -- Approximate distance in metres using equirectangular projection.
  -- Accurate enough for venue-level deduplication in a single city.
  round(
    111320 * sqrt(
      power(a.lat - b.lat, 2) +
      power((a.lng - b.lng) * cos(radians((a.lat + b.lat) / 2)), 2)
    )
  )             AS approx_distance_m

FROM venues a
JOIN venues b
  ON  a.id < b.id                     -- avoid duplicate pairs and self-joins
  AND a.city_normalized = b.city_normalized
  AND a.lat IS NOT NULL
  AND b.lat IS NOT NULL
  AND ABS(a.lat - b.lat) < 0.0005     -- rough bounding box first (fast)
  AND ABS(a.lng - b.lng) < 0.0005
  AND a.name_normalized <> b.name_normalized  -- not already caught by Section 1
HAVING
  111320 * sqrt(
    power(a.lat - b.lat, 2) +
    power((a.lng - b.lng) * cos(radians((a.lat + b.lat) / 2)), 2)
  ) < 50       -- within 50 metres
ORDER BY approx_distance_m, a.name;


-- ─── SECTION 3 ───────────────────────────────────────────────────────────────
-- Weak rows: venues with no address AND no lat/lng.
-- These are often Eventbrite-sourced (name-only upserts) and are the most
-- likely to already have a richer duplicate row from Ticketmaster.
-- Confidence: MEDIUM — needs manual name comparison.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  v.id,
  v.name,
  v.name_normalized,
  v.city_normalized,
  v.address_line1,
  v.lat,
  v.lng,
  v.created_at,
  COUNT(e.id) AS event_count
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
WHERE v.address_line1 IS NULL
  AND v.lat IS NULL
GROUP BY v.id, v.name, v.name_normalized, v.city_normalized,
         v.address_line1, v.lat, v.lng, v.created_at
ORDER BY event_count DESC, v.name;


-- ─── SECTION 4 ───────────────────────────────────────────────────────────────
-- Near-name candidates: same city, names that share a significant common prefix
-- (first 10 normalised characters), different enough to pass the exact constraint.
-- Examples: "foufounes" vs "foufounes electriques", "mtelus" vs "m telus"
-- Confidence: LOW — human review required before any merge.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  a.id              AS venue_a_id,
  a.name            AS venue_a_name,
  a.address_line1   AS venue_a_address,
  a.lat             AS venue_a_lat,
  a.lng             AS venue_a_lng,
  (SELECT COUNT(*) FROM events WHERE venue_id = a.id) AS venue_a_events,

  b.id              AS venue_b_id,
  b.name            AS venue_b_name,
  b.address_line1   AS venue_b_address,
  b.lat             AS venue_b_lat,
  b.lng             AS venue_b_lng,
  (SELECT COUNT(*) FROM events WHERE venue_id = b.id) AS venue_b_events

FROM venues a
JOIN venues b
  ON  a.id < b.id
  AND a.city_normalized = b.city_normalized
  AND a.name_normalized <> b.name_normalized
  -- Share the first 10 characters of name_normalized
  AND length(a.name_normalized) >= 10
  AND length(b.name_normalized) >= 10
  AND left(a.name_normalized, 10) = left(b.name_normalized, 10)
ORDER BY left(a.name_normalized, 10), a.name;


-- ─── SECTION 5 ───────────────────────────────────────────────────────────────
-- Full venue inventory with data quality indicators.
-- Use this as the base reference when reviewing candidates above.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  v.id,
  v.name,
  v.address_line1,
  v.postal_code,
  v.city,
  v.lat,
  v.lng,
  v.created_at,
  COUNT(e.id)                              AS event_count,
  CASE
    WHEN v.address_line1 IS NOT NULL
     AND v.lat IS NOT NULL THEN 'complete'
    WHEN v.address_line1 IS NOT NULL
     OR  v.lat IS NOT NULL THEN 'partial'
    ELSE 'name-only'
  END                                      AS data_quality,
  EXISTS (
    SELECT 1 FROM venue_aliases va WHERE va.venue_id = v.id
  )                                        AS has_aliases
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
GROUP BY v.id, v.name, v.address_line1, v.postal_code, v.city,
         v.lat, v.lng, v.created_at
ORDER BY event_count DESC, v.name;
