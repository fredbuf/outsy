-- Migration: allow 'door' as a valid payment_method on events
--
-- Background:
--   The original constraint events_payment_methos_check (note the typo in the name)
--   was created when the private-events feature landed. It only allowed NULL and 'interac'.
--   The app now supports a second paid mode: "Pay on site" which stores payment_method = 'door'.
--
-- Current allowed values: NULL, 'interac'
-- New    allowed values:   NULL, 'interac', 'door'
--
-- Safe to run on a live database:
--   - The DROP/ADD is wrapped in a transaction so it's atomic.
--   - No existing rows store 'door', so the new constraint will pass the initial table scan.
--   - The rename (fixing the typo) is cosmetic only; Postgres does not re-scan the table
--     for a constraint rename, but here we drop and recreate so the scan is unavoidable.
--     Existing 'interac' and NULL rows are still valid under the new constraint.

BEGIN;

-- 1. Remove the old constraint (typo in name: "methos" → "methods")
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_payment_method_check;

-- 2. Add the new constraint with the corrected name and expanded value list
ALTER TABLE events
  ADD CONSTRAINT events_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('interac', 'door'));

COMMIT;
