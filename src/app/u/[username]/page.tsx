/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

const fetchProfile = cache(async (username: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,username")
    .eq("username", username)
    .maybeSingle();
  return data;
});

async function fetchHostedEvents(creatorId: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,image_url")
    .eq("creator_id", creatorId)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("status", "scheduled")
    .eq("visibility", "public")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(20);
  return data ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) return { title: "User not found | Outsy" };
  const name = profile.display_name ?? `@${username}`;
  return {
    title: `${name} | Outsy`,
    description: `Events hosted by ${name} on Outsy Montréal`,
    openGraph: {
      title: `${name} | Outsy`,
      description: `Events hosted by ${name} on Outsy Montréal`,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : [],
    },
  };
}

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) notFound();

  const events = await fetchHostedEvents(profile.id);
  const displayName = profile.display_name ?? `@${username}`;

  return (
    <main
      className="page-main"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "24px 16px 48px",
        display: "grid",
        gap: 28,
      }}
    >
      <Link href="/events" style={{ opacity: 0.6, fontSize: 14, textDecoration: "none" }}>
        ← Back to events
      </Link>

      {/* Profile header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              objectFit: "cover",
              flex: "0 0 auto",
            }}
          />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: getAvatarColor(displayName),
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
              color: "#fff",
              userSelect: "none",
            }}
          >
            {getInitials(displayName)}
          </div>
        )}

        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{displayName}</h1>
          <span style={{ fontSize: 13, opacity: 0.5 }}>@{username}</span>
        </div>
      </div>

      {/* Hosted events */}
      {events.length > 0 ? (
        <section style={{ display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Upcoming events</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <article
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  {e.image_url ? (
                    <img
                      src={e.image_url}
                      alt=""
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 8,
                        flex: "0 0 auto",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: "var(--surface-subtle)",
                        flex: "0 0 auto",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{formatDate(e.start_at)}</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        marginTop: 2,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {e.title}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>
                      {({ concerts: "Concerts", nightlife: "Nightlife", arts_culture: "Arts & Culture", comedy: "Comedy", sports: "Sports", family: "Family", music: "Concerts", art: "Arts & Culture" } as Record<string, string>)[e.category_primary] ?? e.category_primary}
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <p style={{ fontSize: 14, opacity: 0.55 }}>No upcoming public events.</p>
      )}
    </main>
  );
}
