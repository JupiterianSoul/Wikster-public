import { configured, supabase } from './client.js';

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

export function openLive(selfId) {
  if (!configured || !selfId) return { close() {} };
  if (mine?.id !== selfId || !mine.wire.alive()) {
    mine?.wire.close();
    mine?.world.close();
    const wire = openPrivate(`user:${selfId}`, tell);
    const world = openPrivate('world', tell);
    mine = { id: selfId, wire, world };
  }
  const held = mine;
  return {
    alive: () => mine === held && held.wire.alive(),
    close() {
      if (mine !== held) return;
      held.wire.close();
      held.world.close();
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
