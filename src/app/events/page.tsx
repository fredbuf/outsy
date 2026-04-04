import { EventsList } from "./EventsList";

export default function EventsPage() {
  return (
    <main className="page-main app-bg" style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 24 }}>
      <header>
        <h1 className="page-h1" style={{ fontSize: 32, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>
          <span style={{ display: "block" }}>What&apos;s happening in</span>
          <span style={{ display: "block" }}>Montréal</span>
        </h1>
      </header>

      <EventsList />
    </main>
  );
}
