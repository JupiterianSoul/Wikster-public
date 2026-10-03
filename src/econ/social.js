import { entryToRow } from './cards.js';
import { commit, fail, invOp } from './core.js';
import { track } from './track.js';

const text = (v, n) => String(v ?? '').slice(0, n);
const uuid = (v) => (/^[0-9a-f-]{36}$/i.test(String(v ?? '')) ? String(v) : fail('NOT_FOUND'));
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fail('BAD_AMOUNT'));

const keysIn = (list) => (Array.isArray(list) ? list : []).map((c) => c?.key).filter(Boolean);

async function via(ctx, fn, args, { keys = [], events = [], keysOf = () => [] } = {}) {
  let loaded = await ctx.store.load();
  const result = await ctx.store.p2p(fn, args);
  const touched = [...keys, ...keysOf(result)];
  for (let attempt = 0; ; attempt++) {
    const tracked = events.length && attempt < 3 ? track(loaded.state, events, ctx.now) : null;
    try {
      return await commit(ctx, loaded, tracked ? { state: tracked.state } : {}, {
        keys: touched, extra: { result, season: tracked?.season ?? null }
      });
    } catch (error) {
      if (String(error?.message ?? '') !== 'CONFLICT' || attempt >= 3) throw error;
      loaded = await ctx.store.load();
    }
  }
}

function landCard(card, origin) {
  if (!card?.key) return null;
  return card.data ? { ...card, copies: Math.max(1, Number(card.copies) || 1), origin } : entryToRow(card, origin);
}

export const SOCIAL_ACTIONS = {
  async collect(ctx) {
    const loaded = await ctx.store.load();
    const rows = (await ctx.store.facts('deliveries')) ?? [];
    if (!rows.length) return { ...(await commit(ctx, loaded, {})), landed: [] };
    let coins = 0;
    const add = [];
    const inventory = [];
    const marks = [];
    const events = [];
    for (const row of rows) {
      const p = row.payload ?? {};
      if (row.kind === 'card' || row.kind === 'auction-card') {
        const card = landCard(p, row.kind === 'card' ? 'gift' : 'auction');
        if (card) add.push(card);
      } else if (row.kind === 'trade-return') {
        for (const c of Array.isArray(p.cards) ? p.cards : []) {
          const card = landCard(c, 'trade');
          if (card) add.push(card);
        }
        events.push({ m: 'trade' });
      } else if (row.kind === 'booster' && p.spec && typeof p.spec === 'object') {
        inventory.push(invOp(p.spec, Math.max(1, Math.round(Number(p.count) || 1))));
      } else if (row.kind === 'auction-money') {
        coins += Math.max(0, Math.round(Number(p.amount) || 0));
      }
      marks.push({ kind: 'delivery', id: row.id });
    }
    const tracked = events.length ? track(loaded.state, events, ctx.now) : null;
    return commit(ctx, loaded, {
      coins, add, inventory, marks,
      ...(tracked ? { state: tracked.state } : {}),
      kind: 'collect', detail: { ids: rows.map((r) => r.id) }
    }, { keys: add.map((c) => c.key), extra: { landed: rows, season: tracked?.season ?? null } });
  },

  gift(ctx, { to, kind, ref, note = null }) {
    if (kind !== 'card' && kind !== 'booster') fail('BAD_KIND');
    return via(ctx, 'gift', { p_to: uuid(to), p_kind: kind, p_ref: text(ref, 400), p_note: note == null ? null : text(note, 200) }, {
      keys: kind === 'card' ? [String(ref)] : [], events: [{ m: 'gift' }]
    });
  },

  tradePropose(ctx, { to, offer = [], ask = [] }) {
    if (!Array.isArray(offer) || !Array.isArray(ask)) fail('BAD_TRADE');
    const keys = offer.map((k) => text(k, 400));
    const asks = ask.map((a) => ({ key: text(a?.key, 400), title: text(a?.title, 300), rarityId: text(a?.rarityId, 20) }));
    return via(ctx, 'trade_propose', { p_to: uuid(to), p_offer: keys, p_ask: asks }, { keys });
  },

  tradeAnswer(ctx, { id, accept }) {
    const on = Boolean(accept);
    return via(ctx, 'trade_answer', { p_id: uuid(id), p_accept: on }, {
      events: on ? [{ m: 'trade' }] : [],
      keysOf: (t) => (on ? [...keysIn(t?.offer), ...keysIn(t?.ask)] : [])
    });
  },

  tradeCancel(ctx, { id }) {
    return via(ctx, 'trade_cancel', { p_id: uuid(id) }, { keysOf: (t) => keysIn(t?.offer) });
  },

  auctionCreate(ctx, { key, price, minutes }) {
    return via(ctx, 'auction_create', { p_key: text(key, 400), p_price: int(price), p_minutes: int(minutes) }, { keys: [String(key)] });
  },

  auctionBid(ctx, { id, amount }) {
    return via(ctx, 'auction_bid', { p_id: uuid(id), p_amount: int(amount) });
  },

  auctionCancel(ctx, { id }) {
    return via(ctx, 'auction_cancel', { p_id: uuid(id) }, { keysOf: (a) => keysIn([a?.card]) });
  },

  async marketList(ctx, { key, rarity = null, start, buyout = null, minutes }) {
    const out = await via(ctx, 'market_list', {
      p_key: text(key, 400), p_rarity: rarity == null || rarity === '' ? null : text(rarity, 20), p_start: int(start),
      p_buyout: buyout == null || buyout === '' ? null : int(buyout), p_minutes: int(minutes)
    }, { keys: [String(key)] });
    if (out.result?.error) fail(out.result.error);
    return out;
  },

  async marketBid(ctx, { id, amount = null, buyout = false }) {
    const out = await via(ctx, 'market_bid', { p_id: uuid(id), p_amount: buyout ? null : int(amount), p_buyout: Boolean(buyout) }, {
      keysOf: (r) => (r?.bought ? keysIn([r?.lot?.card]) : [])
    });
    if (out.result?.error) fail(out.result.error);
    return out;
  },

  async marketCancel(ctx, { id }) {
    const out = await via(ctx, 'market_cancel', { p_id: uuid(id) }, { keysOf: (r) => keysIn([r?.lot?.card]) });
    if (out.result?.error) fail(out.result.error);
    return out;
  },

  bankDonate(ctx, { key }) {
    return via(ctx, 'bank_donate', { p_key: text(key, 400) }, { keys: [String(key)] });
  },

  bankTake(ctx, { id }) {
    return via(ctx, 'bank_take', { p_id: uuid(id) }, { keysOf: (card) => keysIn([card]) });
  }
};
