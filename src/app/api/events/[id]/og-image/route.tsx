import { ImageResponse } from "next/og";
import { supabaseServer } from "@/lib/supabase-server";

// 1200×630 — standard Open Graph image size.
// Renders a branded gradient card when the event has no cover photo.
// Used as og:image fallback in generateMetadata.

export const dynamic = "force-dynamic";

function categoryGradient(cat: string): string {
  switch (cat) {
    case "concerts":
    case "music":
      return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":
      return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture":
    case "art":
      return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":
      return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":
      return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":
      return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:
      return "linear-gradient(150deg, #0d0d1a 0%, #1a1a2e 100%)";
  }
}

function fallbackCard(title?: string) {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "linear-gradient(150deg, #0d0d1a 0%, #1a1a2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: title ? 60 : 48,
          fontWeight: 800,
          color: title ? "#ffffff" : "rgba(255,255,255,0.25)",
          textAlign: "center",
          maxWidth: 900,
          lineHeight: 1.2,
        }}
      >
        {title ?? "Outsy"}
      </div>
    </div>
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: event } = await supabaseServer()
    .from("events")
    .select(
      "id,title,start_at,category_primary,profiles!creator_id(display_name),venues(name,city)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!event) {
    return new ImageResponse(fallbackCard(), { width: 1200, height: 630 });
  }

  const creatorRaw = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
  const hostName =
    (creatorRaw as { display_name?: string | null } | null)?.display_name ?? null;
  const venueRaw = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const venueLine = venueRaw
    ? [venueRaw.name, venueRaw.city].filter(Boolean).join(", ")
    : null;

  // Format date
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
  const dateStr = timePart ? `${datePart} · ${timePart}` : datePart;

  const bg = categoryGradient(event.category_primary as string ?? "");
  const title = event.title as string;
  const titleFontSize = title.length > 55 ? 52 : title.length > 36 ? 62 : 74;

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: bg,
        display: "flex",
        flexDirection: "column",
        padding: "56px 80px 52px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        position: "relative",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.38)",
          }}
        >
          OUTSY
        </div>
        {hostName && (
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.48)",
              fontWeight: 500,
            }}
          >
            {hostName} invited you
          </div>
        )}
      </div>

      {/* Event title */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.15,
            maxWidth: 960,
          }}
        >
          {title}
        </div>
      </div>

      {/* Bottom: date + venue */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dateStr && (
          <div
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.65)",
              fontWeight: 500,
            }}
          >
            {dateStr}
          </div>
        )}
        {venueLine && (
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.38)",
              fontWeight: 400,
            }}
          >
            {venueLine}
          </div>
        )}
      </div>

      {/* Purple accent line at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "linear-gradient(90deg, #5b21b6, #a78bfa, #5b21b6)",
        }}
      />
    </div>,
    { width: 1200, height: 630 }
  );
}
