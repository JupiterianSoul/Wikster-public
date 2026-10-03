import { SHOWCASE_MAX } from '../showcase.js';
import { USERNAME_RE, supabase } from './client.js';
import { live } from './live.js';
import { isSchemaGap, readProfiles, readSocialTable, writeSocial } from './schema.js';

export async function searchPlayers(term, selfId) {
  const q = term.trim();
  if (q.length < 2) return [];
  return readProfiles('id, username, level, rank, cards', (cols) => supabase
    .from('profiles')
    .select(cols)
    .ilike('username', `${q}%`)
    .neq('id', selfId)
    .limit(20));
}
export async function profilesById(ids) {
  const wanted = [...new Set((ids ?? []).filter(Boolean))].slice(0, 100);
  if (!wanted.length) return [];
  return readProfiles('id, username, level', (cols) => supabase
    .from('profiles')
    .select(cols)
    .in('id', wanted));
}

export async function listFriendships(selfId) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester, addressee, status, created_at')
    .or(`requester.eq.${selfId},addressee.eq.${selfId}`);
  if (error) throw error;

  const rows = data ?? [];
  const otherIds = [...new Set(rows.map((r) => (r.requester === selfId ? r.addressee : r.requester)))];
  const people = otherIds.length ? await readProfiles(
    'id, username, level, rank, cards, unique_cards, boosters_opened,'
    + ' collection_value, best_rarity, play_ms, created_at',
    (cols) => supabase.from('profiles').select(cols).in('id', otherIds), { appearance: true }) : [];
  return friendLists(selfId, rows, people);
}

export function friendLists(selfId, rows, people) {
  const profiles = new Map();
  for (const person of people ?? []) profiles.set(person.id, person);
  const friends = [];
  const outgoing = [];
  const incoming = [];
  for (const row of rows) {
    const otherId = row.requester === selfId ? row.addressee : row.requester;
    const entry = { ...row, profile: profiles.get(otherId) ?? null, otherId };
    if (!entry.profile) continue;
    if (row.status === 'accepted') friends.push(entry);
    else if (row.requester === selfId) outgoing.push(entry);
    else incoming.push(entry);
  }
  const byName = (a, b) => a.profile.username.localeCompare(b.profile.username);
  return { friends: friends.sort(byName), outgoing: outgoing.sort(byName), incoming: incoming.sort(byName) };
}

let digestRpc = null;

export const digestReady = () => digestRpc !== false;

export function forgetDigestProbe() {
  if (digestRpc === false) digestRpc = null;
}

export async function socialDigest(parts = null) {
  if (!supabase || digestRpc === false) return null;
  const { data, error } = await supabase.rpc('social_digest', { p_parts: parts });
  if (error) {
    if (isSchemaGap(error) || String(error.code ?? '') === 'PGRST202') { digestRpc = false; return null; }
    throw error;
  }
  digestRpc = true;
  return data && typeof data === 'object' ? data : null;
}

export function unreadFrom(rows) {
  const counts = new Map();
  const last = new Map();
  for (const row of rows ?? []) {
    counts.set(row.sender, (counts.get(row.sender) ?? 0) + 1);
    const held = last.get(row.sender);
    if (!held || String(row.created_at) > String(held.at)) last.set(row.sender, { id: row.id, at: row.created_at });
  }
  return { counts, last };
}

export async function sendRequest(selfId, otherId) {
  const { error } = await supabase.from('friendships')
    .insert({ requester: selfId, addressee: otherId, status: 'pending' });
  if (error) throw error;
}

export async function acceptRequest(id) {
  const { error } = await supabase.from('friendships')
    .update({ status: 'accepted' }).eq('id', id);
  if (error) throw error;
}

export async function removeFriendship(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  if (error) throw error;
}

export async function friendCollection(userId) {
  const { data, error } = await supabase.rpc('friend_cards', { target: userId });
  if (error) throw error;
  if (!data?.allowed) return null;
  if (!data.cards) return [];
  try {
    const cards = JSON.parse(data.cards);
    return cards?.entries ? Object.values(cards.entries) : [];
  } catch {
    return [];
  }
}

export function hasPresence(profile) {
  return (Boolean(profile) && 'presence' in profile);
}

export function isOnline(profile) {
  if (!hasPresence(profile)) return null;
  if (profile.presence !== 'online') return false;
  const seen = Date.parse(profile.last_seen_at ?? 0);
  return Number.isFinite(seen) && Date.now() - seen < 2 * 60 * 1000;
}

export async function changeUsername(userId, username) {
  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) throw new Error('username invalid');
  const { data: free, error: checkError } = await supabase.rpc('username_available', { name });
  if (checkError) throw checkError;
  if (!free) return null;
  const { data, error } = await supabase
    .from('profiles').update({ username: name }).eq('id', userId).select().single();
  if (error) {
    if (String(error.message ?? '').toLowerCase().includes('duplicate key')) return null;
    throw error;
  }
  return data;
}

export async function updateProfileFields(userId, fields) {
  return writeSocial(async () => {
    const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
    if (error) throw error;
  });
}

export async function heartbeat(userId) {
  if (live.socialColumns === false) return;
  const { error } = await supabase.from('profiles')
    .update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
  if (error) {
    if (isSchemaGap(error)) { live.socialColumns = false; return; }
    throw error;
  }
}

export async function listMessages(selfId, otherId, { limit = 60 } = {}) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at')
      .or(`and(sender.eq.${selfId},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${selfId})`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).reverse();
  }, []);
}

const TALK_PAGE = 30;
let talkRpc = null;

