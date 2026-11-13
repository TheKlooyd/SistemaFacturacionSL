import { createClient } from "@supabase/supabase-js";

// The isolated phone-test build uses a same-origin, authenticated local proxy.
const supabaseUrl = import.meta.env.VITE_SUPABASE_PROXY_PATH
  ? new URL(import.meta.env.VITE_SUPABASE_PROXY_PATH, window.location.origin).href
  : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
