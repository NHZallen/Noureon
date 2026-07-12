import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js';

export async function getNoureonProxyAuthHeaders() {
  if (!isSupabaseConfigured()) throw new Error('Noureon proxy requires a configured cloud account.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error('Noureon proxy requires an active cloud session. Please sign in again.');
  return { 'X-Noureon-Authorization': `Bearer ${accessToken}` };
}
