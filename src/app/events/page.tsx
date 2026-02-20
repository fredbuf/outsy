import { EventsList } from "./EventsList";

export default function EventsPage() {
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>Events in Montréal</h1>
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        Music • Nightlife • Art
      </p>

      <div style={{ marginTop: 24 }}>
        <EventsList />
      </div>
    </main>
  );
}