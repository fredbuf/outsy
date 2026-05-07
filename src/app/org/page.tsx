"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";

// /org is no longer a profile page.
// It redirects to /o/[slug] when an organizer is active, or /profile otherwise.
// /org/settings, /org/calendar, /org/inbox, /org/events remain unchanged.

export default function OrgPage() {
  const { activeOrganizer, identityLoading } = useActiveOrganizer();
  const router = useRouter();

  useEffect(() => {
    if (identityLoading) return;
    if (activeOrganizer?.slug) {
      router.replace(`/o/${activeOrganizer.slug}`);
    } else if (activeOrganizer) {
      // Organizer exists but has no public slug — send to settings.
      router.replace("/org/settings");
    } else {
      router.replace("/profile");
    }
  }, [activeOrganizer, identityLoading, router]);

  return null;
}
