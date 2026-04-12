import { EventsList } from "./EventsList";
import { AppTopBar } from "../components/AppTopBar";

export default function EventsPage() {
  return (
    <main className="page-main app-page" style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 20, minHeight: "100dvh", alignContent: "start", border: "1.5px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)" }}>
      <div className="app-bg-gradient" aria-hidden="true" />
      <AppTopBar />
      <EventsList />
    </main>
  );
}
