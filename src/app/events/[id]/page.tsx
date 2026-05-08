import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import { type EventPreview } from "./ShareButton";
import { PrivateEventSwipePage } from "./PrivateEventSwipePage";
import { PublicEventSwipePage } from "./PublicEventSwipePage";

// cache() deduplicates the DB call so generateMetadata and the page
// component share a single round-trip per request.
const fetchEvent = cache(async (id: string) => {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,description_title,start_at,end_at,category_primary,status,min_price,max_price,currency,image_url,source_url,source,visibility,creator_id,cohost_ids,spots_mode,spots_limit,price,payment_method,payment_contact,rsvp_deadline,moments_guests_can_post,moments_guests_can_react,profiles!creator_id(display_name,avatar_url,custom_avatar_url,username),venues(name,address_line1,city,lat,lng)"
    )
    .eq("id", id)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .maybeSingle();
  return data;
});

async function fetchRelated(id: string, category: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,min_price,max_price,currency,image_url,source_url,venues(name,city)")
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .eq("visibility", "public")
    .eq("category_primary", category)
    .neq("id", id)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(6);
  return data ?? [];
}

async function fetchRsvpCounts(eventId: string) {
  const { data } = await supabaseServer()
    .from("rsvps")
    .select("response")
    .eq("event_id", eventId);

  const counts = { going: 0, maybe: 0, cant_go: 0 };
  for (const row of data ?? []) {
    if (row.response === "going") counts.going++;
    else if (row.response === "maybe") counts.maybe++;
    else if (row.response === "cant_go") counts.cant_go++;
  }
  return counts;
}

type Attendee = { display_name: string | null; avatar_url: string | null; custom_avatar_url: string | null };
type CohostProfile = { id: string; display_name: string | null; avatar_url: string | null; custom_avatar_url: string | null; username: string | null };

async function fetchCohostProfiles(cohostIds: string[]): Promise<CohostProfile[]> {
  if (cohostIds.length === 0) return [];
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,custom_avatar_url,username")
    .in("id", cohostIds);
  return (data ?? []) as CohostProfile[];
}

type EventOrganizer = { name: string; role: string; slug: string | null; image_url: string | null; custom_image_url: string | null };

async function fetchOrganizers(eventId: string): Promise<EventOrganizer[]> {
  // Step 1: core join — does NOT include custom_image_url to avoid PostgREST
  // schema-cache errors on the nested join if the column cache is stale.
  const { data } = await supabaseServer()
    .from("event_organizers")
    .select("role, sort_order, organizers(id, name, slug, image_url)")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const base = (data ?? [])
    .map((row) => {
      const org = Array.isArray(row.organizers) ? row.organizers[0] : row.organizers;
      if (!org?.name) return null;
      return {
        id: org.id as string,
        name: org.name as string,
        role: row.role as string,
        slug: (org.slug as string | null) ?? null,
        image_url: (org.image_url as string | null) ?? null,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  // Step 2: enrich with custom_image_url — separate query so schema-cache
  // misses never affect whether organizers appear at all.
  const orgIds = base.map((o) => o.id);
  const customImageMap = new Map<string, string | null>();
  if (orgIds.length > 0) {
    const { data: rows } = await supabaseServer()
      .from("organizers")
      .select("id, custom_image_url")
      .in("id", orgIds);
    for (const r of (rows ?? []) as { id: string; custom_image_url?: string | null }[]) {
      customImageMap.set(r.id, r.custom_image_url ?? null);
    }
  }

  return base.map(({ id, ...o }) => ({
    ...o,
    custom_image_url: customImageMap.get(id) ?? null,
  })) as EventOrganizer[];
}

async function fetchAttendees(eventId: string): Promise<Attendee[]> {
  const { data } = await supabaseServer()
    .from("rsvps")
    .select("profiles(display_name, avatar_url, custom_avatar_url)")
    .eq("event_id", eventId)
    .eq("response", "going")
    .order("updated_at", { ascending: false })
    .limit(5);

  return (data ?? [])
    .map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return p as Attendee | null;
    })
    .filter((p): p is Attendee => p !== null);
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) return { title: "Event not found | Outsy" };

  // Host name for invitation framing
  const creatorProfileRaw = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
  const hostName =
    (creatorProfileRaw as { display_name?: string | null } | null)?.display_name ?? null;

  // OG title — just the event name; keep it short for messaging apps
  const ogTitle = event.title as string;

  // Venue line
  const venueRaw = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const venueLine = venueRaw
    ? [(venueRaw as { name?: string | null }).name, (venueRaw as { city?: string | null }).city]
        .filter(Boolean)
        .join(", ")
    : null;

  // Date/time — compact "May 8 · 8:30 PM" format
  const startD = new Date(event.start_at);
  const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
  const datePart = startD.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  });
  const timePart = isUnknownTime
    ? null
    : startD.toLocaleString("en-US", {
        timeZone: "America/Toronto",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
  const dateTimePart = timePart ? `${datePart} · ${timePart}` : datePart;

  // OG description — inviter · date · venue; concise and iMessage-friendly
  const inviterPart = hostName ? `${hostName} invited you` : null;
  const ogDescription =
    [inviterPart, dateTimePart, venueLine].filter(Boolean).join(" · ") || "Discover events on Outsy.";

  // OG image — use event cover if available, otherwise generated gradient card
  const ogImageUrl = event.image_url
    ? (event.image_url as string)
    : `/api/events/${id}/og-image`;

  const ogImage = {
    url: ogImageUrl,
    width: 1200,
    height: 630,
    alt: event.title,
  };

  return {
    title: `${event.title} | Outsy`,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      images: [ogImage],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImageUrl],
    },
  };
}

