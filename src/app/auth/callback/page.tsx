"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();
    const code = new URL(window.location.href).searchParams.get("code");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).finally(() => {
        router.replace("/events");
      });
    } else {
      // Implicit flow or already exchanged — session detected via onAuthStateChange
      router.replace("/events");
    }
  }, [router]);

  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        opacity: 0.6,
        fontSize: 15,
      }}
    >
      Signing you in…
    </div>
  );
}
