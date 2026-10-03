import { USERNAME_RE, supabase } from './client.js';
import { isSchemaGap } from './schema.js';
import { live } from './live.js';

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureProfile(userId, username = null) {
  const existing = await getProfile(userId);
  if (existing) return existing;

  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) return null;

  const { data, error } = await supabase
    .from('profiles').insert({ id: userId, username: name }).select().single();
  if (error) {
    if (String(error.message ?? '').toLowerCase().includes('duplicate key')) return null;
    throw error;
  }
  return data;
}

export function profileForSession(session) {
  return (ensureProfile(session.user.id, session.user.user_metadata?.username ?? null));
}

export async function publishStats(userId, stats) {
  const row = {
    level: stats.level,
    rank: stats.rank,
    cards: stats.cards,
    unique_cards: stats.uniqueCards,
    boosters_opened: stats.boostersOpened,
    collection_value: stats.value,
    best_rarity: stats.bestRarity,
    play_ms: stats.playMs
  };
  if (stats.badges && typeof stats.badges === 'object' && live.badgeColumn !== false) {
    const { error } = await supabase.from('profiles').update({ ...row, badges: stats.badges }).eq('id', userId);
    if (!error) { live.badgeColumn = true; return; }
    if (!isSchemaGap(error)) throw error;
    live.badgeColumn = false;
  }
  const { error } = await supabase.from('profiles').update(row).eq('id', userId);
  if (error) throw error;
}
