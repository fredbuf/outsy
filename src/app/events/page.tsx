import { EventsList } from "./EventsList";
import SetBodyClass from "../components/SetBodyClass";
import { AppTopBar } from "../components/AppTopBar";

export default function EventsPage() {
  return (
    <main className="page-main app-page" style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 20, minHeight: "100dvh" }}>
      <SetBodyClass className="is-aurora-page" />
      <div className="page-top-glow" aria-hidden="true" />
      <AppTopBar />
      <EventsList />
    </main>
  );
}
