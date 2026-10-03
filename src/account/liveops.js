import { configured, supabase } from './client.js';

export async function fetchLiveState() {
  if (!configured) return null;
  const { data, error } = await supabase.rpc('live_state');
  if (error) throw error;
  return data && typeof data === 'object' ? data : null;
}
