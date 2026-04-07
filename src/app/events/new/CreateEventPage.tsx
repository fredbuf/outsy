/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useAuth } from "../../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Category = "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
type Visibility = "public" | "private";
type OptionSheet = "spots" | "cost" | "rsvp" | null;

type VenueSuggestion = {
  id: string;
  name: string;
  city: string | null;
  address_line1: string | null;
};

type HostProfile = { avatar_url: string | null; display_name: string | null };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

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

function formatDateLine(startDate: string, startTime: string, allDay: boolean): string {
  if (!startDate) return "";
  const [year, month, day] = startDate.split("-").map(Number);
  const d =
    allDay || !startTime
      ? new Date(year, month - 1, day)
      : (() => {
          const [h, m] = startTime.split(":").map(Number);
          return new Date(year, month - 1, day, h, m);
        })();
  const dateStr = d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  if (allDay || !startTime) return dateStr;
  const timeStr = d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateStr} · ${timeStr}`;
}

function toLocalDateStr(iso: string): string {
  const d = new Date(iso);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function toLocalTimeStr(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type EditEventData = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  visibility: "public" | "private";
  category_primary: string;
  source_url: string | null;
  image_url: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
  cohost_ids?: string[] | null;
  spots_mode?: string | null;
  spots_limit?: number | null;
  price?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  payment_contact?: string | null;
  rsvp_deadline?: string | null;
  description_title?: string | null;
};

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid var(--border-strong)",
  fontSize: 16,
  background: "transparent",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

export function CreateEventPage({ editData }: { editData?: EditEventData } = {}) {
  const router = useRouter();
  const { user, loading: authLoading, session } = useAuth();
  const isEditMode = Boolean(editData);
  const editEventId = editData?.id ?? null;

  const [visibility, setVisibility] = useState<Visibility>(
    () => (editData?.visibility as Visibility) ?? "private"
  );
  const isPrivate = visibility === "private";

  // Core fields
  const [title, setTitle] = useState(() => editData?.title ?? "");
  const [description, setDescription] = useState(() => editData?.description ?? "");
  const [privatePlaceName, setPrivatePlaceName] = useState(() =>
    editData?.visibility === "private" ? (editData?.venue_name ?? "") : ""
  );
  const [privateAddress, setPrivateAddress] = useState(() =>
    editData?.visibility === "private" ? (editData?.venue_address ?? "") : ""
  );
  const [privateLat, setPrivateLat] = useState<number | null>(() => editData?.venue_lat ?? null);
  const [privateLng, setPrivateLng] = useState<number | null>(() => editData?.venue_lng ?? null);
  const [privatePlaceId, setPrivatePlaceId] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [category, setCategory] = useState<Category>(
    () => (editData?.category_primary as Category) ?? "concerts"
  );
  const [sourceUrl, setSourceUrl] = useState(() => editData?.source_url ?? "");
  const [venueName, setVenueName] = useState(() =>
    editData?.visibility !== "private" ? (editData?.venue_name ?? "") : ""
  );
  const [venueAddress, setVenueAddress] = useState(() =>
    editData?.visibility !== "private" ? (editData?.venue_address ?? "") : ""
  );
  const [venueCity, setVenueCity] = useState(() => editData?.venue_city ?? "Montréal");

  // Date / time
  const [startDate, setStartDate] = useState(() =>
    editData?.start_at ? toLocalDateStr(editData.start_at) : ""
  );
  const [startTime, setStartTime] = useState(() =>
    editData?.start_at ? toLocalTimeStr(editData.start_at) : ""
  );
  const [endDate, setEndDate] = useState(() =>
    editData?.end_at ? toLocalDateStr(editData.end_at) : ""
  );
  const [endTime, setEndTime] = useState(() =>
    editData?.end_at ? toLocalTimeStr(editData.end_at) : ""
  );
  const [showEndTime, setShowEndTime] = useState(() => Boolean(editData?.end_at));
  const [allDay, setAllDay] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    () => editData?.image_url ?? null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Host profile
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);

  // Venue autocomplete
  const [venueId, setVenueId] = useState<string | null>(() => editData?.venue_id ?? null);
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const venueWrapperRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const privatePlaceNameRef = useRef(privatePlaceName);

  // Description expand
  const [descriptionOpen, setDescriptionOpen] = useState(() => Boolean(editData?.description));
  const [descriptionTitle, setDescriptionTitle] = useState(() => editData?.description_title ?? "");

  // Photo menu
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

  // Location sheet
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSubmitted, setPublicSubmitted] = useState(false);

  // Cohost (private events only) — supports multiple
  type CohostProfile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };
  const [cohostIds, setCohostIds] = useState<string[]>(() => editData?.cohost_ids ?? []);
  const [cohostProfiles, setCohostProfiles] = useState<CohostProfile[]>([]);
  const [cohostSheetOpen, setCohostSheetOpen] = useState(false);
  const [cohostFriends, setCohostFriends] = useState<CohostProfile[]>([]);
  const [cohostFriendsLoading, setCohostFriendsLoading] = useState(false);
  const [cohostSearch, setCohostSearch] = useState("");

  // Optional options (private events only)
  const [optionSheet, setOptionSheet] = useState<OptionSheet>(null);
  const [spotsMode, setSpotsMode] = useState<"unlimited" | "limited">(() =>
    (editData?.spots_mode as "unlimited" | "limited") ?? "unlimited"
  );
  const [spotsLimit, setSpotsLimit] = useState(() =>
    editData?.spots_limit ? String(editData.spots_limit) : ""
  );
  const [costAmount, setCostAmount] = useState(() =>
    editData?.price ? String(editData.price) : ""
  );
  const [costCurrency, setCostCurrency] = useState<"CAD" | "USD">(() =>
    (editData?.currency as "CAD" | "USD") ?? "CAD"
  );
  const [costPaymentContact, setCostPaymentContact] = useState(() =>
    editData?.payment_contact ?? ""
  );
  const [rsvpDeadline, setRsvpDeadline] = useState(() =>
    editData?.rsvp_deadline ?? ""
  );

  // In edit mode, fetch profiles for pre-existing cohosts so they appear in the UI
  useEffect(() => {
    if (!isEditMode || cohostIds.length === 0) return;
    supabaseBrowser()
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", cohostIds)
      .then(({ data }) => {
        if (data) setCohostProfiles(data as CohostProfile[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  // Lock scroll when any sheet is open
  useEffect(() => {
    document.body.style.overflow = (dateSheetOpen || cohostSheetOpen || optionSheet !== null) ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dateSheetOpen, cohostSheetOpen, optionSheet]);

  // Fetch host profile
  useEffect(() => {
    if (!user) return;
    supabaseBrowser()
      .from("profiles")
      .select("avatar_url,display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setHostProfile(data ?? null));
  }, [user]);

  // If Google Maps was already loaded before this component mounted (e.g. in edit mode
  // after navigating from the event page), the Script onLoad won't fire again.
  // Detect it synchronously on mount so autocomplete can initialize immediately.
  useEffect(() => {
    if (typeof window !== "undefined" && (window as Window & { google?: { maps?: unknown } }).google?.maps) {
      setMapsReady(true);
    }
  }, []);

  // Keep ref in sync so autocomplete closure can read current place name
  useEffect(() => { privatePlaceNameRef.current = privatePlaceName; }, [privatePlaceName]);

  // Initialize Google Places Autocomplete on the private address input
  useEffect(() => {
    if (!locationSheetOpen || !isPrivate || !mapsReady) return;
    let ac: google.maps.places.Autocomplete | null = null;
    // Defer to let the sheet DOM mount
    const timer = setTimeout(() => {
      if (!addressInputRef.current) return;
      ac = new google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "place_id", "geometry"],
      });
      ac.addListener("place_changed", () => {
        const place = ac!.getPlace();
        if (!place.geometry?.location) return;
        setPrivateLat(place.geometry.location.lat());
        setPrivateLng(place.geometry.location.lng());
        setPrivateAddress(place.formatted_address ?? "");
        setPrivatePlaceId(place.place_id ?? null);
        if (!privatePlaceNameRef.current.trim() && place.name) {
          setPrivatePlaceName(place.name);
        }
      });
      autocompleteRef.current = ac;
    }, 80);
    return () => {
      clearTimeout(timer);
      if (ac) google.maps.event.clearInstanceListeners(ac);
      autocompleteRef.current = null;
    };
  }, [locationSheetOpen, isPrivate, mapsReady]);

  // Load friends when cohost sheet opens
  useEffect(() => {
    if (!cohostSheetOpen || !session?.access_token) return;
    setCohostFriendsLoading(true);
    fetch("/api/friends", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => { if (json?.ok) setCohostFriends(json.friends ?? []); })
      .catch(() => {})
      .finally(() => setCohostFriendsLoading(false));
  }, [cohostSheetOpen, session?.access_token]);

  // Click outside venue suggestions
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (venueWrapperRef.current && !venueWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Toggle aurora background: active when no image, removed when one is uploaded
  useEffect(() => {
    if (!imagePreview) {
      document.body.classList.add("is-aurora-page");
    } else {
      document.body.classList.remove("is-aurora-page");
    }
    return () => { document.body.classList.remove("is-aurora-page"); };
  }, [imagePreview]);

  function handleImageChange(file: File | null) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleVenueNameChange(value: string) {
    setVenueId(null);
    setVenueName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/venues/search?q=${encodeURIComponent(value.trim())}`);
        const json = await res.json();
        const venues: VenueSuggestion[] = json?.venues ?? [];
        setSuggestions(venues);
        setShowSuggestions(venues.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 250);
  }

  function selectVenue(v: VenueSuggestion) {
    setVenueId(v.id);
    setVenueName(v.name);
    setVenueAddress(v.address_line1 ?? venueAddress);
    setVenueCity(v.city ?? venueCity);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  const startAt = startDate
    ? `${startDate}T${allDay ? "00:00" : startTime || "00:00"}`
    : "";
  const endAt =
    showEndTime && endDate
      ? `${endDate}T${allDay ? "00:00" : endTime || "00:00"}`
      : "";

  const canSubmit = Boolean(title.trim() && startDate);
  const dateLine = formatDateLine(startDate, startTime, allDay);
  const locationLine = isPrivate ? (privatePlaceName || privateAddress) : venueName;

  const fallbackName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "You";
  const displayName = hostProfile?.display_name ?? fallbackName;
  const avatarUrl = hostProfile?.avatar_url ?? null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      let imageUrl: string | null = null;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const uploadRes = await fetch("/api/events/upload-image", {
          method: "POST",
          headers: authHeader,
          body: fd,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson?.ok) {
          throw new Error(uploadJson?.error ?? "Image upload failed.");
        }
        imageUrl = uploadJson.url as string;
      } else if (isEditMode && imagePreview?.startsWith("https://")) {
        // Keep existing image when editing without picking a new file
        imageUrl = imagePreview;
      }

      const basePayload = { title, description, descriptionTitle: descriptionTitle.trim() || undefined, startAt, endAt, visibility, imageUrl };
      const payload = isPrivate
        ? {
            ...basePayload,
            category: "concerts",
            venueName: privatePlaceName.trim() || privateAddress.trim() || "",
            venueAddress: privateAddress.trim() || "",
            venueCity: "Montréal",
            venueId: null,
            sourceUrl: null,
            lat: privateLat ?? undefined,
            lng: privateLng ?? undefined,
            placeId: privatePlaceId ?? undefined,
            cohostIds: cohostIds.length > 0 ? cohostIds : undefined,
            spotsMode,
            spotsLimit: spotsMode === "limited" && spotsLimit.trim() && parseInt(spotsLimit) > 0
              ? parseInt(spotsLimit)
              : null,
            price: costAmount.trim() && parseFloat(costAmount) > 0
              ? parseFloat(costAmount)
              : null,
            currency: costAmount.trim() && parseFloat(costAmount) > 0 ? costCurrency : null,
            paymentMethod: costAmount.trim() && parseFloat(costAmount) > 0 ? "interac" : null,
            paymentContact: costAmount.trim() && parseFloat(costAmount) > 0
              ? costPaymentContact.trim() || null
              : null,
            rsvpDeadline: rsvpDeadline || null,
          }
        : {
            ...basePayload,
            category,
            venueName,
            venueAddress,
            venueCity,
            venueId: venueId ?? null,
            sourceUrl: sourceUrl.trim() || null,
          };

      const res = await fetch(
        isEditMode ? `/api/events/${editEventId}` : "/api/events/submit",
        {
          method: isEditMode ? "PATCH" : "POST",
          headers: { "content-type": "application/json", ...authHeader },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? (isEditMode ? "Could not update event." : "Could not create event."));
      }

      if (isEditMode) {
        router.push(`/events/${editEventId}`);
      } else if (isPrivate) {
        router.push(`/events/${json.eventId}`);
      } else {
        setPublicSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setSubmitting(false);
    }
  }

  // Auth guard
  if (!authLoading && !user) {
    return (
      <main
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "48px 16px",
          display: "grid",
          gap: 16,
          justifyItems: "start",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Create an event</h1>
        <p style={{ opacity: 0.6, fontSize: 14, margin: 0 }}>
          Sign in to create and share events.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("outsy:open-signin"))}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  if (publicSubmitted) {
    return (
      <main
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "48px 16px",
          display: "grid",
          gap: 16,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Event submitted</h1>
        <p style={{ opacity: 0.6, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Your event will appear in the public feed once approved.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/"
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              background: "var(--foreground)",
              color: "var(--background)",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Back to events
          </Link>
          <button
            type="button"
            onClick={() => {
              setPublicSubmitted(false);
              setTitle("");
              setDescription("");
              setDescriptionTitle("");
              setStartDate("");
              setStartTime("");
              setEndDate("");
              setEndTime("");
              setShowEndTime(false);
              setAllDay(false);
              setPrivatePlaceName("");
              setPrivateAddress("");
              setPrivateLat(null);
              setPrivateLng(null);
              setPrivatePlaceId(null);
              setCohostIds([]);
              setCohostProfiles([]);
              setSpotsMode("unlimited");
              setSpotsLimit("");
              setCostAmount("");
              setCostCurrency("CAD");
              setCostPaymentContact("");
              setRsvpDeadline("");
              setVenueName("");
              setVenueAddress("");
              setVenueCity("Montréal");
              setSourceUrl("");
              setImageFile(null);
              setImagePreview(null);
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              color: "inherit",
            }}
          >
            Submit another
          </button>
        </div>
      </main>
    );
  }

  // ── Shared glass styles for on-canvas controls ──────────────────
  const glassCircle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", cursor: "pointer", flexShrink: 0, textDecoration: "none",
  };
  const glassPill: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "6px 13px", borderRadius: 20,
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
  };

  const darkVars = {
    color: "#eae8e4",
    "--background":     "rgba(20,11,7,0.72)",
    "--foreground":     "#eae8e4",
    "--border":         "rgba(255,255,255,0.10)",
    "--border-strong":  "rgba(255,255,255,0.18)",
    "--btn-bg":         "rgba(255,255,255,0.07)",
    "--btn-bg-active":  "rgba(255,255,255,0.13)",
    "--surface-subtle": "rgba(255,255,255,0.04)",
    "--surface-raised": "rgba(255,255,255,0.09)",
    "--accent":         "#a78bfa",
  } as React.CSSProperties;

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}&libraries=marker,places`}
        strategy="afterInteractive"
        onLoad={() => setMapsReady(true)}
      />

      <style>{`
        .cep-title::placeholder { color: rgba(255,255,255,0.30); }
        .cep-location::placeholder { color: rgba(255,255,255,0.32); }
        /* Ensure Google Places autocomplete dropdown renders above the sheet */
        .pac-container { z-index: 500 !important; }
        .cep-options::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Ambient background — image state only ──────────────────────── */}
      {imagePreview && (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <img
            src={imagePreview}
            alt=""
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: "blur(80px) saturate(1.8) brightness(0.35)",
              transform: "scale(1.15)",
              pointerEvents: "none",
            }}
          />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, ...darkVars }}>
      <form onSubmit={handleSubmit}>

        {/* ════════════════════════════════════════════════════════════
            CANVAS — full composition zone
            ════════════════════════════════════════════════════════════ */}
        <div
          className={imagePreview ? undefined : "app-page"}
          style={{
            position: "relative",
            aspectRatio: "3/4",
            borderRadius: "0 0 28px 28px",
            overflow: "hidden",
          }}
        >
          {!imagePreview && <div className="page-top-glow" aria-hidden="true" />}
          {/* Background image */}
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Cover"
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
              }}
            />
          )}

          {/* Overlay — minimal top scrim always; full hero gradient only with image */}
          <div
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: imagePreview
                // Full event-page treatment: dark top band + heavy bottom gradient
                ? "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, transparent 22%), linear-gradient(to top, rgba(14,8,5,1) 0%, rgba(14,8,5,0.93) 28%, rgba(14,8,5,0.6) 50%, rgba(14,8,5,0.15) 70%, transparent 100%)"
                // No image: just enough to keep the nav bar readable
                : "linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 18%)",
            }}
          />

          {/* ── Nav bar: [back] [toggle] [preview] ───────────────── */}
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 16px",
            }}
          >
            {/* Back */}
            <Link href="/" onClick={(e) => e.stopPropagation()} style={glassCircle} aria-label="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>

            {/* Toggle — centered, grows to fill */}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  display: "flex",
                  background: "rgba(0,0,0,0.28)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: 2, gap: 1,
                  maxWidth: 200, width: "100%",
                }}
              >
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    style={{
                      flex: 1, padding: "5px 10px", borderRadius: 18, border: "none",
                      background: visibility === v ? "rgba(255,255,255,0.22)" : "transparent",
                      color: "#fff",
                      fontSize: 12, fontWeight: visibility === v ? 600 : 400,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      transition: "background 0.15s",
                    }}
                  >
                    {v === "private" ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    )}
                    {v === "private" ? "Private" : "Public"}
                  </button>
                ))}
              </div>
            </div>

            {/* Spacer to balance the back button */}
            <div style={{ width: 36, flexShrink: 0 }} />
          </div>

          {/* ── Photo CTA (centered, no-image state only) ─────────── */}
          {!imagePreview && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -55%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
                background: "rgba(255,255,255,0.07)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1.5px dashed rgba(255,255,255,0.25)",
                borderRadius: 16, padding: "20px 32px",
                color: "#fff", cursor: "pointer", zIndex: 5,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.75 }}>Add background photo</span>
            </button>
          )}

          {/* Modify photo (when image is set) */}
          {imagePreview && (
            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 5 }}>
              <button
                type="button"
                onClick={() => setPhotoMenuOpen(true)}
                style={{ ...glassPill, fontSize: 12, padding: "6px 16px" }}
              >
                Modify photo
              </button>
            </div>
          )}

          {/* ── Bottom composition: title · date · location ─────────── */}
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5,
              padding: "90px 28px 40px",
              textAlign: "center",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}
          >
            {/* Title */}
            <input
              required
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="cep-title"
              style={{
                width: "100%",
                background: "transparent", border: "none", outline: "none",
                fontSize: 32, fontWeight: 800, lineHeight: 1.15,
                letterSpacing: "-0.02em",
                color: "#fff",
                textAlign: "center",
                fontFamily: "inherit",
              }}
            />

            {/* Date / time row */}
            <button
              type="button"
              onClick={() => setDateSheetOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                color: dateLine ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.38)",
                fontSize: 15, fontWeight: 500,
                fontFamily: "inherit",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dateLine || "Date & time"}
            </button>

            {/* Location row */}
            <button
              type="button"
              onClick={() => setLocationSheetOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                color: locationLine ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.38)",
                fontSize: 14, fontWeight: 500,
                fontFamily: "inherit",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {locationLine || "Location"}
            </button>
          </div>
        </div>
        {/* ════════════════════ END CANVAS ════════════════════════════ */}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
        />

        {/* ── Lower section ────────────────────────────────────────── */}
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 80px" }}>

          {/* ── Public-only: venue address + city + category + tickets ── */}
          {!isPrivate && (
            <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
              <div
                className="col-stack"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              >
                <input
                  placeholder="Street address"
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="City"
                  value={venueCity}
                  onChange={(e) => setVenueCity(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div
                className="col-stack"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              >
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  style={inputStyle}
                >
                  <option value="concerts">Concerts</option>
                  <option value="nightlife">Nightlife</option>
                  <option value="arts_culture">Arts &amp; Culture</option>
                  <option value="comedy">Comedy</option>
                  <option value="sports">Sports</option>
                  <option value="family">Family</option>
                </select>
                <input
                  placeholder="Tickets / info link"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* ── Hosted by ───────────────────────────────────────────── */}
          {user && (
            <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "18px 0",
                borderBottom: "1px solid var(--border)",
                marginTop: isPrivate ? 24 : 16,
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: getAvatarColor(displayName),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#fff",
                    flexShrink: 0, userSelect: "none",
                  }}
                >
                  {getInitials(displayName)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 2 }}>Hosted by</div>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </div>
              </div>
              {isPrivate ? (
                <button
                  type="button"
                  onClick={() => { setCohostSheetOpen(true); setCohostSearch(""); }}
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "transparent", cursor: "pointer",
                    fontSize: 12, color: "inherit", flexShrink: 0,
                  }}
                >
                  + Cohost
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "transparent", cursor: "not-allowed",
                    fontSize: 12, opacity: 0.35, color: "inherit", flexShrink: 0,
                  }}
                >
                  + Cohost
                </button>
              )}
            </div>

            {/* Selected co-host rows (one per selected cohost) */}
            {isPrivate && cohostProfiles.map((cp) => (
              <div
                key={cp.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {cp.avatar_url ? (
                  <img
                    src={cp.avatar_url}
                    alt={cp.display_name ?? ""}
                    style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: getAvatarColor(cp.display_name),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#fff",
                      flexShrink: 0, userSelect: "none",
                    }}
                  >
                    {getInitials(cp.display_name)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 2 }}>Co-host</div>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cp.display_name ?? `@${cp.username}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCohostIds((prev) => prev.filter((id) => id !== cp.id));
                    setCohostProfiles((prev) => prev.filter((p) => p.id !== cp.id));
                  }}
                  aria-label={`Remove ${cp.display_name ?? "co-host"}`}
                  style={{
                    width: 26, height: 26, borderRadius: "50%",
                    border: "none", background: "var(--surface-raised)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    color: "inherit", opacity: 0.55, flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            </>
          )}

          {/* ── Optional options carousel (private only) ─────────────── */}
          {isPrivate && (() => {
            const spotsLabel = spotsMode === "limited" && spotsLimit.trim() && parseInt(spotsLimit) > 0
              ? `${spotsLimit} spots`
              : null;
            const costLabel = costAmount.trim() && parseFloat(costAmount) > 0
              ? `${costCurrency === "CAD" ? "CA$" : "$"}${costAmount}`
              : null;
            const rsvpLabel = rsvpDeadline
              ? (() => {
                  const [y, m, d] = rsvpDeadline.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                })()
              : null;

            const chipBase: React.CSSProperties = {
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 20, flexShrink: 0,
              cursor: "pointer", fontSize: 13, fontWeight: 500,
              color: "inherit", background: "transparent",
              fontFamily: "inherit",
            };

            return (
              <div
                className="cep-options"
                style={{
                  display: "flex", gap: 8,
                  overflowX: "auto",
                  padding: "14px 0 2px",
                  scrollbarWidth: "none",
                }}
              >
                {/* Spots chip */}
                <button
                  type="button"
                  onClick={() => setOptionSheet("spots")}
                  style={{
                    ...chipBase,
                    border: `1px solid ${spotsLabel ? "var(--border-strong)" : "var(--border)"}`,
                    background: spotsLabel ? "var(--surface-raised)" : "transparent",
                    fontWeight: spotsLabel ? 600 : 500,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {spotsLabel ?? "Spots"}
                </button>

                {/* Cost chip */}
                <button
                  type="button"
                  onClick={() => setOptionSheet("cost")}
                  style={{
                    ...chipBase,
                    border: `1px solid ${costLabel ? "var(--border-strong)" : "var(--border)"}`,
                    background: costLabel ? "var(--surface-raised)" : "transparent",
                    fontWeight: costLabel ? 600 : 500,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
                    <path d="M13 5v2M13 17v2M13 11v2" />
                  </svg>
                  {costLabel ?? "Cost"}
                </button>

                {/* RSVP by chip */}
                <button
                  type="button"
                  onClick={() => setOptionSheet("rsvp")}
                  style={{
                    ...chipBase,
                    border: `1px solid ${rsvpLabel ? "var(--border-strong)" : "var(--border)"}`,
                    background: rsvpLabel ? "var(--surface-raised)" : "transparent",
                    fontWeight: rsvpLabel ? 600 : 500,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {rsvpLabel ? `RSVP by ${rsvpLabel}` : "RSVP by"}
                </button>
              </div>
            );
          })()}

          {/* ── Description ─────────────────────────────────────────── */}
          <div
            style={{
              marginTop: 10,
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--background)",
              overflow: "hidden",
            }}
            onBlur={(e) => {
              // Collapse the description block when focus leaves it entirely.
              // We must NOT collapse when focus moves between children (e.g. from
              // the textarea to the optional title input above it) — that was the
              // original bug: textarea.onBlur fired before the title <input> could
              // receive focus, unmounting it mid-tap.
              //
              // Capture currentTarget now; React nullifies it after the handler returns.
              const container = e.currentTarget;
              // relatedTarget is the element that is about to receive focus.
              // If it's still inside this block, keep the section open.
              if (container.contains(e.relatedTarget as Node | null)) return;
              // Mobile Safari sometimes delivers relatedTarget: null even when
              // focus is moving to a sibling input. Re-check after focus settles.
              setTimeout(() => {
                if (container.contains(document.activeElement)) return;
                if (!description && !descriptionTitle) setDescriptionOpen(false);
              }, 0);
            }}
          >
            {descriptionOpen || description ? (
              <>
                {/* Optional title */}
                <input
                  type="text"
                  placeholder="Section title (optional)"
                  value={descriptionTitle}
                  onChange={(e) => setDescriptionTitle(e.target.value)}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box",
                    padding: "14px 16px 10px", border: "none",
                    fontSize: 16, fontWeight: 600,
                    background: "transparent", color: "inherit",
                    outline: "none", fontFamily: "inherit",
                  }}
                />
                <div style={{ height: 1, background: "var(--border)", margin: "0 16px" }} />
                <textarea
                  autoFocus={descriptionOpen && !description}
                  placeholder="What's this event about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box",
                    padding: "10px 16px 14px", border: "none",
                    fontSize: 16, background: "transparent", color: "inherit",
                    resize: "vertical", outline: "none",
                    fontFamily: "inherit", lineHeight: 1.6,
                  }}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDescriptionOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "14px 16px",
                  background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", color: "inherit",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.45 }}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span style={{ fontSize: 14, opacity: 0.35, fontWeight: 400 }}>Add a description</span>
              </button>
            )}
          </div>

          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0" }}>{error}</p>
          )}

          {/* ── Submit ──────────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              style={{
                padding: "14px 20px", borderRadius: 12,
                border: "1px solid var(--border-strong)", background: "transparent",
                fontWeight: 600, fontSize: 15, cursor: "pointer", color: "inherit",
                flexShrink: 0,
              }}
            >
              Preview
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              style={{
                flex: 1,
                padding: "14px", borderRadius: 12, border: "none",
                fontWeight: 700, fontSize: 15,
                background: submitting || !canSubmit ? "var(--surface-subtle)" : "var(--foreground)",
                color: submitting || !canSubmit ? "inherit" : "var(--background)",
                cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
              }}
            >
              {submitting
                ? (isEditMode ? "Saving…" : "Creating…")
                : (isEditMode ? "Save changes" : "Publish event")}
            </button>
          </div>

          <p style={{ fontSize: 12, opacity: 0.4, textAlign: "center", margin: "12px 0 0" }}>
            {isPrivate
              ? "Accessible only by direct link — not in the public feed."
              : "Will appear in the public feed after review."}
          </p>
        </div>
      </form>

      {/* ── Photo action sheet ──────────────────────────────────────── */}
      {photoMenuOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={() => setPhotoMenuOpen(false)}
        >
          <div
            style={{
              width: "100%",
              background: "#111110",
              borderRadius: "22px 22px 0 0",
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 32, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.4 }} />
            </div>
            <button
              type="button"
              onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click(); }}
              style={{
                display: "block", width: "100%", padding: "16px 20px",
                background: "none", border: "none", borderBottom: "1px solid var(--border)",
                fontSize: 15, fontWeight: 500, cursor: "pointer", color: "inherit",
                textAlign: "left",
              }}
            >
              Change photo
            </button>
            <button
              type="button"
              onClick={() => { setPhotoMenuOpen(false); handleImageChange(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              style={{
                display: "block", width: "100%", padding: "16px 20px",
                background: "none", border: "none",
                fontSize: 15, fontWeight: 500, cursor: "pointer", color: "#dc2626",
                textAlign: "left",
              }}
            >
              Remove photo
            </button>
          </div>
        </div>
      )}

      {/* ── Option sheets (Spots / Cost / RSVP by) ──────────────────── */}

      {/* Spots sheet */}
      {optionSheet === "spots" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setOptionSheet(null)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button type="button" onClick={() => setOptionSheet(null)} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Spots</span>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}>Done</button>
            </div>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
              {/* Unlimited */}
              <button
                type="button"
                onClick={() => setSpotsMode("unlimited")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 0", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: 15, fontWeight: spotsMode === "unlimited" ? 600 : 400 }}
              >
                <span>Unlimited</span>
                {spotsMode === "unlimited" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
              {/* Limited */}
              <button
                type="button"
                onClick={() => setSpotsMode("limited")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 0", background: "none", border: "none", borderBottom: spotsMode === "limited" ? "none" : "1px solid var(--border)", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: 15, fontWeight: spotsMode === "limited" ? 600 : 400 }}
              >
                <span>Limited</span>
                {spotsMode === "limited" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
              {spotsMode === "limited" && (
                <div style={{ paddingTop: 14, paddingBottom: 4 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="Number of spots"
                    value={spotsLimit}
                    onChange={(e) => setSpotsLimit(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
                  />
                </div>
              )}
              <button type="button" onClick={() => setOptionSheet(null)} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Cost sheet */}
      {optionSheet === "cost" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setOptionSheet(null)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button type="button" onClick={() => setOptionSheet(null)} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Cost per person</span>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}>Done</button>
            </div>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
              {/* Price + currency row */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  style={{ flex: 1, boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
                  {(["CAD", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCostCurrency(c)}
                      style={{ padding: "11px 14px", border: "none", background: costCurrency === c ? "var(--surface-raised)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: costCurrency === c ? 700 : 400, color: "inherit", fontFamily: "inherit" }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {/* Interac section */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Payment via Interac</span>
                  <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "var(--surface-raised)", opacity: 0.7 }}>Interac</span>
                </div>
                <input
                  type="text"
                  placeholder="Email or phone number"
                  value={costPaymentContact}
                  onChange={(e) => setCostPaymentContact(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
                />
              </div>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* RSVP by sheet */}
      {optionSheet === "rsvp" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setOptionSheet(null)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button type="button" onClick={() => setOptionSheet(null)} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>RSVP by</span>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}>Done</button>
            </div>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
              <input
                type="date"
                value={rsvpDeadline}
                onChange={(e) => setRsvpDeadline(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
              />
              {rsvpDeadline && (
                <button
                  type="button"
                  onClick={() => setRsvpDeadline("")}
                  style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#ef4444", fontFamily: "inherit", padding: 0 }}
                >
                  Clear deadline
                </button>
              )}
              <button type="button" onClick={() => setOptionSheet(null)} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cohost picker sheet ─────────────────────────────────────── */}
      {cohostSheetOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setCohostSheetOpen(false)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", maxHeight: "80vh", display: "flex", flexDirection: "column", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setCohostSheetOpen(false)}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>
                {cohostIds.length > 0 ? `Co-hosts · ${cohostIds.length}` : "Add co-host"}
              </span>
              <button
                type="button"
                onClick={() => setCohostSheetOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}
              >
                Done
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <input
                value={cohostSearch}
                onChange={(e) => setCohostSearch(e.target.value)}
                placeholder="Search friends…"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 16, background: "var(--surface-raised)", color: "inherit", outline: "none", fontFamily: "inherit" }}
              />
            </div>

            {/* Friend list */}
            <div style={{ overflowY: "auto", flex: 1, padding: "8px 20px 0" }}>
              {cohostFriendsLoading ? (
                <p style={{ opacity: 0.45, fontSize: 14, textAlign: "center", padding: "32px 0" }}>Loading…</p>
              ) : cohostFriends.length === 0 ? (
                <p style={{ opacity: 0.45, fontSize: 14, textAlign: "center", padding: "32px 0" }}>No friends yet — add some from your profile.</p>
              ) : (() => {
                const q = cohostSearch.toLowerCase();
                const filtered = cohostFriends.filter((f) => {
                  if (!q) return true;
                  return (f.display_name ?? "").toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q);
                });
                if (filtered.length === 0) return <p style={{ opacity: 0.45, fontSize: 14, padding: "16px 0" }}>No results.</p>;
                return filtered.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (cohostIds.includes(f.id)) {
                        setCohostIds((prev) => prev.filter((id) => id !== f.id));
                        setCohostProfiles((prev) => prev.filter((p) => p.id !== f.id));
                      } else {
                        setCohostIds((prev) => [...prev, f.id]);
                        setCohostProfiles((prev) => [...prev, f]);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "10px 0", background: "none", border: "none",
                      borderBottom: "1px solid var(--border)", cursor: "pointer",
                      color: "inherit", textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: getAvatarColor(f.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, userSelect: "none" }}>
                        {getInitials(f.display_name)}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.display_name ?? `@${f.username}`}
                      </div>
                      {f.username && <div style={{ fontSize: 12, opacity: 0.45 }}>@{f.username}</div>}
                    </div>
                    {cohostIds.includes(f.id) && (
                      <svg style={{ marginLeft: "auto", flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Location sheet ──────────────────────────────────────────── */}
      {locationSheetOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={(e) => e.target === e.currentTarget && setLocationSheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              background: "#111110",
              borderRadius: "22px 22px 0 0",
              maxHeight: "90vh", overflowY: "auto",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 20px 8px" }}>
              <button
                type="button"
                onClick={() => setLocationSheetOpen(false)}
                aria-label="Close"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "var(--btn-bg)", border: "none",
                  cursor: "pointer", color: "inherit", flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Location</span>
              <button
                type="button"
                onClick={() => setLocationSheetOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 15, fontWeight: 600, color: "var(--accent)",
                  padding: "4px 0", flexShrink: 0,
                }}
              >
                Done
              </button>
            </div>

            <div style={{ padding: "8px 20px 16px" }}>
              <div style={{ maxWidth: 460, margin: "0 auto", width: "100%" }}>

                {/* Divider */}
                <div style={{ height: 1, background: "var(--border)", margin: "8px 0 20px" }} />

                {isPrivate ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      autoFocus
                      placeholder="Place name (optional)"
                      value={privatePlaceName}
                      onChange={(e) => setPrivatePlaceName(e.target.value)}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "11px 14px", borderRadius: 12,
                        border: "1px solid var(--border)", background: "var(--surface-subtle)",
                        color: "inherit", fontSize: 16, fontFamily: "inherit",
                      }}
                    />
                    <input
                      ref={addressInputRef}
                      placeholder="Address"
                      value={privateAddress}
                      onChange={(e) => {
                        setPrivateAddress(e.target.value);
                        setPrivatePlaceId(null);
                        setPrivateLat(null);
                        setPrivateLng(null);
                      }}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "11px 14px", borderRadius: 12,
                        border: "1px solid var(--border)", background: "var(--surface-subtle)",
                        color: "inherit", fontSize: 16, fontFamily: "inherit",
                      }}
                    />
                    <button
                      type="button"
                      disabled={geoLoading || !mapsReady}
                      onClick={() => {
                        if (!navigator.geolocation || !mapsReady) return;
                        setGeoLoading(true);
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const lat = pos.coords.latitude;
                            const lng = pos.coords.longitude;
                            setPrivateLat(lat);
                            setPrivateLng(lng);
                            const geocoder = new google.maps.Geocoder();
                            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                              if (status === "OK" && results?.[0]) {
                                setPrivateAddress(results[0].formatted_address);
                                setPrivatePlaceId(results[0].place_id ?? null);
                              } else {
                                setPrivateAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                              }
                              if (!privatePlaceNameRef.current.trim()) setPrivatePlaceName("Current location");
                              setGeoLoading(false);
                            });
                          },
                          () => setGeoLoading(false),
                          { timeout: 10000 },
                        );
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "11px 14px", borderRadius: 12,
                        border: "1px solid var(--border)", background: "var(--surface-subtle)",
                        color: geoLoading ? "var(--foreground)" : "var(--accent)",
                        fontSize: 15, fontWeight: 500, cursor: geoLoading ? "wait" : "pointer",
                        opacity: geoLoading ? 0.6 : 1, fontFamily: "inherit",
                      }}
                    >
                      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2 L4.5 20.5 L12 17 L19.5 20.5 Z" />
                      </svg>
                      {geoLoading ? "Getting location…" : "Use current location"}
                    </button>
                  </div>
                ) : (
                  <div ref={venueWrapperRef} style={{ position: "relative" }}>
                    <input
                      autoFocus
                      placeholder="Venue name"
                      value={venueName}
                      onChange={(e) => handleVenueNameChange(e.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      autoComplete="off"
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "11px 14px", borderRadius: 12,
                        border: "1px solid var(--border)", background: "var(--surface-subtle)",
                        color: "inherit", fontSize: 16, fontFamily: "inherit",
                      }}
                    />
                    {showSuggestions && (
                      <ul style={{
                        position: "absolute", top: "100%", left: 0, right: 0,
                        zIndex: 50, margin: "4px 0 0", padding: 0, listStyle: "none",
                        background: "#111110", border: "1px solid var(--border-strong)",
                        borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                        overflow: "hidden",
                      }}>
                        {suggestions.map((v) => (
                          <li
                            key={v.id}
                            onMouseDown={() => { selectVenue(v); setLocationSheetOpen(false); }}
                            style={{ padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 14 }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLLIElement).style.background = "var(--surface-subtle)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLLIElement).style.background = "")}
                          >
                            <span style={{ fontWeight: 600 }}>{v.name}</span>
                            {(v.city || v.address_line1) && (
                              <span style={{ opacity: 0.6, marginLeft: 6 }}>{[v.address_line1, v.city].filter(Boolean).join(", ")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Done button */}
                <button
                  type="button"
                  onClick={() => setLocationSheetOpen(false)}
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Date / Time bottom sheet ────────────────────────────────── */}
      {dateSheetOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={(e) => e.target === e.currentTarget && setDateSheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              background: "#111110",
              borderRadius: "22px 22px 0 0",
              maxHeight: "90vh", overflowY: "auto",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>

            {/* Header: X left · title center · Done right */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 20px 8px" }}>
              <button
                type="button"
                onClick={() => setDateSheetOpen(false)}
                aria-label="Close"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "var(--btn-bg)", border: "none",
                  cursor: "pointer", color: "inherit", flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>
                Date &amp; time
              </span>
              <button
                type="button"
                onClick={() => setDateSheetOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 15, fontWeight: 600, color: "var(--accent)",
                  padding: "4px 0", flexShrink: 0,
                }}
              >
                Done
              </button>
            </div>

            <div style={{ padding: "8px 20px 16px", display: "grid", gap: 0 }}>
              <div style={{ maxWidth: 460, margin: "0 auto", width: "100%" }}>

              {/* Divider */}
              <div style={{ height: 1, background: "var(--border)", margin: "8px 0 20px" }} />

              {/* All day row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>All day</span>
                <button
                  type="button"
                  onClick={() => setAllDay((v) => !v)}
                  aria-pressed={allDay}
                  style={{
                    width: 51, height: 31, borderRadius: 16, border: "none", cursor: "pointer",
                    background: allDay ? "var(--accent)" : "var(--btn-bg-active)",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: "absolute", top: 4, left: allDay ? 24 : 4,
                    width: 23, height: 23, borderRadius: "50%",
                    background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    transition: "left 0.18s",
                  }} />
                </button>
              </div>

              {/* START section */}
              <div style={{ display: "grid", gap: 8, paddingTop: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.4 }}>
                  Start
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate) setEndDate(e.target.value);
                    }}
                    style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 15, boxSizing: "border-box", minWidth: 0 }}
                  />
                  {!allDay && (
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      style={{ width: 112, flexShrink: 0, padding: "11px 10px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 15, boxSizing: "border-box" }}
                    />
                  )}
                </div>
              </div>

              {/* Add end time / END section */}
              {!showEndTime ? (
                <button
                  type="button"
                  onClick={() => setShowEndTime(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "none", border: "none", borderTop: "1px solid var(--border)",
                    padding: "20px 0 4px", cursor: "pointer", color: "var(--accent)",
                    fontFamily: "inherit", fontSize: 15, fontWeight: 500,
                    width: "100%", textAlign: "left", marginTop: 20,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add end time
                </button>
              ) : (
                <div style={{ display: "grid", gap: 8, paddingTop: 20, borderTop: "1px solid var(--border)", marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.4 }}>
                      End
                    </span>
                    <button
                      type="button"
                      onClick={() => { setShowEndTime(false); setEndDate(""); setEndTime(""); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#ef4444", fontFamily: "inherit", fontWeight: 500, padding: 0 }}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 15, boxSizing: "border-box", minWidth: 0 }}
                    />
                    {!allDay && (
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        style={{ width: 112, flexShrink: 0, padding: "11px 10px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 15, boxSizing: "border-box" }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Done button */}
              <button
                type="button"
                onClick={() => setDateSheetOpen(false)}
                style={{ padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}
              >
                Done
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>{/* end dark wrapper */}
    </>
  );
}
