import { entryToRow } from './cards.js';
import { clone } from './core.js';
import { rarityRank } from '../data/rarities.js';
import { addPrints, bestPrint, printPrice, printsOf, takePrints } from './rules.js';

const rowCard = (row) => ({ rarityId: row.rarityId, count: row.copies, prints: row.prints, price: row.price });

export class CannotPredict extends Error {
  constructor(what) {
    super(`needs the server: ${what}`);
    this.cannotPredict = true;
  }
}

const needsServer = (what) => async () => { throw new CannotPredict(what); };

export function localStore(base, known = null) {
  const wallet = { coins: Number(base.wallet?.coins) || 0, ink: Number(base.wallet?.ink) || 0 };
  let econState = clone(base.state ?? {});
  const inventory = new Map(Object.entries(clone(base.inventory ?? {})));
  let custom = (base.custom ?? []).map((def) => ({ def: clone(def) }));
  const entries = base.entries ?? {};
  const cards = new Map();

  const rowOf = (key) => {
    if (!cards.has(key)) {
      const e = entries[key];
      cards.set(key, e ? { ...entryToRow(e, e.origin ?? 'pull'), copies: Math.max(1, Number(e.count) || 1), favorite: Boolean(e.favorite) } : null);
    }
    return cards.get(key);
  };

  function apply(ops) {
    const next = { coins: wallet.coins + Number(ops.coins ?? 0), ink: wallet.ink + Number(ops.ink ?? 0) };
    if (next.coins < 0 || next.ink < 0) throw new Error('INSUFFICIENT_FUNDS');
    for (const item of ops.inventory ?? []) {
      const n = Number(item.delta) || 0;
      const slot = inventory.get(item.spec_id);
      if (n < 0 && (!slot || slot.count < -n)) throw new Error('NOT_HELD');
    }
    for (const item of ops.remove ?? []) {
      const row = rowOf(item.key);
      const n = Math.max(1, Number(item.copies) || 1);
      if (!row || row.copies < n) throw new Error('NOT_OWNED');
      if (row.data?.special && !item.force) throw new Error('LOCKED');
      if (!takePrints(rowCard(row), n, item.rarityId ?? null)) throw new Error('NOT_OWNED');
    }
    wallet.coins = next.coins;
    wallet.ink = next.ink;
    for (const item of ops.inventory ?? []) {
      const n = Number(item.delta) || 0;
      const slot = inventory.get(item.spec_id);
      if (n > 0) inventory.set(item.spec_id, { spec: slot?.spec ?? clone(item.spec), count: (slot?.count ?? 0) + n });
      else if (n < 0) {
        if (slot.count === -n) inventory.delete(item.spec_id);
        else inventory.set(item.spec_id, { ...slot, count: slot.count + n });
      }
    }
    const removed = [];
    for (const item of ops.remove ?? []) {
      const n = Math.max(1, Number(item.copies) || 1);
      const row = rowOf(item.key);
      const card = rowCard(row);
      const best = bestPrint(printsOf(card));
      const took = takePrints(card, n, item.rarityId ?? null);
      const [only] = Object.keys(took.taken);
      const rarityId = Object.keys(took.taken).length === 1 ? only : best;
      removed.push({ key: row.key, title: row.title, rarityId, price: printPrice(row.price, best, rarityId), lang: row.lang, packId: row.packId, copies: n, data: clone(row.data), ...(Object.keys(took.taken).length > 1 ? { prints: took.taken } : {}) });
      if (row.copies === n) { cards.set(item.key, null); continue; }
      row.copies -= n;
      const left = bestPrint(took.prints);
      if (left !== best) {
        row.price = printPrice(row.price, best, left);
        row.rarityId = left;
      }
      row.prints = took.prints;
    }
    for (const item of ops.add ?? []) {
      const row = rowOf(item.key);
      const incoming = {
        key: item.key, title: item.title ?? item.key, rarityId: item.rarityId ?? 'common',
        price: Math.max(0, Number(item.price) || 0), copies: Math.max(1, Number(item.copies) || 1),
        lang: item.lang ?? 'en', packId: item.packId ?? null, origin: item.origin ?? 'pull', data: clone(item.data ?? {}), favorite: false
      };
      const more = printsOf({ rarityId: incoming.rarityId, count: incoming.copies, prints: item.prints });
      if (!row) { cards.set(item.key, { ...incoming, prints: more }); continue; }
      row.prints = addPrints(printsOf(rowCard(row)), more);
      row.copies += incoming.copies;
      if (rarityRank(incoming.rarityId) > rarityRank(row.rarityId)) {
        row.rarityId = incoming.rarityId;
        row.price = incoming.price;
        row.data = { ...row.data, ...incoming.data };
      } else {
        if (item.reprice !== undefined) row.price = Math.max(0, Number(item.reprice) || 0);
        row.data = { ...incoming.data, ...row.data };
      }
    }
    for (const item of ops.patch ?? []) {
      const row = rowOf(item.key);
      if (!row) continue;
      if (item.data) row.data = { ...row.data, ...clone(item.data) };
      if (item.title !== undefined) row.title = item.title;
      if (item.favorite !== undefined) row.favorite = Boolean(item.favorite);
    }
    if (ops.state) econState = { ...econState, ...clone(ops.state) };
    return { coins: wallet.coins, ink: wallet.ink, removed };
  }

  return {
    async load() {
      return {
        wallet: { ...wallet },
        state: clone(econState),
        inventory: Object.fromEntries([...inventory].map(([id, slot]) => [id, clone(slot)])),
        custom: clone(custom),
        born: null,
        cutover: null
      };
    },
    async cards(keys) {
      const list = keys == null ? [...new Set([...Object.keys(entries), ...cards.keys()])] : keys;
      return list.map(rowOf).filter(Boolean).map(clone);
    },
    async apply(ops) { return apply(clone(ops)); },
    async blockedHosts() { return []; },
    account: needsServer('account'),
    async customPut(def) { custom = [...custom.filter((row) => row.def?.id !== def.id), { def: clone(def) }]; },
    async customDrop(id) { custom = custom.filter((row) => row.def?.id !== id); },
    async facts(kind) {
      if (known && known[kind] !== undefined) return clone(known[kind]);
      throw new CannotPredict(`facts ${kind}`);
    },
    p2p: needsServer('p2p'),
    wipe: needsServer('wipe'),
    legacy: needsServer('legacy'),
    waiting: needsServer('waiting'),
    waitingList: needsServer('waitingList'),
    firstWaiting: needsServer('firstWaiting'),
    pullCards: needsServer('pullCards'),
    stash: needsServer('stash'),
    redeemCode: needsServer('redeemCode'),
    stockTake: needsServer('stockTake'),
    pullByNonce: needsServer('pullByNonce')
  };
}

export const SERVER_ONLY = new Set([
  'import', 'snapshot', 'sync', 'ready', 'prepare', 'ping', 'open', 'wipe', 'starter', 'redeem', 'quizStart', 'quizQuestions',
  'collect', 'grants', 'versus', 'guildGoal', 'guildMatch', 'gift', 'tradePropose', 'tradeAnswer', 'tradeCancel',
  'auctionCreate', 'auctionBid', 'auctionCancel', 'marketList', 'marketBid', 'marketCancel', 'bankDonate', 'bankTake', 'batch', 'wikiFind', 'safeReady', 'prepareMany'
]);

export async function predict(run, action, args, base, known = null, now = Date.now()) {
  const ctx = {
    store: localStore(base, known),
    now,
    random: Math.random,
    draw: needsServer('draw'),
    articleText: needsServer('articleText'),
    writeQuiz: needsServer('writeQuiz')
  };
  return run(ctx, action, args);
}
