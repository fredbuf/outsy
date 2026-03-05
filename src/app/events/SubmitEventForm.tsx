"use client";

import { FormEvent, useMemo, useState } from "react";

type FormState = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  category: "music" | "nightlife" | "art";
  venueName: string;
  venueAddress: string;
  venueCity: string;
  minPrice: string;
  maxPrice: string;
  sourceUrl: string;
};

const initialForm: FormState = {
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  category: "music",
  venueName: "",
  venueAddress: "",
  venueCity: "Montréal",
  minPrice: "",
  maxPrice: "",
  sourceUrl: "",
};

export function SubmitEventForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(form.title.trim() && form.startAt.trim());
  }, [form.title, form.startAt]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/events/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          sourceUrl: form.sourceUrl.trim() || null,
          minPrice: form.minPrice.trim() || null,
          maxPrice: form.maxPrice.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Could not submit event.");
      }

      setForm(initialForm);
      setMessage("Submission received. It now appears in upcoming events.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 14,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Submit an event</h2>
      <p style={{ opacity: 0.7, marginTop: -4 }}>Add a Montréal event manually.</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          required
          placeholder="Event title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        />

        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Start</span>
            <input
              required
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>End (optional)</span>
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <select
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value as FormState["category"] }))
            }
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          >
            <option value="music">Music</option>
            <option value="nightlife">Nightlife</option>
            <option value="art">Art</option>
          </select>

          <input
            placeholder="Ticket/info link"
            value={form.sourceUrl}
            onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <input
            placeholder="Venue name"
            value={form.venueName}
            onChange={(e) => setForm((f) => ({ ...f, venueName: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          />
          <input
            placeholder="Venue address"
            value={form.venueAddress}
            onChange={(e) => setForm((f) => ({ ...f, venueAddress: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          />
          <input
            placeholder="City"
            value={form.venueCity}
            onChange={(e) => setForm((f) => ({ ...f, venueCity: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Min price (CAD)"
            value={form.minPrice}
            onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Max price (CAD)"
            value={form.maxPrice}
            onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            fontWeight: 700,
            background: submitting || !canSubmit ? "rgba(0,0,0,0.06)" : "white",
            cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit event"}
        </button>
      </form>

      {message ? <p style={{ color: "#116600" }}>{message}</p> : null}
      {error ? <p style={{ color: "#aa2222" }}>{error}</p> : null}
    </section>
  );
}
