import { AsyncLocalStorage } from 'node:async_hooks';
import { CORS, json, callerId, tokenCaller, admin, projectUrl, serviceKey } from '../_shared/caller.ts';
import { writeQuiz } from '../_shared/quizgen.ts';
import { runAsked, EconError, androidRequest, deltaReply, firstLoad, drawArticles, drawArticlesMany, fetchAlbumTotal, fetchArticleText, findPictures, findWikis, inspectWiki, setRequestHeaders, titleCards, useCustomPool, useFinderCache, useAdultWikis, useLanguageSource, useLiveSource, usePictureCache, useArticlePool, warmCustomPool } from './engine.js';

const runWith = runAsked as (ctx: unknown, action: string, args: unknown, options: { ready: unknown }) => Promise<any>;
const language = new AsyncLocalStorage<string>();
useLanguageSource(() => language.getStore() ?? null);
const liveBox = new AsyncLocalStorage<{ conf: unknown }>();
let lastLive: unknown = null;
let liveAt = 0;
const LIVE_FRESH_MS = 20000;
let liveLoad = true;
useLiveSource(() => liveBox.getStore()?.conf ?? lastLive);
setRequestHeaders({ 'User-Agent': 'Wikster/1.0 (https://wikster.pages.dev; quart.gabriel.pro@gmail.com)' });

const LANGS = ['en', 'fr'];
const DRAW_ACTIONS = new Set(['ready', 'prepare', 'prepareMany', 'open']);

function later(work: Promise<unknown>) {
  const quiet = work.catch((error) => console.warn('economy background', error));
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(quiet);
}

useCustomPool({
  async take(source: string, n: number) {
    const got = await rpc('pool_take', { p_source: source, p_n: n });
    return { cards: Array.isArray(got?.cards) ? got.cards : [], left: Number(got?.left) || 0 };
  },
  async put(source: string, cards: unknown[]) {
    await rpc('pool_put', { p_source: source, p_cards: cards });
  },
  later
});
useFinderCache({
  find: {
    get: (key: string) => rpc('wiki_find_get', { p_key: key }),
    put: (key: string, result: unknown) => rpc('wiki_find_put', { p_key: key, p_result: result })
  },
  site: {
    get: (api: string) => rpc('wiki_site_get', { p_api: api }),
    put: (api: string, info: unknown) => rpc('wiki_site_put', { p_api: api, p_info: info })
  }
});
useArticlePool({
  draw: (pool: string, n: number, opts: { low: number; stale: number; kind: string; user?: string | null; rotate?: boolean }) =>
    rpc('wiki_pool_draw', { p_pool: pool, p_n: n, p_low: opts.low, p_stale: opts.stale, p_kind: opts.kind, p_user: opts.user ?? null, p_rotate: Boolean(opts.rotate) }),
  fill: (pool: string, kind: string, cards: unknown[], max: number) =>
    rpc('wiki_pool_fill', { p_pool: pool, p_kind: kind, p_cards: cards, p_max: max }),
  fail: (pool: string) => rpc('wiki_pool_fail', { p_pool: pool }),
  release: (pool: string) => rpc('wiki_pool_release', { p_pool: pool }),
  later
});
usePictureCache({
  get: (keys: string[]) => rpc('pictures_get', { p_keys: keys }),
  put: (rows: unknown[]) => rpc('pictures_put', { p_rows: rows })
});
const ADULT_LIST_MS = 10 * 60 * 1000;
let adultList: { at: number; list: unknown[] } = { at: 0, list: [] };
useAdultWikis(async () => {
  if (Date.now() - adultList.at < ADULT_LIST_MS) return adultList.list;
  try {
    adultList = { at: Date.now(), list: await rows('adult_wikis?select=api,names&order=api') };
  } catch {
    adultList = { at: Date.now() - ADULT_LIST_MS + 60000, list: adultList.list };
  }
  return adultList.list;
});
const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
const CARD_COLS = 'select=article_key,title,rarity_id,price,copies,lang,pack_id,data,favorite';
let cardCols = `${CARD_COLS},prints`;

async function cardRows(read: (cols: string) => Promise<any[]>) {
  try {
    return await read(cardCols);
  } catch (error) {
    if (cardCols === CARD_COLS || !/prints/.test(String((error as Error)?.message ?? ''))) throw error;
    cardCols = CARD_COLS;
    return await read(cardCols);
  }
}

