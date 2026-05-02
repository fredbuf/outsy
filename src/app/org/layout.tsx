"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { activeOrganizer, identityLoading } = useActiveOrganizer();
  const router = useRouter();

  useEffect(() => {
    if (!identityLoading && !activeOrganizer) {
      router.replace("/profile");
    }
  }, [activeOrganizer, identityLoading, router]);

  if (identityLoading) return null;
  if (!activeOrganizer) return null; // redirect in flight

  return <>{children}</>;
}
