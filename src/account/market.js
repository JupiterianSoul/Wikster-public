import { configured, supabase } from './client.js';
import { isSchemaGap } from './schema.js';

export let marketTables = null;

export function marketSchemaReady() {
  return (marketTables !== false);
}

export async function marketCall(run) {
  try {
    const value = await run();
    marketTables = true;
    return value;
  } catch (error) {
    if (isSchemaGap(error)) { marketTables = false; throw new Error('MARKET_UNSET'); }
    throw error;
  }
}

const rpc = (name, args) => marketCall(async () => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
});

export function browseLots(filter = {}, sort = 'ending', limit = 24, offset = 0) {
  return rpc('market_browse', { p_filter: filter, p_sort: sort, p_limit: limit, p_offset: offset });
}

export function lotDetail(id) {
  return rpc('market_lot', { p_id: id });
}

export function myLots(view = 'selling', limit = 30, offset = 0) {
  return rpc('market_mine', { p_view: view, p_limit: limit, p_offset: offset });
}

export function cardPrices(key, rarity = null) {
  return rpc('market_prices', { p_key: key, p_rarity: rarity });
}

export function openChatChannel(selfId, otherId, onEvent) {
  if (!configured) return { send() {}, close() {} };
  const name = `chat:${[selfId, otherId].sort().join(':')}`;
  let channel = null;
  let ready = false;
  const waiting = [];
  const put = (payload) => {
    try { channel.send({ type: 'broadcast', event: 'chat', payload }); } catch {}
  };
  try {
    channel = supabase.channel(name, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (payload?.from && payload.from !== selfId) onEvent?.(payload);
      })
      .subscribe((status) => {
        ready = status === 'SUBSCRIBED';
        if (ready) while (waiting.length) put(waiting.shift());
      });
  } catch {
    channel = null;
  }
  return {
    send(kind, extra = {}) {
      if (!channel) return;
      const payload = { kind, from: selfId, at: Date.now(), ...extra };
      if (!ready) {
        const at = waiting.findIndex((w) => w.kind === kind);
        if (at >= 0) waiting.splice(at, 1);
        if (waiting.length < 8) waiting.push(payload);
        return;
      }
      put(payload);
    },
    close() {
      if (!channel) return;
      try { supabase.removeChannel(channel); } catch {}
      channel = null;
    }
  };
}
