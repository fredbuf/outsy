-- Migration: RSVP RPCs
-- Adds three SECURITY DEFINER functions that expose controlled RSVP access.
-- Raw rsvps table RLS is NOT changed here — that is a separate migration.
--
-- Functions:
--   get_rsvp_counts(p_event_id)      → aggregate counts, open to everyone incl. anon
--   get_friend_rsvps(p_event_id)     → friend-only attendees, public/unlisted events, authenticated only
--   get_event_rsvp_list(p_event_id)  → full attendee list, private events, host/cohost/involved only

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION 1: get_rsvp_counts
-- Returns going/maybe/cant_go counts for any event.
-- No attendee identity is exposed.
-- Safe to call as anon — counts are not sensitive.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_rsvp_counts(p_event_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'going',   COUNT(*) FILTER (WHERE response = 'going'),
    'maybe',   COUNT(*) FILTER (WHERE response = 'maybe'),
    'cant_go', COUNT(*) FILTER (WHERE response = 'cant_go')
  )
  FROM rsvps
  WHERE event_id = p_event_id;
$$;

-- Callable by both anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_rsvp_counts(uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION 2: get_friend_rsvps
-- Returns RSVPs on public/unlisted events where the attendee is an accepted
-- friend of the calling user. Returns zero rows for:
--   - private events
--   - unauthenticated callers (auth.uid() is NULL → friendship check fails)
--   - events that do not exist
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_friend_rsvps(p_event_id uuid)
RETURNS TABLE (
  user_id      uuid,
  response     text,
  display_name text,
  avatar_url   text,
  username     text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    r.user_id,
    r.response,
    p.display_name,
    p.avatar_url,
    p.username
  FROM rsvps r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id
    -- Gate: public or unlisted events only
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id
        AND e.visibility IN ('public', 'unlisted')
    )
    -- Gate: attendee must be an accepted friend of the caller
    -- auth.uid() = NULL for anon callers → both sides of OR evaluate to NULL → false
    -- so anon callers always get zero rows with no special handling needed
    AND EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.recipient_id = r.user_id)
          OR
          (f.recipient_id = auth.uid() AND f.requester_id = r.user_id)
        )
    );
$$;

-- Authenticated only — anon callers will always get zero rows due to auth.uid()
-- being NULL, but restricting to authenticated prevents unnecessary function calls
GRANT EXECUTE ON FUNCTION public.get_friend_rsvps(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION 3: get_event_rsvp_list
-- Returns the full RSVP list for private events.
-- Access is granted only when the caller is:
--   - the event host (creator_id)
--   - a cohost (cohost_ids array member)
--   - an involved user (has any RSVP row on this event, any response)
-- Returns zero rows (not an error) for unauthorized callers, preventing
-- event existence leakage.
-- Always returns zero rows for unauthenticated callers.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_event_rsvp_list(p_event_id uuid)
RETURNS TABLE (
  user_id      uuid,
  response     text,
  display_name text,
  avatar_url   text,
  username     text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    r.user_id,
    r.response,
    p.display_name,
    p.avatar_url,
    p.username
  FROM rsvps r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id
    -- Gate: private events only, and caller must have access
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id
        AND e.visibility = 'private'
        AND (
          -- Caller is the host
          e.creator_id = auth.uid()
          -- Caller is a cohost
          OR auth.uid() = ANY(e.cohost_ids)
          -- Caller has their own RSVP (any response = involved)
          OR EXISTS (
            SELECT 1 FROM rsvps r2
            WHERE r2.event_id = p_event_id
              AND r2.user_id = auth.uid()
          )
        )
    );
$$;

-- Authenticated only — anon can never satisfy the access gate
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_list(uuid) TO authenticated;
