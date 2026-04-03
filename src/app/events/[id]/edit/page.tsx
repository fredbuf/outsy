import "server-only";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import { CreateEventPage } from "../../new/CreateEventPage";

export const metadata: Metadata = {
  title: "Edit event — Outsy",
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: event } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,start_at,end_at,visibility,category_primary,source_url,image_url,venue_id,cohost_ids,spots_mode,spots_limit,price,currency,payment_method,payment_contact,rsvp_deadline,venues(name,address_line1,city,lat,lng)"
    )
    .eq("id", id)
    .eq("source", "manual")
    .single();

  if (!event) notFound();

  const venue = (
    Array.isArray(event.venues) ? event.venues[0] : event.venues
  ) as { name?: string; address_line1?: string; city?: string; lat?: number | null; lng?: number | null } | null;

  const evtExt = event as typeof event & {
    cohost_ids?: string[] | null;
    spots_mode?: string | null;
    spots_limit?: number | null;
    price?: number | null;
    currency?: string | null;
    payment_method?: string | null;
    payment_contact?: string | null;
    rsvp_deadline?: string | null;
  };

  return (
    <CreateEventPage
      editData={{
        id: event.id,
        title: event.title,
        description: event.description ?? null,
        start_at: event.start_at,
        end_at: event.end_at ?? null,
        visibility: event.visibility as "public" | "private",
        category_primary: event.category_primary ?? "concerts",
        source_url: event.source_url ?? null,
        image_url: event.image_url ?? null,
        venue_id: event.venue_id ?? null,
        venue_name: venue?.name ?? null,
        venue_address: venue?.address_line1 ?? null,
        venue_city: venue?.city ?? null,
        venue_lat: venue?.lat ?? null,
        venue_lng: venue?.lng ?? null,
        cohost_ids: evtExt.cohost_ids ?? null,
        spots_mode: evtExt.spots_mode ?? null,
        spots_limit: evtExt.spots_limit ?? null,
        price: evtExt.price ?? null,
        currency: evtExt.currency ?? null,
        payment_method: evtExt.payment_method ?? null,
        payment_contact: evtExt.payment_contact ?? null,
        rsvp_deadline: evtExt.rsvp_deadline ?? null,
      }}
    />
  );
}
