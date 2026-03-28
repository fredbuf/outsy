import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateEventPage } from "./CreateEventPage";

export const metadata: Metadata = {
  title: "New event — Outsy",
};

export default function NewEventRoute() {
  return (
    <Suspense>
      <CreateEventPage />
    </Suspense>
  );
}
