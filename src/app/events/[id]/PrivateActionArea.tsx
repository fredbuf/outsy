"use client";

import { useAuth } from "../../components/AuthProvider";
import { useActiveOrganizer } from "../../components/ActiveOrganizerContext";
import { isEventHostOrCohost } from "@/lib/event-ownership";
import { ActionBar } from "./ActionBar";
import { AttendeeList } from "./AttendeeList";
import { InviteFriendsButton } from "./InviteFriendsButton";
import { ShareButton, type EventPreview } from "./ShareButton";

type Counts = { going: number; maybe: number; cant_go: number };
type Attendee = { display_name: string | null; avatar_url: string | null };

export function PrivateActionArea({
  eventId,
  eventTitle,
  creatorId,
  cohostIds,
  eventOrganizerIds = [],
  initialCounts,
  initialAttendees,
  preview,
}: {
  eventId: string;
  eventTitle: string;
  creatorId: string | null;
  cohostIds: string[];
  eventOrganizerIds?: string[];
  initialCounts: Counts;
  initialAttendees: Attendee[];
  preview?: EventPreview;
}) {
  const { user, session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();
  const token = session?.access_token ?? null;
  const isHost = isEventHostOrCohost({
    userId: user?.id ?? null,
    activeOrganizerId: activeOrganizer?.organizerId ?? null,
    creatorId,
    eventOrganizerIds,
    cohostIds,
  });

  return isHost ? (
    <HostView
      eventId={eventId}
      eventTitle={eventTitle}
      creatorId={creatorId}
      initialCounts={initialCounts}
      initialAttendees={initialAttendees}
      token={token}
      preview={preview}
    />
  ) : (
    <GuestView
      eventId={eventId}
      eventTitle={eventTitle}
      initialCounts={initialCounts}
      initialAttendees={initialAttendees}
      token={token}
      preview={preview}
    />
  );
}

// ── Host view ────────────────────────────────────────────────────────────────

function HostView({
  eventId,
  eventTitle,
  initialCounts,
  initialAttendees,
  token,
  preview,
}: {
  eventId: string;
  eventTitle: string;
  creatorId: string | null;
  initialCounts: Counts;
  initialAttendees: Attendee[];
  token: string | null;
  preview?: EventPreview;
}) {
  return (
    <>
      {/* Two big glass action buttons */}
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        <InviteFriendsButton eventId={eventId} large />
        <ShareButton title={eventTitle} eventId={eventId} large preview={preview} />
      </div>

      {/* Guest count row */}
      <div
        style={{
          display: "flex", alignItems: "center",
          gap: 12, paddingTop: 18, paddingBottom: 18,
        }}
      >
        {initialCounts.going > 0 || initialCounts.maybe > 0 ? (
          <AttendeeList
            eventId={eventId}
            initialAttendees={initialAttendees}
            goingCount={initialCounts.going}
            maybeCount={initialCounts.maybe}
            visibility="private"
            token={token}
            avatarSize={36}
          />
        ) : (
          <span style={{ fontSize: 14, opacity: 0.45 }}>No guests yet.</span>
        )}
      </div>
    </>
  );
}

// ── Guest view ───────────────────────────────────────────────────────────────

function GuestView({
  eventId,
  eventTitle,
  initialCounts,
  initialAttendees,
  token,
  preview,
}: {
  eventId: string;
  eventTitle: string;
  initialCounts: Counts;
  initialAttendees: Attendee[];
  token: string | null;
  preview?: EventPreview;
}) {
  return (
    <>
      {/* RSVP bar */}
      <div style={{ paddingTop: 32, paddingBottom: 4 }}>
        <ActionBar
          eventId={eventId}
          initialCounts={initialCounts}
          sourceUrl={null}
          visibility="private"
        />
      </div>

      {/* Guest preview */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, paddingTop: 18, paddingBottom: 18,
        }}
      >
        {initialCounts.going > 0 || initialCounts.maybe > 0 ? (
          <AttendeeList
            eventId={eventId}
            initialAttendees={initialAttendees}
            goingCount={initialCounts.going}
            maybeCount={initialCounts.maybe}
            visibility="private"
            token={token}
            avatarSize={36}
          />
        ) : (
          <span style={{ fontSize: 14, opacity: 0.45 }}>No guests yet — be the first!</span>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <InviteFriendsButton eventId={eventId} />
          <ShareButton title={eventTitle} eventId={eventId} preview={preview} />
        </div>
      </div>
    </>
  );
}