async function rows(path: string): Promise<any[]> {
  const res = await admin(path);
  if (!res.ok) throw new Error(`read ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function allRows(path: string): Promise<any[]> {
  const out: any[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const res = await admin(path, { headers: { Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' } });
    if (!res.ok) throw new Error(`read ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < page) return out;
  }
}

const inList = (keys: string[]) =>
  encodeURIComponent(`(${keys.map((k) => `"${String(k).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`);

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await admin(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String(body?.message ?? `${name} ${res.status}`));
  }
  return await res.json();
}

const tally = new Map<string, { w: number; n: number }>();

function counted(key: string, weight = 1) {
  const w = Math.floor(Date.now() / 60000);
  const held = tally.get(key);
  const n = (held && held.w === w ? held.n : 0) + weight;
  tally.set(key, { w, n });
  if (tally.size > 20000) for (const [k, v] of tally) if (v.w !== w) tally.delete(k);
  return n;
}

async function throttle(userId: string, bucket: string, max: number) {
  if (counted(`${userId}|${bucket}`) <= Math.floor(max / 3)) return;
  try {
    await rpc('rate_limit', { p_user: userId, p_bucket: bucket, p_max: max, p_seconds: 60 });
  } catch (error) {
    if ((error as Error)?.message === 'SLOW_DOWN') throw error;
  }
}

function quickLimit(userId: string, bucket: string, max: number) {
  if (counted(`${userId}|${bucket}`) > max) throw new Error('SLOW_DOWN');
}

function publicLive(conf: unknown) {
  const { overrides: _o, ...rest } = (conf ?? {}) as Record<string, unknown>;
  const packs = Array.isArray(rest.packs) ? rest.packs.map((p) => {
    const { source: _s, ...pack } = (p ?? {}) as Record<string, unknown>;
    return pack;
  }) : [];
  return { ...rest, packs };
}

const BROADCAST_MAX = 180000;

