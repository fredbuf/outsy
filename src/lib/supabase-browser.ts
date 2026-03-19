import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Singleton so session state is shared across components.
let _client: SupabaseClient | null = null;

export const supabaseBrowser = (): SupabaseClient => {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
};