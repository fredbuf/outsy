import type { Metadata } from "next";
import { CreateEventPage } from "./CreateEventPage";

export const metadata: Metadata = {
  title: "New event — Outsy",
};

export default function NewEventRoute() {
  return <CreateEventPage />;
}
