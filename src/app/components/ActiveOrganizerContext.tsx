"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgEntry = {
  organizerId: string;
  name: string;
  type: string;
  slug: string | null;
  image_url: string | null;
  role: string;
};

type ActiveOrganizerContextValue = {
  /** The organizer the user is currently acting as. null = personal identity. */
  activeOrganizer: OrgEntry | null;
  /** Set the active organizer and persist to localStorage. Pass null to revert to personal. */
  setActiveOrganizer: (org: OrgEntry | null) => void;
  /** True while the mine fetch + localStorage validation is in progress after sign-in. */
  identityLoading: boolean;
  /** All organizer pages the signed-in user manages (owner/admin/editor, active). */
  orgPages: OrgEntry[];
};

// ── Context ───────────────────────────────────────────────────────────────────

const ActiveOrganizerContext = createContext<ActiveOrganizerContextValue>({
  activeOrganizer: null,
  setActiveOrganizer: () => {},
  identityLoading: true,
  orgPages: [],
});

export function useActiveOrganizer() {
  return useContext(ActiveOrganizerContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "outsy:active_organizer_id";

function safeLocalStorage() {
  try { return localStorage; } catch { return null; }
}

export function ActiveOrganizerProvider({ children }: { children: React.ReactNode }) {
  const { user, session, loading: authLoading } = useAuth();
  const [orgPages, setOrgPages] = useState<OrgEntry[]>([]);
  const [activeOrganizer, setActiveOrganizerState] = useState<OrgEntry | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);

  useEffect(() => {
    // Wait for Supabase auth to initialise before doing anything.
    if (authLoading) return;

    if (!user || !session?.access_token) {
      // Signed out — wipe everything, including any stale localStorage entry.
      setOrgPages([]);
      setActiveOrganizerState(null);
      safeLocalStorage()?.removeItem(STORAGE_KEY);
      setIdentityLoading(false);
      return;
    }

    // Signed in — fetch the user's organizer pages and validate any stored ID.
    // The stored ID is a hint only; it is never trusted unless confirmed here.
    setIdentityLoading(true);
    fetch("/api/organizers/mine", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        const pages: OrgEntry[] = json?.ok ? (json.organizers ?? []) : [];
        setOrgPages(pages);

        const storedId = safeLocalStorage()?.getItem(STORAGE_KEY) ?? null;
        if (storedId) {
          const match = pages.find((p) => p.organizerId === storedId);
          if (match) {
            // Valid — activate.
            setActiveOrganizerState(match);
          } else {
            // Stale or revoked membership — clear silently.
            safeLocalStorage()?.removeItem(STORAGE_KEY);
            setActiveOrganizerState(null);
          }
        } else {
          setActiveOrganizerState(null);
        }
      })
      .catch(() => {
        // Network error — fail open (personal identity, empty pages list).
        setOrgPages([]);
        setActiveOrganizerState(null);
      })
      .finally(() => setIdentityLoading(false));
  // Re-run when the signed-in user changes (e.g. after sign-out/sign-in).
  // access_token is included because it rotates on session refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, session?.access_token]);

  function setActiveOrganizer(org: OrgEntry | null) {
    setActiveOrganizerState(org);
    if (org) {
      safeLocalStorage()?.setItem(STORAGE_KEY, org.organizerId);
    } else {
      safeLocalStorage()?.removeItem(STORAGE_KEY);
    }
  }

  return (
    <ActiveOrganizerContext.Provider
      value={{ activeOrganizer, setActiveOrganizer, identityLoading, orgPages }}
    >
      {children}
    </ActiveOrganizerContext.Provider>
  );
}