const talkRow = (selfId, m, unread = 0) => ({
  other: m.sender === selfId ? m.recipient : m.sender,
  lastId: m.id ?? null,
  lastSender: m.sender,
  lastBody: m.body ?? '',
  lastAt: m.created_at,
  lastReadAt: m.read_at ?? null,
  unread
});

export async function listConversations(selfId, { limit = TALK_PAGE, before = null } = {}) {
  const size = Math.max(1, Math.min(100, limit));
  if (talkRpc !== false) {
    const { data, error } = await supabase.rpc('my_conversations', { p_limit: size, p_before: before });
    if (!error) {
      talkRpc = true;
      return {
        rows: (data ?? []).map((r) => ({
          other: r.other, lastId: r.last_id ?? null, lastSender: r.last_sender, lastBody: r.last_body ?? '',
          lastAt: r.last_at, lastReadAt: r.last_read_at ?? null, unread: Number(r.unread) || 0
        })),
        more: (data ?? []).length >= size
      };
    }
    if (!isSchemaGap(error)) throw error;
    talkRpc = false;
  }
  return readSocialTable(async () => {
    let query = supabase.from('messages')
      .select('id, sender, recipient, body, created_at, read_at')
      .or(`sender.eq.${selfId},recipient.eq.${selfId}`)
      .order('created_at', { ascending: false })
      .limit(300);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) throw error;
    const byOther = new Map();
    for (const m of data ?? []) {
      const other = m.sender === selfId ? m.recipient : m.sender;
      if (!byOther.has(other)) byOther.set(other, talkRow(selfId, m, 0));
      if (m.recipient === selfId && !m.read_at) byOther.get(other).unread += 1;
    }
    const rows = [...byOther.values()].slice(0, size);
    return { rows, more: false };
  }, { rows: [], more: false });
}

export { talkRow };

export async function profileStats(id) {
  const rows = await readProfiles(
    'id, username, level, rank, cards, unique_cards, boosters_opened, collection_value, best_rarity, play_ms, created_at',
    (cols) => supabase.from('profiles').select(cols).eq('id', id).limit(1), { appearance: true });
  return rows[0] ?? null;
}

export async function sendChatMessage(selfId, otherId, body) {
  const text = String(body ?? '').trim().slice(0, 500);
  if (!text) return null;
  return writeSocial(async () => {
    const { data, error } = await supabase.from('messages')
      .insert({ sender: selfId, recipient: otherId, body: text }).select().single();
    if (error) throw error;
    return data;
  });
}

export async function markConversationRead(selfId, otherId) {
  return readSocialTable(async () => {
    const { error } = await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient', selfId).eq('sender', otherId).is('read_at', null);
    if (error) throw error;
  }, undefined);
}

export async function unreadSummary(selfId) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('messages').select('id, sender, created_at')
      .eq('recipient', selfId).is('read_at', null);
    if (error) throw error;
    return unreadFrom(data);
  }, { counts: new Map(), last: new Map() });
}

export async function unreadBySender(selfId) {
  return (await unreadSummary(selfId)).counts;
}

export async function sendDelivery(selfId, otherId, kind, payload, note = null) {
  return writeSocial(async () => {
    const { error } = await supabase.from('deliveries')
      .insert({ sender: selfId, recipient: otherId, kind, payload, note });
    if (error) throw error;
  });
}

export async function pendingDeliveries(selfId) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('deliveries')
      .select('id, sender, kind, payload, note, created_at')
      .eq('recipient', selfId).is('claimed_at', null)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function claimDelivery(id) {
  return writeSocial(async () => {
    const { error } = await supabase.from('deliveries')
      .update({ claimed_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  });
}

export async function proposeTrade(selfId, otherId, offer, ask) {
  return writeSocial(async () => {
    const { data, error } = await supabase.from('trades')
      .insert({ proposer: selfId, recipient: otherId, offer, ask }).select().single();
    if (error) throw error;
    return data;
  });
}

export async function openTrades(selfId) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('id, proposer, recipient, offer, ask, status, created_at, resolved_at')
      .or(`proposer.eq.${selfId},recipient.eq.${selfId}`)
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function setTradeStatus(id, status) {
  return writeSocial(async () => {
    const patch = { status };
    if (status !== 'pending') patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('trades').update(patch).eq('id', id);
    if (error) throw error;
  });
}

export async function publishAppearance(userId, appearance) {
  if (live.appearanceColumn === false || live.socialColumns === false) return false;
  const { error } = await supabase.from('profiles').update({ appearance }).eq('id', userId);
  if (!error) { live.appearanceColumn = true; return true; }
  if (isSchemaGap(error)) { live.appearanceColumn = false; return false; }
  throw error;
}

export async function setShowcase(userId, cards) {
  if (live.socialColumns === false) return;
  const { error } = await supabase.from('profiles')
    .update({ showcase: (cards ?? []).slice(0, SHOWCASE_MAX) }).eq('id', userId);
  if (error && !isSchemaGap(error)) throw error;
}

export async function showcaseKudos(owner) {
  return readSocialTable(async () => {
    const { data, error } = await supabase.from('showcase_kudos')
      .select('key, sender').eq('owner', owner);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function setKudos(owner, key, sender, on) {
  const table = supabase.from('showcase_kudos');
  const { error } = on
    ? await table.insert({ owner, key, sender })
    : await table.delete().eq('owner', owner).eq('key', key).eq('sender', sender);
  if (error && !/duplicate key/i.test(String(error.message ?? ''))) throw error;
}
