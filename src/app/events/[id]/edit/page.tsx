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
      "id,title,description,start_at,end_at,visibility,category_primary,source_url,image_url,venue_id,venues(name,address_line1,city)"
    )
    .eq("id", id)
    .eq("source", "manual")
    .single();

  if (!event) notFound();

  const venue = (
    Array.isArray(event.venues) ? event.venues[0] : event.venues
  ) as { name?: string; address_line1?: string; city?: string } | null;

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
      }}
    />
  );
}
