import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Anonymous client — safe for both client and server (RLS-scoped, public reads).
// The service-role client lives in supabase-server.ts (server-only barrier).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
