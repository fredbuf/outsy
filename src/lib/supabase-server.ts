import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabaseServer = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        // Explicitly bypass Next.js Data Cache for every Supabase REST request.
        // Without this, Next.js may cache the underlying fetch() even when the
        // page/route is force-dynamic, causing server components to return stale rows.
        fetch: (url, options) =>
          fetch(url as RequestInfo | URL, {
            ...(options as RequestInit),
            cache: "no-store",
          }),
      },
    }
  );
