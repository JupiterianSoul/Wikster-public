import { specId, specName } from '../booster.js';
import { cleanCodeDef, codeDefsOf, codeSpec, learnCodeDefs, normalizeCode } from '../codedefs.js';
import { priceFor } from '../pricing.js';
import { RARITIES, rarityById } from '../data/rarities.js';
import { addXp, cleanPending, normalizeProgress } from '../progression.js';
import { accrue, emptyTimed } from '../timed.js';
import { liveShelf } from '../shop.js';
import { t } from '../i18n.js';
import { activeEvents, eventGiftOf, liveNow } from '../live.js';
import { checkItems } from './items.js';
import { entryToRow, pullEntry } from './cards.js';
import { clone, commit, fail, invOp } from './core.js';
import { checkSpecial, friendLookId, friendSpec } from '../friendcodes.js';

function cardEntry(article, rarityId, count, now) {
  const rarity = rarityById(rarityId);
  const spec = { kind: 'open', themeId: null, rarityId: rarity.id, cards: count };
  const pull = {
    article,
    rarityId: rarity.id,
    price: priceFor(Number(article.popularity) || 0, rarity),
    packName: t('giftPackName'),
    packIcon: 'gift',
    packAccent: null
  };
  return pullEntry(pull, specId(spec), now);
}

export function itemsOps(items, loaded, now) {
  let list;
  try {
    list = checkItems(items, 'code');
  } catch (error) {
    fail(error?.code ?? 'BAD_ITEMS');
  }
  const ops = { coins: 0, ink: 0, inventory: [], add: [], state: {} };
  const keys = [];
  const specs = [];
  let levels = [];
  const progressOf = () => (ops.state.progress ??= clone(loaded.state.progress ?? { level: 1, xp: 0 }));
  for (const item of list) {
    switch (item.kind) {
      case 'coins': ops.coins += item.amount; break;
      case 'ink': ops.ink += item.amount; break;
      case 'booster': {
        ops.inventory.push(invOp(item.spec, item.count));
        for (let i = 0; i < item.count; i++) specs.push(item.spec);
        break;
      }
      case 'card': {
        const entry = cardEntry(item.article, item.rarityId, item.count, now);
        ops.add.push({ ...entryToRow(entry, 'code'), copies: item.count });
        keys.push(entry.key);
        break;
      }
      case 'owned': {
        const bag = ops.state.owned ?? clone(loaded.state.owned ?? { themes: [], frames: [], fx: [] });
        const owned = (bag[item.bucket] ??= []);
        for (const id of item.ids ?? [item.id]) if (!owned.includes(id)) owned.push(id);
        ops.state.owned = bag;
        break;
      }
      case 'xp': {
        levels = levels.concat(addXp(progressOf(), item.amount));
        break;
      }
      case 'level': {
        const progress = progressOf();
        progress.level = item.value;
        progress.xp = 0;
        normalizeProgress(progress);
        break;
      }
      case 'boostersOpened': ops.state.boostersOpened = item.value; break;
      default: break;
    }
  }
  if (levels.length) ops.state.pendingLevels = cleanPending([...(loaded.state.pendingLevels ?? []), ...levels]);
  if (!Object.keys(ops.state).length) delete ops.state;
  return { ops, keys, specs, levels };
}

function friendPull(code, card, look) {
  const rarity = rarityById(card.rarityId);
  const source = card.article;
  const article = {
    ...source,
    key: `special:db:${code}:${source.key}`,
    article: source.key,
    special: `db:${code}`,
    sourceId: 'special',
    sourceName: source.sourceName ?? 'Wikster'
  };
  return {
    article,
    rarityId: rarity.id,
    price: priceFor(Number(source.popularity) || 0, rarity.id === 'special' ? rarityById('prismatic') : rarity),
    ...look
  };
}

