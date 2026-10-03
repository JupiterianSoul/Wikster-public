import { specId } from '../booster.js';
import { rowToEntry } from './cards.js';

export class EconError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export const ECON_KEYS = [
  'started', 'stipendWindow', 'stipendHour', 'createdAt', 'boostersOpened', 'rarityCounts', 'progress', 'pendingLevels',
  'daily', 'timed', 'freeTaken', 'shopStock', 'todayBought', 'achievements', 'codesRedeemed', 'cardsSold',
  'fused', 'owned', 'albumTiers', 'seasons', 'seasonUnlocks', 'packsBuilt', 'eventsClaimed', 'liveBought', 'pity', 'opens', 'friendCodes', 'codeDefs', 'pullStats'
];

export const MAX_CUSTOM_PACKS = 24;

export const fail = (code, detail) => { throw new EconError(code, detail); };

export { utcDay, dayBefore } from '../days.js';
export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export const invOp = (spec, delta) => ({ spec_id: specId(spec), spec, delta });

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const LISTS = ['inventory', 'add', 'remove', 'patch', 'claims', 'marks'];

export function trimOps(loaded, ops) {
  const body = { ...ops };
  if (body.state) {
    const state = {};
    for (const [k, v] of Object.entries(body.state)) if (v !== undefined && !same(v, loaded.state?.[k])) state[k] = v;
    if (Object.keys(state).length) body.state = state;
    else delete body.state;
  }
  return body;
}

export function changesNothing(ops) {
  if (Number(ops.coins) || Number(ops.ink)) return false;
  if (LISTS.some((k) => Array.isArray(ops[k]) && ops[k].length)) return false;
  return !ops.state && !ops.pull && !ops.score;
}

async function cardsFor(ctx, keys) {
  const wanted = [...new Set(keys)];
  const rows = wanted.length ? await ctx.store.cards(wanted) : [];
  const byKey = new Map(rows.map((row) => [row.article_key ?? row.key, row]));
  const cards = {};
  for (const key of wanted) cards[key] = byKey.has(key) ? rowToEntry(byKey.get(key)) : null;
  return cards;
}

export async function commit(ctx, loaded, ops, { keys = [], extra = {} } = {}) {
  const body = trimOps(loaded, ops);
  if (changesNothing(body)) {
    const fresh = await ctx.store.load();
    return {
      wallet: { coins: Number(fresh.wallet.coins) || 0, ink: Number(fresh.wallet.ink) || 0 },
      state: fresh.state,
      inventory: fresh.inventory,
      cards: await cardsFor(ctx, keys),
      removed: [],
      ...extra
    };
  }
  if (body.state) {
    const rev = Number(loaded.state.rev) || 0;
    body.rev = rev;
    body.state = { ...body.state, rev: rev + 1 };
  }
  if (keys.length) body.keys = [...new Set(keys)];
  const done = await ctx.store.apply(body);
  const fresh = await ctx.store.load();
  return {
    wallet: { coins: Number(done?.coins ?? fresh.wallet.coins) || 0, ink: Number(done?.ink ?? fresh.wallet.ink) || 0 },
    state: fresh.state,
    inventory: fresh.inventory,
    cards: await cardsFor(ctx, keys),
    removed: done?.removed ?? [],
    ...extra
  };
}