async function broadcast(topic: string, event: string, payload: unknown) {
  let body = JSON.stringify({ messages: [{ topic, event, payload, private: true }] });
  if (body.length > BROADCAST_MAX) {
    const p = payload as { pulls?: { nonce: string; id: string }[] };
    const slim = { ...(payload as Record<string, unknown>), pulls: (p?.pulls ?? []).map((x) => ({ nonce: x.nonce, id: x.id })), more: true };
    body = JSON.stringify({ messages: [{ topic, event, payload: slim, private: true }] });
    payload = slim;
  }
  try {
    const res = await fetch(`${projectUrl()}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json' },
      body
    });
    if (res.ok) return;
    console.warn('broadcast', res.status, await res.text().catch(() => ''));
  } catch (error) {
    console.warn('broadcast', error);
  }
  await rpc('live_send', { p_topic: topic, p_event: event, p_payload: payload });
}

async function authUser(userId: string): Promise<any | null> {
  const res = await fetch(`${projectUrl()}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}` }
  });
  if (!res.ok) return null;
  return await res.json();
}

async function bornAt(userId: string): Promise<number | null> {
  const user = await authUser(userId);
  const at = Date.parse(user?.created_at ?? '');
  return Number.isFinite(at) ? at : null;
}

function storeFor(userId: string, box: { conf: unknown; reuse?: boolean } = { conf: null }) {
  const me = eq(userId);
  let memo: any = null;
  let legacy = false;
  let bucketed = false;
  let weight = 1;
  let plan: { keys: string[]; pull: string | null; since: number | null } = { keys: [], pull: null, since: null };
  let pulled: { nonce: string; row: any } | null = null;
  let changed: { at: number; rows: any[]; gone: string[] } | null = null;
  let totals: { cards: number; unique: number } | null = null;
  const fresh = new Map<string, any>();
  const totalsOf = (v: any) => (v && Number.isFinite(Number(v.cards)) && Number.isFinite(Number(v.unique)) ? { cards: Number(v.cards), unique: Number(v.unique) } : null);
  const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v ?? ''));
  const shaped = (row: any) => ({
    wallet: { coins: Number(row?.wallet?.coins ?? 0), ink: Number(row?.wallet?.ink ?? 0) },
    state: row?.state ?? {},
    inventory: row?.inventory ?? {},
    custom: Array.isArray(row?.custom) ? row.custom : [],
    born: Number.isFinite(Number(row?.born)) && row?.born != null ? Number(row.born) : null,
    cutover: Number.isFinite(Number(row?.cutover)) && row?.cutover != null ? Number(row.cutover) : null
  });
  async function legacyLoad() {
    const [wallets, econ, inventory, custom, migration, born] = await Promise.all([
      rows(`wallets?user_id=${me}&select=coins,ink`),
      rows(`econ?user_id=${me}&select=state`),
      rows(`inventory?user_id=${me}&select=spec_id,spec,count`),
      rows(`custom_packs?user_id=${me}&select=def&order=created_at.asc`),
      rows(`migration?select=cutover_at`),
      bornAt(userId)
    ]);
    const cut = Date.parse(migration[0]?.cutover_at ?? '');
    return {
      wallet: { coins: Number(wallets[0]?.coins ?? 0), ink: Number(wallets[0]?.ink ?? 0) },
      state: econ[0]?.state ?? {},
      inventory: Object.fromEntries(inventory.map((r) => [r.spec_id, { spec: r.spec, count: r.count }])),
      custom,
      born,
      cutover: Number.isFinite(cut) ? cut : null
    };
  }
  const copy = (v: any) => JSON.parse(JSON.stringify(v));
  let meta: Promise<Record<string, unknown>> | null = null;
  return {
    account() {
      meta ??= authUser(userId).then((user) => (user?.user_metadata ?? {}) as Record<string, unknown>).catch(() => ({}));
      return meta;
    },
    prefetch(ask: { keys?: string[]; pull?: string; since?: number }) {
      if (memo) return;
      for (const k of ask.keys ?? []) if (typeof k === 'string' && k && plan.keys.length < 80) plan.keys.push(k);
      if (isUuid(ask.pull)) plan.pull = String(ask.pull);
      if (Number.isFinite(ask.since)) plan.since = Number(ask.since);
    },
    weigh(n: number) {
      weight = Math.max(1, Math.min(50, Math.floor(Number(n) || 1)));
    },
    async load() {
      if (memo) return copy(memo);
      const ask = plan;
      plan = { keys: [], pull: null, since: null };
      if (!legacy) {
        try {
          const args: Record<string, unknown> = { p_user: userId, p_keys: ask.keys.length ? ask.keys : null };
          if (ask.pull) args.p_pull = ask.pull;
          if (ask.since != null) args.p_since = new Date(ask.since).toISOString();
          if (!bucketed) {
            bucketed = true;
            if (counted(`${userId}|economy`, weight) > 50) { args.p_bucket = 'economy'; args.p_max = 150; args.p_weight = weight; }
          }
          let row: any;
          const liveFresh = Boolean(box.reuse) && lastLive != null && Date.now() - liveAt < LIVE_FRESH_MS;
          if (liveFresh) box.conf = lastLive;
          if (liveLoad && !liveFresh) {
            try {
              row = await rpc('econ_load_live', args);
            } catch (error) {
              if (!/econ_load_live|PGRST202|Could not find/.test(String((error as Error)?.message ?? ''))) throw error;
              liveLoad = false;
            }
          }
          if (!liveLoad || liveFresh) row = await rpc('econ_load', args);
          if (row?.live && typeof row.live === 'object') { box.conf = row.live; lastLive = row.live; liveAt = Date.now(); }
          memo = shaped(row);
          totals = totalsOf(row?.totals);
          if (Array.isArray(row?.keys)) {
            fresh.clear();
            for (const k of row.keys) fresh.set(k, null);
            for (const r of Array.isArray(row.cards) ? row.cards : []) fresh.set(r.article_key, r);
          }
          if (ask.pull && row && 'pull' in row) pulled = { nonce: ask.pull, row: row.pull };
          if (ask.since != null && row?.since) {
            changed = { at: ask.since, rows: Array.isArray(row.since.cards) ? row.since.cards : [], gone: Array.isArray(row.since.gone) ? row.since.gone : [] };
          }
          return copy(memo);
        } catch (error) {
          if ((error as Error)?.message === 'SLOW_DOWN') throw error;
          legacy = true;
        }
      }
      memo = await legacyLoad();
      totals = null;
      return copy(memo);
    },
    totals() {
      return totals;
    },
    async cards(keys: string[] | null) {
      if (keys != null && keys.length && keys.every((k) => fresh.has(k))) return keys.map((k) => fresh.get(k)).filter(Boolean);
      if (keys == null) return cardRows((cols) => allRows(`cards?user_id=${me}&${cols}&order=article_key.asc`));
      return cardRows(async (cols) => {
        const out: any[] = [];
        for (let i = 0; i < keys.length; i += 80) {
          const chunk = keys.slice(i, i + 80);
          if (chunk.length) out.push(...await rows(`cards?user_id=${me}&article_key=in.${inList(chunk)}&${cols}`));
        }
        return out;
      });
    },
    async plateCards() {
      const filter = encodeURIComponent('(data->>thumbnail.is.null,data->>thumbnail.like.data:image*)');
      const checked = encodeURIComponent('(data->>pictureCheck.is.null,data->>pictureCheck.neq.2)');
      return cardRows((cols) => rows(`cards?user_id=${me}&or=${filter}&and=(or${checked})&${cols}&limit=120`));
    },
    async specialCards() {
      return cardRows((cols) => allRows(`cards?user_id=${me}&article_key=like.${encodeURIComponent('special:*')}&${cols}`));
    },
    async cardsMoved(renamed: Record<string, string>, fixed: Record<string, any>) {
      for (const [from, to] of Object.entries(renamed)) {
        const res = await admin(`showcase_kudos?owner=${me}&key=${eq(from)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key: to })
        });
        if (!res.ok) console.warn('kudos rekey', res.status, await res.text().catch(() => ''));
      }
      const found = await rows(`profiles?id=${me}&select=showcase`);
      const pins = Array.isArray(found[0]?.showcase) ? found[0].showcase : [];
      let moved = false;
      const next = pins.map((pin: any) => {
        const key = renamed[pin?.key] ?? pin?.key;
        const entry = key ? fixed[key] : null;
        if (!entry) return pin;
        moved = true;
        return { ...pin, ...entry, key };
      });
      if (!moved) return;
      const res = await admin(`profiles?id=${me}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ showcase: next })
      });
      if (!res.ok) console.warn('showcase fix', res.status, await res.text().catch(() => ''));
    },
    async cardsSince(at: number) {
      if (changed && changed.at === at) return { rows: changed.rows, gone: changed.gone };
      try {
        const iso = encodeURIComponent(new Date(at).toISOString());
        const [list, gone] = await Promise.all([
          cardRows((cols) => allRows(`cards?user_id=${me}&last_at=gt.${iso}&${cols}`)),
          rows(`cards_gone?user_id=${me}&at=gt.${iso}&select=article_key`)
        ]);
        const back = new Set(list.map((r) => r.article_key));
        return { rows: list, gone: gone.map((r) => String(r.article_key)).filter((k) => !back.has(k)) };
      } catch {
        return null;
      }
    },
    async apply(ops: any) {
      fresh.clear();
      pulled = null;
      if (ops?.add?.length || ops?.remove?.length || ops?.patch?.length) changed = null;
      let done: any;
      try {
        done = await rpc('econ_apply', { p_user: userId, p_ops: ops });
      } catch (error) {
        memo = null;
        totals = null;
        throw error;
      }
      totals = totalsOf(done?.totals);
      if (done?.fresh && memo) {
        memo = { ...memo, wallet: { coins: Number(done.coins ?? 0), ink: Number(done.ink ?? 0) }, state: done.fresh.state ?? {}, inventory: done.fresh.inventory ?? {} };
        const asked = Array.isArray(ops?.keys) ? ops.keys : [];
        for (const k of asked) fresh.set(k, null);
        for (const row of done.fresh.cards ?? []) fresh.set(row.article_key, row);
      } else {
        memo = null;
      }
      return done;
    },
    facts(kind: string, args: Record<string, unknown> = {}) {
      return rpc('econ_facts', { p_user: userId, p_kind: kind, p_args: args });
    },
    p2p(fn: string, args: Record<string, unknown>) {
      memo = null;
      pulled = null;
      changed = null;
      fresh.clear();
      return rpc(`econ_${fn}`, { p_user: userId, ...args });
    },
    async wipe(scope: string, claim: string | null = null, coins = 0) {
      memo = null;
      pulled = null;
      changed = null;
      fresh.clear();
      const args = { p_user: userId, p_scope: scope, p_claim: claim, p_coins: coins };
      try {
        return await rpc('econ_erase', args);
      } catch (error) {
        if (!/econ_erase|PGRST202|schema cache/.test(String((error as Error)?.message ?? ''))) throw error;
      }
      await rpc('econ_wipe', args);
      return null;
    },
    async waiting(specId: string, skip: string[] = []) {
      const spent = skip.filter(isUuid);
      const not = spent.length ? `&nonce=not.in.(${spent.join(',')})` : '';
      const found = await rows(`pulls?user_id=${me}&spec_id=${eq(specId)}&claimed_at=is.null${not}&select=nonce,cards&order=at.asc,nonce.asc&limit=1`);
      return found[0] ?? null;
    },
    async firstWaiting(specId: string) {
      if (pulled?.row && pulled.row.spec_id === specId && !pulled.row.claimed) return pulled.row.first ?? null;
      const found = await rows(`pulls?user_id=${me}&spec_id=${eq(specId)}&claimed_at=is.null&select=nonce&order=at.asc,nonce.asc&limit=1`);
      return found[0]?.nonce ?? null;
    },
    async waitingList() {
      const found = await rows(`pulls?user_id=${me}&claimed_at=is.null&select=nonce,spec_id&order=at.asc,nonce.asc`);
      return found.map((r) => ({ nonce: r.nonce, specId: r.spec_id }));
    },
    async pullCards(nonces: string[]) {
      const out: any[] = [];
      for (let i = 0; i < nonces.length; i += 40) {
        const chunk = nonces.slice(i, i + 40).filter((n) => /^[0-9a-f-]{36}$/i.test(String(n)));
        if (chunk.length) out.push(...await rows(`pulls?user_id=${me}&nonce=in.(${chunk.join(',')})&select=nonce,cards`));
      }
      return out;
    },
    async stash({ specId, spec, cards, nonce }: { specId: string; spec: unknown; cards: unknown; nonce?: string }) {
      if (nonce && pulled?.nonce === nonce) pulled = null;
      const res = await admin('pulls', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, spec_id: specId, spec, cards, ...(nonce && isUuid(nonce) ? { nonce } : {}) })
      });
      if (res.status === 409) {
        if (!nonce || !isUuid(nonce)) return null;
        const held = await rows(`pulls?nonce=${eq(nonce)}&user_id=${me}&select=nonce`);
        return held[0]?.nonce ?? null;
      }
      if (!res.ok) throw new Error(`stash ${res.status} ${await res.text()}`);
      const [row] = await res.json();
      return row?.nonce ?? null;
    },
    async stashMany(list: { specId: string; spec: unknown; cards: unknown }[]) {
      const body = list.map((row) => ({ nonce: crypto.randomUUID(), user_id: userId, spec_id: row.specId, spec: row.spec, cards: row.cards }));
      const res = await admin('pulls', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`stash ${res.status} ${await res.text()}`);
      return body.map((row) => row.nonce);
    },
    async pullByNonce(nonce: string) {
      if (!isUuid(nonce)) return null;
      if (pulled && pulled.nonce === nonce) {
        const p = pulled.row;
        return p ? { nonce: p.nonce, specId: p.spec_id, spec: p.spec, cards: p.cards, claimed: Boolean(p.claimed) } : null;
      }
      const found = await rows(`pulls?nonce=${eq(nonce)}&user_id=${me}&select=nonce,spec_id,spec,cards,claimed_at`);
      const p = found[0];
      return p ? { nonce: p.nonce, specId: p.spec_id, spec: p.spec, cards: p.cards, claimed: Boolean(p.claimed_at) } : null;
    },
    async redeemCode(code: string) {
      return rpc('econ_code_take', { p_user: userId, p_code: code });
    },
    async codeDefs(ids: string[]) {
      const got = await rpc('econ_code_defs', { p_user: userId, p_ids: ids });
      return Array.isArray(got) ? got : [];
    },
    async redeemRelease(use: number) {
      if (use != null) await rpc('econ_code_release', { p_use: use });
    },
    async stockTake(item: string) {
      return rpc('econ_stock_take', { p_item: item });
    },
    async stockGive(item: string) {
      return rpc('econ_stock_give', { p_item: item });
    },
    async overrides(keys: string[]) {
      const list = keys.filter((k) => typeof k === 'string' && k).slice(0, 60);
      if (!list.length) return [];
      return rows(`card_overrides?article_key=in.${inList(list)}&select=article_key,title_override,description_override,image_url,rarity_override,price_override,hidden`);
    },
    async legacy() {
      const found = await rows(`saves?user_id=${me}&select=data`);
      return found[0]?.data ?? null;
    },
    async blockedHosts() {
      const found = await rows('blocked_hosts?select=host').catch(() => []);
      return found.map((r) => String(r.host));
    },
    async customPut(def: { id: string }) {
      memo = null;
      const res = await admin('custom_packs?on_conflict=user_id,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: userId, id: def.id, def })
      });
      if (!res.ok) {
        const text = await res.text();
        if (/NAME_REFUSED|FILTERED/.test(text)) throw new EconError('NAME_REFUSED');
        throw new Error(`custom ${res.status} ${text}`);
      }
    },
    async dropPulls(nonces: string[]) {
      const list = nonces.filter(isUuid).slice(0, 80);
      if (!list.length) return;
      const res = await admin(`pulls?user_id=${me}&claimed_at=is.null&nonce=in.(${list.join(',')})`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`pulls ${res.status} ${await res.text()}`);
    },
    async customDrop(id: string) {
      memo = null;
      const res = await admin(`custom_packs?user_id=${me}&id=${eq(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`custom ${res.status} ${await res.text()}`);
    }
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const who = tokenCaller(req) ?? await callerId(req);
  if (!who) return json({ error: 'SIGN_IN' }, 401);
  let body: { action?: string; args?: Record<string, unknown>; lang?: string; client?: string; ready?: Record<string, unknown>; sv?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'BAD_REQUEST' }, 400); }
  if (body.action === 'ping') return json({ ok: true });
  const lang = LANGS.includes(String(body.lang)) ? String(body.lang) : 'en';
  try {
    if (body.action === 'prepare' || body.action === 'prepareMany') await throttle(who, 'draw', 40);
    if (body.action === 'ready') quickLimit(who, 'ready', 30);
    if (body.action === 'wikiFind') await throttle(who, 'find', 30);
    const box = { conf: null as unknown, reuse: !['snapshot', 'import', 'sync', 'batch'].includes(String(body.action ?? '')) };
    const sv = typeof body.sv === 'string' ? body.sv.slice(0, 80) : null;
    const watched = sv != null ? firstLoad(storeFor(who, box)) : null;
    const ctx = {
      user: who,
      android: androidRequest(req.headers.get('user-agent') ?? '', String(body.client ?? '')),
      later,
      notify: (event: string, payload: unknown) => broadcast(`user:${who}`, event, payload),
      store: watched ? watched.store : storeFor(who, box),
      draw: (pack: unknown, options?: Record<string, unknown>) => drawArticles(pack, options),
      drawMany: (pack: unknown, n: number, options?: Record<string, unknown>) => drawArticlesMany(pack, n, options),
      titleCards: (wants: unknown[], pack: Record<string, unknown>) => titleCards(wants, pack),
      findPictures: (pages: unknown[], options: Record<string, unknown>) => findPictures(pages, options),
      warmCustom: (pack: unknown) => later(language.run(lang, () => warmCustomPool(pack))),
      articleText: (title: string) => fetchArticleText(title, { limit: 3500 }),
      findWiki: (q: string, options: Record<string, unknown> = {}) => findWikis(q, { lang, fandom: true, ...options }),
      inspectWiki: (apiUrl: string) => inspectWiki(apiUrl),
      albumTotal: (album: unknown) => fetchAlbumTotal(album),
      writeQuiz: async (ask: { title: string; text: string; rank: number; count: number }) => {
        const out = await writeQuiz({ ...ask, lang });
        if (!out.ok) throw new Error(out.error);
        return out.questions;
      }
    };
    const ready = body.ready && typeof body.ready === 'object' ? body.ready : null;
    const began = Date.now();
    const result = await liveBox.run(box, () => language.run(lang, () => runWith(ctx, String(body.action ?? ''), body.args ?? {}, { ready })));
    if (DRAW_ACTIONS.has(String(body.action))) console.info(`economy ${body.action} in ${Date.now() - began} ms`);
    if (body.action === 'import' && result?.launch && typeof result.launch === 'object' && box.conf) result.launch.live = publicLive(box.conf);
    const held = ctx.store.totals?.();
    if (held && result && typeof result === 'object' && !Array.isArray(result)) result.totals = held;
    return json(watched ? deltaReply(result, watched.first(), sv) : result);
  } catch (error) {
    if (error instanceof EconError) {
      const detail = (error as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail) console.warn('economy', body.action, error.code, detail);
      return json({ error: error.code, ...(typeof detail === 'string' && detail ? { detail: detail.slice(0, 160) } : {}) }, 400);
    }
    if ((error as Error)?.message === 'SLOW_DOWN') return json({ error: 'SLOW_DOWN' }, 429, { 'Retry-After': String(61 - new Date().getUTCSeconds()) });
    if (/PGRST20[25]|schema cache|does not exist/.test(String((error as Error)?.message ?? ''))) return json({ error: 'NOT_LIVE' }, 503);
    console.error('economy', body.action, error);
    return json({ error: 'FAILED' }, 500);
  }
});