// Share card date — always "May 8 · 8:30 PM" style (not context-relative)
function shareCardDate(iso: string): string {
  const d = new Date(iso);
  const isUnknownTime = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const monthDay = d.toLocaleDateString("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  });
  if (isUnknownTime) return monthDay;
  const timeStr = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${monthDay} · ${timeStr}`;
}

function formatPrice(
  min: number | null,
  max: number | null,
  currency: string | null
): string | null {
  const c = currency ?? "CAD";
  if (min === 0) return "Free";
  if (min !== null) {
    if (max !== null && max !== min) return `${c} ${min} – ${max}`;
    return `${c} ${min}`;
  }
  return null;
}


async function fetchMomentsForEvent(eventId: string) {
  const { data } = await supabaseServer()
    .from("moments")
    .select(
      "id,event_id,author_id,body,survey_question,link_url,link_title,link_description,link_image_url,link_site_name,image_url,is_pinned,reactions_enabled,comments_enabled,created_at,updated_at," +
        "profiles(display_name,avatar_url,username)," +
        "moment_reactions(user_id,emoji)"
    )
    .eq("event_id", eventId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) notFound();

  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const creatorRaw = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
  const creator = creatorRaw as { display_name: string | null; avatar_url: string | null; custom_avatar_url: string | null; username: string | null } | null;
  const creatorId = (event as { creator_id?: string | null }).creator_id ?? null;
  const [related, rsvpCounts, attendees, organizers] = await Promise.all([
    fetchRelated(id, event.category_primary),
    fetchRsvpCounts(id),
    fetchAttendees(id),
    fetchOrganizers(id),
  ]);

  /* ── Private event: swipe layout ───────────────────────────────────────── */
  if (event.visibility === "private") {
    const venueLat = (venue as { lat?: number | null } | null)?.lat ?? null;
    const venueLng = (venue as { lng?: number | null } | null)?.lng ?? null;
    const venueCoords =
      typeof venueLat === "number" && typeof venueLng === "number"
        ? `&lat=${venueLat}&lng=${venueLng}`
        : "";
    const privateMapHref = venue ? `/map?eventId=${id}${venueCoords}` : null;
    const evtExt = event as {
      cohost_ids?: string[] | null;
      spots_mode?: string | null;
      spots_limit?: number | null;
      price?: number | null;
      payment_method?: string | null;
      payment_contact?: string | null;
      rsvp_deadline?: string | null;
      moments_guests_can_post?: boolean | null;
      moments_guests_can_react?: boolean | null;
      description_title?: string | null;
    };
    const cohostIds = evtExt.cohost_ids ?? [];
    const [cohostProfiles, initialMoments, privateOrganizers] = await Promise.all([
      fetchCohostProfiles(cohostIds),
      // Private events: skip SSR pre-load — no auth context in RSC.
      // MomentsClient refetches immediately from the gated API route.
      Promise.resolve([] as Awaited<ReturnType<typeof fetchMomentsForEvent>>),
      fetchOrganizers(id),
    ]);
    const spotsLimited = evtExt.spots_mode === "limited" && (evtExt.spots_limit ?? 0) > 0;
    const eventPrice = typeof evtExt.price === "number" && evtExt.price > 0 ? evtExt.price : null;
    const eventCurrency = (event as { currency?: string | null }).currency ?? "CAD";
    const rsvpDeadline = evtExt.rsvp_deadline ?? null;
    const guestsCanPost = Boolean(evtExt.moments_guests_can_post ?? false);
    const guestsCanReact = evtExt.moments_guests_can_react !== false;

    const startD = new Date(event.start_at);
    const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
    const dateLine = startD.toLocaleString("en-US", {
      timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
    });
    const startTimeStr = isUnknownTime ? null : startD.toLocaleString("en-US", {
      timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
    });
    const endAtPriv = (event as { end_at?: string | null }).end_at ?? null;
    const timeLine = (() => {
      if (!startTimeStr) return null;
      if (!endAtPriv) return startTimeStr;
      const endD = new Date(endAtPriv);
      const endTimeStr = endD.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true });
      return `${startTimeStr}–${endTimeStr}`;
    })();

    const privatePreview: EventPreview = {
      imageUrl: (event.image_url as string | null) ?? null,
      category: event.category_primary,
      hostName: creator?.display_name ?? null,
      dateStr: shareCardDate(event.start_at),
      venueName: venue?.name ?? null,
    };

    return (
      <PrivateEventSwipePage
        id={id}
        imageUrl={(event.image_url as string | null) ?? null}
        title={event.title}
        category={event.category_primary}
        source={event.source}
        creatorId={creatorId}
        creator={creator}
        cohostIds={cohostIds}
        cohostProfiles={cohostProfiles}
        organizers={privateOrganizers}
        dateLine={dateLine}
        timeLine={timeLine}
        privateMapHref={privateMapHref}
        venueName={venue?.name ?? null}
        description={(event.description as string | null) ?? null}
        descriptionTitle={(evtExt.description_title as string | null) ?? null}
        spotsLimited={spotsLimited}
        spotsLimit={evtExt.spots_limit ?? null}
        eventPrice={eventPrice}
        eventCurrency={eventCurrency}
        paymentMethod={evtExt.payment_method ?? null}
        paymentContact={evtExt.payment_contact ?? null}
        rsvpDeadline={rsvpDeadline}
        rsvpCounts={rsvpCounts}
        attendees={attendees}
        guestsCanPost={guestsCanPost}
        guestsCanReact={guestsCanReact}
        initialMoments={initialMoments as never}
        preview={privatePreview}
      />
    );
  }

  /* ── Public event: swipe layout ──────────────────────────────────────────── */
  const cohostIds = Array.isArray((event as { cohost_ids?: string[] | null }).cohost_ids)
    ? ((event as { cohost_ids?: string[] | null }).cohost_ids as string[])
    : [];
  const guestsCanPost = Boolean((event as Record<string, unknown>).moments_guests_can_post ?? false);
  const guestsCanReact = (event as Record<string, unknown>).moments_guests_can_react !== false;
  const price = formatPrice(event.min_price, event.max_price, event.currency);
  const isAnnounced = (event as { status?: string }).status === "announced";
  const pubLat = (venue as { lat?: number | null } | null)?.lat ?? null;
  const pubLng = (venue as { lng?: number | null } | null)?.lng ?? null;
  const pubCoords =
    typeof pubLat === "number" && typeof pubLng === "number"
      ? `&lat=${pubLat}&lng=${pubLng}`
      : "";
  const mapHref = venue ? `/map?eventId=${id}${pubCoords}` : "/map";
  const pubStartD = new Date(event.start_at);
  const pubIsUnknownTime = pubStartD.getUTCHours() === 0 && pubStartD.getUTCMinutes() === 0;
  const dateLine = pubStartD.toLocaleString("en-US", {
    timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
  });
  const pubStartTimeStr = pubIsUnknownTime ? null : pubStartD.toLocaleString("en-US", {
    timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
  });
  const endAtPub = (event as { end_at?: string | null }).end_at ?? null;
  const timeLine = (() => {
    if (!pubStartTimeStr) return null;
    if (!endAtPub) return pubStartTimeStr;
    const endD = new Date(endAtPub);
    const endTimeStr = endD.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true });
    return `${pubStartTimeStr}–${endTimeStr}`;
  })();
  const initialMoments = await fetchMomentsForEvent(id);

  return (
    <PublicEventSwipePage
      id={id}
      imageUrl={(event.image_url as string | null) ?? null}
      title={event.title}
      category={event.category_primary}
      source={event.source}
      creatorId={creatorId}
      creator={creator}
      cohostIds={cohostIds}
      dateLine={dateLine}
      timeLine={timeLine}
      mapHref={mapHref}
      venueName={venue?.name ?? null}
      description={(event.description as string | null) ?? null}
      descriptionTitle={(event as { description_title?: string | null }).description_title ?? null}
      price={price}
      isAnnounced={isAnnounced}
      rsvpCounts={rsvpCounts}
      attendees={attendees}
      organizers={organizers}
      related={related as never}
      sourceUrl={event.source_url ?? null}
      guestsCanPost={guestsCanPost}
      guestsCanReact={guestsCanReact}
      initialMoments={initialMoments as never}
      startAt={event.start_at}
    />
  );
}
