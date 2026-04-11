"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();
    const code = new URL(window.location.href).searchParams.get("code");

    function resolveDestination(user: { created_at: string; last_sign_in_at?: string } | undefined) {
      if (!user) return "/events";
      const created = new Date(user.created_at).getTime();
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : created;
      // New user: created_at and last_sign_in_at are within 10 seconds of each other
      const isNewUser = Math.abs(lastSignIn - created) < 10_000;
      return isNewUser ? "/profile" : "/events";
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data }) => {
        router.replace(resolveDestination(data.session?.user));
      });
    } else {
      // Implicit flow — read session to determine if new user
      supabase.auth.getSession().then(({ data }) => {
        router.replace(resolveDestination(data.session?.user));
      });
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