function friendGrant(code, special, loaded, ops, now) {
  const state = (ops.state ??= {});
  const keys = [];
  const accent = special.booster?.accent ?? special.theme?.accent ?? special.badge?.color ?? null;
  const packId = `code|db:${code}|std|${special.cards.length}`;
  const packName = t('friendCardsPack', { name: special.name });
  special.cards.forEach((card, i) => {
    const entry = pullEntry(friendPull(code, card, { packName, packIcon: 'gift', packAccent: accent }), packId, now + i);
    ops.add.push({ ...entryToRow(entry, 'code'), copies: 1 });
    keys.push(entry.key);
  });
  let spec = null;
  let cards = null;
  if (special.booster) {
    spec = friendSpec(code, special.booster, special.name);
    cards = special.booster.cards.map((card) => friendPull(code, card, { packName: specName(spec), packIcon: 'gift', packAccent: spec.accent }));
    ops.inventory.push(invOp(spec, 1));
  }
  if (special.theme) {
    const bag = state.owned ?? clone(loaded.state.owned ?? { themes: [], frames: [], fx: [] });
    bag.themes = Array.isArray(bag.themes) ? bag.themes : [];
    if (!bag.themes.includes(friendLookId(code))) bag.themes.push(friendLookId(code));
    state.owned = bag;
  }
  const def = {
    name: special.name,
    message: special.message,
    cards: special.cards.length,
    booster: special.booster ? { name: special.booster.name, accent: spec.accent, accent2: spec.accent2, cards: spec.cards } : null,
    theme: special.theme,
    badge: special.badge,
    at: now
  };
  state.friendCodes = { ...clone(loaded.state.friendCodes ?? {}), [code]: def };
  return { keys, spec, cards, friend: { code, ...def, spec, keys: [...keys] } };
}

async function legacyGrant(ctx, loaded, taken) {
  try {
    const def = cleanCodeDef(taken.legacy) ?? fail('BAD_SPECIAL');
    if (Number(loaded.state.codesRedeemed?.[def.id]) > 0) fail('ALREADY_CLAIMED');
    const spec = def.regalia ? null : codeSpec(def);
    learnCodeDefs({ [def.id]: def });
    return await commit(ctx, loaded, {
      inventory: spec ? [invOp(spec, 1)] : [],
      state: {
        codesRedeemed: { ...(loaded.state.codesRedeemed ?? {}), [def.id]: 1 },
        codeDefs: { ...codeDefsOf(loaded.state), [def.id]: def }
      },
      claims: [`code:${def.id}`],
      kind: 'code', detail: { id: def.id }
    }, { extra: { codeId: def.id, spec, code: def } });
  } catch (error) {
    await ctx.store.redeemRelease?.(taken.use).catch(() => {});
    throw error;
  }
}

export async function redeemFromBook(ctx, loaded, raw) {
  const code = normalizeCode(raw);
  if (!code || typeof ctx.store.redeemCode !== 'function') fail('UNKNOWN_CODE');
  const taken = await ctx.store.redeemCode(code);
  if (!taken?.code) fail('UNKNOWN_CODE');
  if (taken.legacy) return legacyGrant(ctx, loaded, taken);
  let stashed = null;
  try {
    const items = Array.isArray(taken.items) && taken.items.length ? taken.items : null;
    let special = null;
    if (taken.special) {
      try { special = checkSpecial(taken.special, Boolean(items)); } catch (error) { fail(error?.code ?? 'BAD_SPECIAL'); }
    }
    if (!items && !special) fail('BAD_ITEMS');
    const { ops, keys, specs, levels } = items
      ? itemsOps(items, loaded, ctx.now)
      : { ops: { coins: 0, ink: 0, inventory: [], add: [] }, keys: [], specs: [], levels: [] };
    let friend = null;
    if (special) {
      const made = friendGrant(taken.code, special, loaded, ops, ctx.now);
      keys.push(...made.keys);
      if (made.spec) {
        specs.push(made.spec);
        stashed = await ctx.store.stash({ specId: specId(made.spec), spec: made.spec, cards: made.cards });
      }
      friend = made.friend;
    }
    return await commit(ctx, loaded, {
      ...ops,
      claims: [`dbcode:${taken.code}:${Number(taken.n) || 1}`],
      kind: 'code', reason: 'redeem code', detail: { code: taken.code }
    }, { keys, extra: { dbCode: { code: taken.code, items: taken.items ?? [] }, specs, levels, ...(friend ? { friend } : {}) } });
  } catch (error) {
    if (stashed) await ctx.store.dropPulls?.([stashed]).catch(() => {});
    await ctx.store.redeemRelease?.(taken.use).catch(() => {});
    throw error;
  }
}

