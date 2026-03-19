import { EventsList } from "./EventsList";
import { SubmitEventToggle } from "./SubmitEventToggle";

export default function EventsPage() {
  return (
    <main className="page-main" style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 24 }}>
      <header>
        <h1 className="page-h1" style={{ fontSize: 32, fontWeight: 700 }}>Events in Montréal</h1>
        <p style={{ opacity: 0.7, marginTop: 8 }}>Music • Nightlife • Art</p>
      </header>

      <SubmitEventToggle />
      <EventsList />
    </main>
  );
}
