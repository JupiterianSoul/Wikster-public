import { supabase } from './client.js';
import { isSchemaGap } from './schema.js';

let present = true;

async function call(fn, args = {}) {
  if (!supabase || !present) throw new Error('SAFETY_UNSET');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isSchemaGap(error)) { present = false; throw new Error('SAFETY_UNSET'); }
    throw new Error(error.message || 'FAILED');
  }
  return data;
}

export const safetyReady = () => present;

export const fileReport = (kind, ref, target, reason, note = '') =>
  call('file_report', { p_kind: kind, p_ref: ref ?? null, p_target: target ?? null, p_reason: reason, p_note: note });

export const blockPlayer = (id) => call('block_player', { p_user: id });
export const unblockPlayer = (id) => call('unblock_player', { p_user: id });
export const noteFiltered = (scope, text) => call('note_filtered', { p_scope: scope, p_text: text }).catch(() => null);
export const reportsAnswered = () => call('reports_answered').catch(() => []);
export const reportsSeen = () => call('reports_seen').catch(() => null);

export async function myBlocks(selfId) {
  if (!supabase || !present || !selfId) return [];
  const { data, error } = await supabase.from('blocks').select('blocked, created_at').eq('blocker', selfId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isSchemaGap(error)) present = false;
    return [];
  }
  return data ?? [];
}
