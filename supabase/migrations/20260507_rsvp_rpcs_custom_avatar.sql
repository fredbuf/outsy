-- Migration: add custom_avatar_url to RSVP RPC return types
-- Updates get_friend_rsvps and get_event_rsvp_list to return custom_avatar_url
-- alongside avatar_url. Client code uses custom_avatar_url first, falls back
-- to gradient-based initials (never uses raw avatar_url for display).

CREATE OR REPLACE FUNCTION public.get_friend_rsvps(p_event_id uuid)
RETURNS TABLE (
  user_id           uuid,
  response          text,
  display_name      text,
  avatar_url        text,
  custom_avatar_url text,
  username          text
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
    p.custom_avatar_url,
    p.username
  FROM rsvps r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id
        AND e.visibility IN ('public', 'unlisted')
    )
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

GRANT EXECUTE ON FUNCTION public.get_friend_rsvps(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_event_rsvp_list(p_event_id uuid)
RETURNS TABLE (
  user_id           uuid,
  response          text,
  display_name      text,
  avatar_url        text,
  custom_avatar_url text,
  username          text
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
    p.custom_avatar_url,
    p.username
  FROM rsvps r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id
        AND e.visibility = 'private'
        AND (
          e.creator_id = auth.uid()
          OR auth.uid() = ANY(e.cohost_ids)
          OR EXISTS (
            SELECT 1 FROM rsvps r2
            WHERE r2.event_id = p_event_id
              AND r2.user_id = auth.uid()
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_event_rsvp_list(uuid) TO authenticated;
