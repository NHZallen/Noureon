import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL?.trim() || '';
const supabasePublishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

let client;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

/** The address of the project (the public files of a share are read from its storage). */
export function getSupabaseUrl() {
  return supabaseUrl;
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return client;
}
