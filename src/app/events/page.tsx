import { EventsList } from "./EventsList";
import { SubmitEventToggle } from "./SubmitEventToggle";

export default function EventsPage() {
  return (
    <main className="page-main" style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 24, background: "radial-gradient(ellipse 120% 60% at 50% -5%, rgba(124, 58, 237, 0.09) 0%, transparent 65%)" }}>
      <header>
        <h1 className="page-h1" style={{ fontSize: 32, fontWeight: 700 }}>Explore</h1>
        <p style={{ opacity: 0.7, marginTop: 8 }}>Music • Nightlife • Art</p>
      </header>

      <SubmitEventToggle />
      <EventsList />
    </main>
  );
}
