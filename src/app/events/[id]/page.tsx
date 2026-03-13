/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

// cache() deduplicates the DB call so generateMetadata and the page
// component share a single round-trip per request.
const fetchEvent = cache(async (id: string) => {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,start_at,end_at,category_primary,min_price,max_price,currency,image_url,source_url,venues(name,address_line1,city)"
    )
    .eq("id", id)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("status", "scheduled")
    .maybeSingle();
  return data;
});

async function fetchRelated(id: string, category: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,min_price,max_price,currency,image_url,source_url")
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("status", "scheduled")
    .eq("category_primary", category)
    .neq("id", id)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(4);
  return data ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) return { title: "Event not found | Outsy" };
  const description =
    event.description ?? `${event.category_primary} event in Montréal`;
  return {
    title: `${event.title} | Outsy`,
    description,
    openGraph: {
      title: event.title,
      description,
      images: event.image_url ? [{ url: event.image_url }] : [],
    },
  };
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) notFound();

  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const related = await fetchRelated(id, event.category_primary);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 48px",
        display: "grid",
        gap: 24,
      }}
    >
      <Link
        href="/events"
        style={{ opacity: 0.6, fontSize: 14, textDecoration: "none" }}
      >
        ← Back to events
      </Link>

      {event.image_url && (
        <img
          src={event.image_url}
          alt={event.title}
          style={{
            width: "100%",
            maxHeight: 380,
            objectFit: "cover",
            borderRadius: 16,
          }}
        />
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
          {event.title}
        </h1>

        <div
          style={{
            display: "grid",
            gap: 4,
            fontSize: 14,
            opacity: 0.75,
          }}
        >
          <span>{formatDateLong(event.start_at)}</span>

          {venue?.name && (
            <span>
              {venue.name}
              {venue.city ? `, ${venue.city}` : ""}
            </span>
          )}

          <span style={{ textTransform: "capitalize" }}>
            {event.category_primary}
            {formatPrice(event.min_price, event.max_price, event.currency)
              ? ` · ${formatPrice(event.min_price, event.max_price, event.currency)}`
              : ""}
          </span>
        </div>
      </div>

      {event.description && (
        <p style={{ lineHeight: 1.7, opacity: 0.85, whiteSpace: "pre-wrap" }}>
          {event.description}
        </p>
      )}

      {event.source_url && (
        <a
          href={event.source_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            borderRadius: 12,
            background: "var(--btn-bg)",
            border: "1px solid var(--border-strong)",
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Get tickets →
        </a>
      )}

      {related.length > 0 && (
        <section style={{ display: "grid", gap: 12, paddingTop: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>More events like this</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {related.map((r) => {
              const price = formatPrice(r.min_price, r.max_price, r.currency);
              const priceLabel = price ?? (r.source_url ? "🎟 Tickets available" : null);
              return (
                <Link
                  key={r.id}
                  href={`/events/${r.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <article
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 14,
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: "cover",
                          borderRadius: 10,
                          flex: "0 0 auto",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 10,
                          background: "var(--surface-subtle)",
                          flex: "0 0 auto",
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{formatDateShort(r.start_at)}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {r.category_primary}
                        {priceLabel ? ` · ${priceLabel}` : ""}
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
