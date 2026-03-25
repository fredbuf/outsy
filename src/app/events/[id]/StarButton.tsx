"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function StarButton({ eventId }: { eventId: string }) {
  const { user, session } = useAuth();
  const [starred, setStarred] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user?.id) { setStarred(false); return; }
    supabaseBrowser()
      .from("rsvps")
      .select("event_id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .eq("response", "maybe")
      .maybeSingle()
      .then(({ data }) => setStarred(!!data));
  }, [user?.id, eventId]);

  async function handle() {
    if (!session?.access_token) {
      window.dispatchEvent(new CustomEvent("outsy:open-signin"));
      return;
    }
    if (pending) return;
    const wasStarred = starred;
    setStarred(!wasStarred);
    setPending(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: wasStarred ? "DELETE" : "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        ...(wasStarred ? {} : { body: JSON.stringify({ response: "maybe" }) }),
      });
      if (!res.ok) setStarred(wasStarred);
    } catch {
      setStarred(wasStarred);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      title={starred ? "Saved" : "Save event"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 16px",
        borderRadius: 12,
        border: "1px solid var(--border-strong)",
        background: "transparent",
        fontWeight: 600,
        fontSize: 14,
        cursor: pending ? "wait" : "pointer",
        color: starred ? "#f59e0b" : "inherit",
        opacity: pending ? 0.6 : 1,
        transition: "color 0.15s",
      }}
    >
      <StarIcon filled={starred} />
      {starred ? "Saved" : "Save"}
    </button>
  );
}
