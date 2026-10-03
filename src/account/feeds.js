import { ANON_KEY, URL as API_URL, configured, keptFetch, supabase } from './client.js';

const drop = (channel) => {
  if (!channel) return;
  try { supabase.removeChannel(channel); } catch {}
};

const GIVE_UP = 4;

function openPrivate(topic, onMessage, onStatus) {
  let channel = null;
  let closed = false;
  let errors = 0;
  let joined = false;
  try {
    channel = supabase.channel(topic, { config: { private: true } });
    channel.on('broadcast', { event: '*' }, (message) => {
      const payload = message?.payload ?? {};
      try { onMessage({ kind: message?.event, type: payload.type ?? null, row: payload.row ?? null, payload }); } catch {}
    });
    Promise.resolve()
      .then(() => supabase.realtime.setAuth())
      .catch(() => {})
      .then(() => {
        if (closed || !channel) return;
        channel.subscribe((status) => {
          joined = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') errors = 0;
          else if (status === 'CHANNEL_ERROR' && ++errors >= GIVE_UP) { drop(channel); channel = null; }
          try { onStatus?.(status); } catch {}
        });
      });
  } catch {
    channel = null;
  }
  return {
    alive: () => !closed && Boolean(channel),
    joined: () => !closed && Boolean(channel) && joined,
    close() { closed = true; joined = false; drop(channel); channel = null; }
  };
}

export const userFeedUp = () => Boolean(mine?.wire?.joined?.());

const listeners = new Map();
let mine = null;

function tell(event) {
  for (const fn of [...(listeners.get(event.kind) ?? [])]) {
    try { fn(event); } catch {}
  }
}

export function onLive(kind, fn) {
  if (!listeners.has(kind)) listeners.set(kind, new Set());
  listeners.get(kind).add(fn);
  return () => listeners.get(kind)?.delete(fn);
}

const confirmed = new Set();
const waiting = new Set();
let asking = null;

function heardInbox(selfId, event) {
  if (event.kind !== 'message') return;
  const id = String(event.row?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || confirmed.has(id) || waiting.has(id) || waiting.size >= 40) return;
  waiting.add(id);
  asking ??= setTimeout(() => confirmInbox(selfId), 30);
}

async function confirmInbox(selfId) {
  const ids = [...waiting].slice(0, 20);
  for (const id of ids) waiting.delete(id);
  try {
    const { data, error } = await supabase.from('messages')
      .select('id, sender, recipient, body, created_at, read_at')
      .in('id', ids).eq('recipient', selfId);
    if (!error && mine?.id === selfId) {
      for (const row of [...(data ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
        if (confirmed.has(row.id)) continue;
        confirmed.add(row.id);
        if (confirmed.size > 400) confirmed.delete(confirmed.values().next().value);
        tell({ kind: 'message', type: 'INSERT', row, payload: { type: 'INSERT', row } });
      }
    }
  } catch {}
  asking = waiting.size ? setTimeout(() => confirmInbox(selfId), 30) : null;
}

export async function announceMessage(row) {
  if (!configured || !row?.id || !row.sender || !row.recipient) return false;
  const payload = { type: 'INSERT', row: { id: row.id, sender: row.sender, recipient: row.recipient, created_at: row.created_at ?? null } };
  try {
    const token = (await supabase.auth.getSession())?.data?.session?.access_token;
    if (token) {
      const res = await keptFetch(`${API_URL}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: `inbox:${row.recipient}`, event: 'message', payload, private: true }] }),
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(6000) : undefined
      });
      if (res.ok) return true;
    }
  } catch {}
  try {
    const { data, error } = await supabase.rpc('message_live', { p_id: row.id });
    return !error && data === true;
  } catch {
    return false;
  }
}

export function openLive(selfId) {
  if (!configured || !selfId) return { close() {} };
  if (mine?.id !== selfId || !mine.wire.alive()) {
    mine?.wire.close();
    mine?.world.close();
    mine?.inbox.close();
    const wire = openPrivate(`user:${selfId}`, tell);
    const world = openPrivate('world', tell);
    const inbox = openPrivate(`inbox:${selfId}`, (event) => heardInbox(selfId, event));
    mine = { id: selfId, wire, world, inbox };
  }
  const held = mine;
  return {
    alive: () => mine === held && held.wire.alive(),
    close() {
      if (mine !== held) return;
      held.wire.close();
      held.world.close();
      held.inbox.close();
      mine = null;
    }
  };
}

export function openGuildLive(guildId, onEvent) {
  if (!configured || !guildId) return { close() {} };
  return openPrivate(`guild:${guildId}`, (event) => onEvent?.(event));
}

export function openMarketLive(onChange) {
  if (!configured) return () => {};
  const wire = openPrivate('market', (event) => {
    if (event.kind !== 'auction') return;
    onChange?.(event.row ?? null, event.type);
  });
  return () => wire.close();
}

export function openPresence(selfId, { hidden = false } = {}, onSync) {
  if (!configured || !selfId) return { setHidden() {}, close() {} };
  let channel = null;
  let ready = false;
  let tracked = false;
  let wantHidden = Boolean(hidden);
  const settle = async () => {
    if (!ready || !channel) return;
    if (wantHidden) {
      if (tracked) { tracked = false; await channel.untrack(); }
    } else if (!tracked) {
      tracked = true;
      await channel.track({ at: new Date().toISOString() });
    }
  };
  try {
    channel = supabase.channel('presence:lobby', { config: { presence: { key: selfId } } });
    channel.on('presence', { event: 'sync' }, () => {
      try { onSync?.(new Set(Object.keys(channel.presenceState()))); } catch {}
    });
    channel.subscribe((status) => {
      ready = status === 'SUBSCRIBED';
      if (ready) settle().catch(() => {});
      else { tracked = false; try { onSync?.(null); } catch {} }
    });
  } catch {
    channel = null;
  }
  return {
    setHidden(value) { wantHidden = Boolean(value); settle().catch(() => {}); },
    close() { drop(channel); channel = null; ready = false; tracked = false; }
  };
}
