import { EventsList } from "./EventsList";
import { AppTopBar } from "../components/AppTopBar";

export default function EventsPage() {
  return (
    <main className="page-main app-page" style={{ padding: "20px 20px 0", maxWidth: 980, margin: "0 auto", display: "grid", gap: 24, minHeight: "100dvh", alignContent: "start" }}>
      <AppTopBar />
      <EventsList />
    </main>
  );
}