export async function buyLive(ctx, loaded, id) {
  const item = liveShelf(ctx.now).find((it) => it.id === id) ?? fail('NOT_IN_SHOP');
  const bought = clone(loaded.state.liveBought ?? {});
  const mine = Number(bought[id]) || 0;
  if (mine >= item.perPlayer) fail('SOLD_OUT');
  if (!(item.stock > 0)) fail('SOLD_OUT');
  let took = false;
  if (item.limit != null) {
    if (typeof ctx.store.stockTake !== 'function') fail('SOLD_OUT');
    await ctx.store.stockTake(id);
    took = true;
  }
  bought[id] = mine + 1;
  try {
    return await commit(ctx, loaded, {
      coins: -item.price,
      inventory: [invOp(item.spec, 1)],
      state: { liveBought: bought },
      kind: 'buy', reason: 'live', detail: { id, price: item.price }
    }, { extra: { specs: [item.spec], price: item.price } });
  } catch (error) {
    if (took) await ctx.store.stockGive?.(id).catch(() => {});
    throw error;
  }
}

export async function eventGift(ctx, { id }) {
  const loaded = await ctx.store.load();
  const event = activeEvents('free_packs', ctx.now).find((e) => e.id === String(id ?? '')) ?? fail('NOT_ACTIVE');
  const claimed = clone(loaded.state.eventsClaimed ?? {});
  if (claimed[event.id]) fail('ALREADY_CLAIMED');
  claimed[event.id] = 1;
  const gift = eventGiftOf(event);
  if (!gift.spec && !gift.timed) fail('NOT_ACTIVE');
  const state = { eventsClaimed: claimed };
  if (gift.timed) {
    const timed = accrue(clone(loaded.state.timed) ?? emptyTimed(), ctx.now);
    timed.count = (Number(timed.count) || 0) + gift.timed;
    state.timed = timed;
  }
  return commit(ctx, loaded, {
    inventory: gift.spec ? [invOp(gift.spec, gift.count)] : [],
    state,
    claims: [`event:${event.id}`],
    kind: 'event', reason: 'event gift', detail: { id: event.id }
  }, { extra: { gift } });
}

export async function withOverrides(ctx, articles, redraw) {
  if (typeof ctx.store.overrides !== 'function' || !articles.length || liveNow().raw.overrides === 0) return articles;
  const look = async (list) => {
    const rows = await ctx.store.overrides(list.map((a) => a.key).filter(Boolean)).catch(() => []);
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.article_key, row]));
  };
  let over = await look(articles);
  if (!over.size) return articles;
  let kept = articles.filter((a) => !over.get(a.key)?.hidden);
  if (kept.length < articles.length && redraw) {
    const more = await redraw().catch(() => []);
    if (Array.isArray(more) && more.length) {
      const extra = await look(more);
      for (const [k, v] of extra) over.set(k, v);
      const seen = new Set(kept.map((a) => a.key));
      for (const a of more) {
        if (kept.length >= articles.length) break;
        if (!seen.has(a.key) && !over.get(a.key)?.hidden) { kept.push(a); seen.add(a.key); }
      }
    }
  }
  if (!kept.length) return articles.filter((a) => !over.get(a.key)?.hidden);
  return kept.map((a) => {
    const row = over.get(a.key);
    if (!row) return a;
    const out = { ...a };
    if (row.title_override) out.title = String(row.title_override);
    if (row.description_override) out.description = String(row.description_override);
    if (row.image_url) out.thumbnail = String(row.image_url);
    if (RARITIES.some((r) => r.id === row.rarity_override)) out.rarityId = row.rarity_override;
    if (row.price_override != null && Number(row.price_override) >= 0) out.livePrice = Math.round(Number(row.price_override));
    return out;
  });
}
