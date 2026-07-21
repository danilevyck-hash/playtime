import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Service-role client for server-side admin writes (bypasses RLS). `server-only`
// is a hard barrier: importing this from a Client Component is a build error, so
// the SUPABASE_SERVICE_ROLE_KEY can never leak into the browser bundle.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
}

export { supabaseAdmin };
