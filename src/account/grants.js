import { supabase } from './client.js';
import { isSchemaGap } from './schema.js';

let present = true;

export async function waitingGrants(userId) {
  if (!present || !userId) return [];
  const { data, error } = await supabase
    .from('grants')
    .select('id, at, kind, payload, note_en, note_fr')
    .eq('user_id', userId)
    .is('claimed_at', null)
    .order('at', { ascending: true })
    .limit(100);
  if (error) {
    if (isSchemaGap(error)) { present = false; return []; }
    throw error;
  }
  return data ?? [];
}

export async function claimGrants(ids) {
  if (!present || !ids.length) return false;
  const { error } = await supabase
    .from('grants')
    .update({ claimed_at: new Date().toISOString() })
    .in('id', ids)
    .is('claimed_at', null);
  if (error) {
    if (isSchemaGap(error)) { present = false; return false; }
    throw error;
  }
  return true;
}
