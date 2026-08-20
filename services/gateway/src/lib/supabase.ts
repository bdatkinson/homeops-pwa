/**
 * lib/supabase.ts — Supabase client factory for the Fly.io gateway.
 * Uses the service role key (server-side only — never exposed to clients).
 */

import { createClient } from "@supabase/supabase-js";
// import type { Database } from "@homeops/supabase"; // Temporarily commented out


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
