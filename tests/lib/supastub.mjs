import { guardRoutes } from './guard.mjs';
import { screenText } from '../../src/wordfilter.js';
import { rowToEntry } from '../../src/econ/cards.js';
import { deltaReply, firstLoad } from '../../src/econ/delta.js';
import { createMarket } from './marketstub.mjs';
import { cleanAppearance } from '../../src/appearance.js';
import { cleanFriendBadges } from '../../src/friendcodes.js';
import { dealQuests } from '../../src/data/quests.js';
import { utcDay, utcWeek } from '../../src/days.js';

export { dealQuests };

export const SUPA_URL = 'https://stub.supabase.co';
export const SUPA_KEY = 'stub-anon-key';

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns', 'stub-inner']);
const cmp = (value, op, raw) => {
  if (op === 'is') return raw === 'null' ? value == null : String(value) === raw;
  if (value == null) return false;
  const a = Date.parse(value), b = Date.parse(raw);
  const [x, y] = Number.isFinite(a) && Number.isFinite(b) && !/^-?\d+(\.\d+)?$/.test(raw) ? [a, b] : [String(value), raw];
  if (op === 'eq') return String(value) === raw;
  if (op === 'neq') return String(value) !== raw;
  if (op === 'lt') return x < y;
  if (op === 'lte') return x <= y;
  if (op === 'gt') return x > y;
  if (op === 'gte') return x >= y;
  return true;
};
export function filtered(list, params) {
  let out = list;
  for (const [key, val] of params.entries()) {
    if (RESERVED.has(key)) continue;
    const [op, ...rest] = val.split('.');
    out = out.filter((row) => cmp(row[key], op, rest.join('.')));
  }
  for (const group of params.getAll('or')) {
    const terms = group.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/);
    out = out.filter((row) => terms.some((term) => {
      const [col, op, ...rest] = term.split('.');
      return cmp(row[col], op, rest.join('.'));
    }));
  }
  return out;
}

export const newDatabase = () => ({
  users: new Map(),
  profiles: new Map(),
  saves: new Map(),
  savesHistory: [],
  saveKeys: [],
  saveMeta: new Map(),
  syncCalls: [],
  friendships: [],
  messages: [],
  deliveries: [],
  trades: [],
  auctions: [],
  codex: new Map(),
  wishlists: [],
  kudos: [],
  guilds: [],
  guildMembers: [],
  guildInvites: [],
  guildMessages: [],
  guildGoals: [],
  guildGoalClaims: [],
  guildBank: [],
  guildBankTakes: [],
  guildMatches: [],
  challenges: [],
  guildMatchClaims: [],
  announcements: [],
  suspensions: [],
  creators: new Set(),
  grants: [],
  blocks: [],
  reports: [],
  filterHits: [],
  goalKind: null,
  tokens: new Map(),
  seq: 0
});

export function liveStateOf(live) {
  const now = Date.now();
  const events = (live?.events ?? []).filter((e) => Date.parse(e.ends_at) > now && Date.parse(e.starts_at) <= now + 86400000)
    .map(({ id, name, kind, params, starts_at, ends_at }) => ({ id, name, kind, params, starts_at, ends_at }));
  const packs = (live?.packs ?? []).map(({ source, created_at, updated_at, ...rest }) => rest);
  return { tuning: live?.tuning ?? {}, events, packs, stock: live?.stock ?? {}, at: new Date(now).toISOString() };
}

export async function runEconomy(engine, econDb, ctx, body, notify = null) {
  const full = {
    later: (work) => { Promise.resolve(work).catch(() => {}); },
    notify: notify ? async (event, payload) => notify(ctx.user, event, payload) : null,
    ...ctx
  };
  const action = String(body.action ?? '');
  const ready = body.ready && typeof body.ready === 'object' ? body.ready : null;
  const watched = typeof body.sv === 'string' && full.store ? firstLoad(full.store) : null;
  if (watched) full.store = watched.store;
  const out = engine.runAsked ? await engine.runAsked(full, action, body.args ?? {}, { ready }) : await engine.run(full, action, body.args ?? {});
  if (action === 'import' && out?.launch && typeof out.launch === 'object') out.launch.live = liveStateOf(econDb.live);
  const held = ctx.user ? econDb.totals?.(ctx.user) : null;
  if (held && out && typeof out === 'object' && !Array.isArray(out)) out.totals = held;
  return watched ? deltaReply(out, watched.first(), body.sv) : out;
}

export function economyStub(engine, econDb, { draw: drawWith = null } = {}) {
  let lang = 'en';
  engine.useLanguageSource(() => lang);
  engine.useLiveSource?.(() => econDb.live);
  let n = 0;
  const draw = async (pack) => Array.from({ length: pack.cards ?? 5 }, (_, i) => {
    const k = ++n;
    return {
      key: `en:Server_card_${k}`, title: `Server card ${k}`, lang: 'en',
      description: 'A card drawn by the server', extract: 'A card the server drew for this test, with enough words to read.',
      thumbnail: `https://upload.wikimedia.org/hero-${k}.jpg`, url: `https://en.wikipedia.org/wiki/Server_card_${k}`,
      views: 1000 * (i + 1) + k, popularity: Math.min(0.95, 0.2 + i * 0.12)
    };
  });
  const writeQuiz = async ({ count }) => Array.from({ length: count }, (_, i) => ({ question: `Question ${i + 1}`, choices: ['a', 'b', 'c', 'd'], answer: i % 4 }));
  return {
    db: econDb,
    calls: [],
    bodies: [],
    who: [],
    async handle(userId, body, userAgent = '') {
      lang = body.lang === 'fr' ? 'fr' : 'en';
      this.calls.push(body.action);
      this.who.push({ user: userId, action: body.action });
      this.bodies.push(body);
      const android = String(userAgent).includes('WiksterAndroid') || body.client === 'android';
      const ctx = { user: userId, android, store: econDb.store(userId), draw: drawWith ?? draw, writeQuiz, articleText: async () => 'text' };
      return runEconomy(engine, econDb, ctx, body, this.notify);
    }
  };
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function recoveryLink(db, email, base, { via = 'hash', type = 'recovery' } = {}) {
  const user = db.users.get(email);
  if (!user) throw new Error(`no user ${email}`);
  db.seq += 1;
  if (via === 'otp') {
    const hash = `pkce_${db.seq}_${Math.random().toString(16).slice(2)}`;
    db.otps ??= new Map();
    db.otps.set(hash, { email, type, used: false });
    return `${base}?token_hash=${hash}&type=${type}`;
  }
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email, exp, aud: 'authenticated', role: 'authenticated', amr: [{ method: 'otp' }], n: db.seq })}.c2ln`;
  const refresh = `rec-${db.seq}`;
  db.tokens.set(access, user.id);
  db.refreshes ??= new Map();
  db.refreshes.set(refresh, user.id);
  return `${base}#access_token=${access}&expires_at=${exp}&expires_in=3600&refresh_token=${refresh}&token_type=bearer&type=${type}`;
}

export async function installSupabase(page, { log = null, db = newDatabase(), schema = 'v2', economy = null, quests = null } = {}) {
  guardRoutes(page);
  db.market ??= createMarket(db);
  if (economy?.db) { db.market.econ = economy.db; economy.db.market = db.market; }
  if (economy) economy.notify = (user, event, payload) => { db.liveSend?.(`user:${user}`, event, payload); };
  const uuid = () => `00000000-0000-4000-8000-${String(++db.seq).padStart(12, '0')}`;

  const note = (method, url) => { if (log && !String(url).includes('stub-inner=1')) log.push(`${method} ${url.replace(SUPA_URL, '')}`); };

  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range,x-supabase-api-version'
  };
  const preflight = (route) => route.fulfill({ status: 204, headers: CORS, body: '' });

  const json = (route, body, status = 200) => route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const fail = (route, message, status = 400, pgCode = null) =>
    json(route, { message, error: message, code: pgCode ?? status }, status);

  const V1_ABSENT_COLUMNS = ['avatar', 'presence', 'last_seen_at', 'visibility', 'appearance'];
  const V1_ABSENT_TABLES = ['messages', 'deliveries', 'trades', 'auctions', 'codex', 'wishlists'];
  const noColumn = (route, name) =>
    fail(route, `column profiles.${name} does not exist`, 400, '42703');
  const noTable = (route, name) =>
    fail(route, `relation "public.${name}" does not exist`, 400, '42P01');

  const rows = (route, list, status = 200) => {
    const accept = route.request().headers().accept ?? '';
    if (!accept.includes('vnd.pgrst.object+json')) return json(route, list, status);
    if (list.length === 1) return json(route, list[0], status);
    return json(route, {
      code: 'PGRST116',
      details: `Results contain ${list.length} rows, application/vnd.pgrst.object+json requires 1 row`,
      hint: null,
      message: 'JSON object requested, multiple (or no) rows returned'
    }, 406);
  };

  const session = (user) => {
    const token = `tok-${user.id}`;
    db.tokens.set(token, user.id);
    return {
      access_token: token, token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `ref-${user.id}`,
      user: {
        id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
        user_metadata: user.meta ?? {}, app_metadata: {}, created_at: new Date().toISOString()
      }
    };
  };

  const caller = (route) => {
    const auth = route.request().headers().authorization ?? '';
    return db.tokens.get(auth.replace(/^Bearer /, '')) ?? null;
  };

  const fileSave = (row, reason) => {
    let cards = null; let coins = null;
    try { cards = Object.keys(JSON.parse(row.data?.data?.['wikster.collection.v3'] ?? '{}').entries ?? {}).length; } catch {}
    try { coins = Number(row.data?.data?.['wikster.wallet.v1']); if (!Number.isFinite(coins)) coins = null; } catch {}
    db.savesHistory.push({ id: ++db.seq, user_id: row.user_id, at: new Date().toISOString(), reason, cards, coins, data: row.data });
  };

  const SYNC_KEYS = ['wikster.profile.v1', 'wikster.language', 'wikster.ripDirection', 'wikster.theme'];
  db.saveKeys ??= [];
  db.saveMeta ??= new Map();
  db.syncCalls ??= [];
  const econHeld = (id) => {
    const held = economy?.db?.users?.get(id);
    return held?.state?.imported ? held : null;
  };
  const blobKeys = (blob) => {
    if (!blob || !['wikster-save', 'wiklodo-save', 'packywiki-save'].includes(blob.format) || !blob.data || typeof blob.data !== 'object') return [];
    return SYNC_KEYS.flatMap((key) => {
      const legacy = `packywiki.${key.slice(8)}`;
      const value = typeof blob.data[key] === 'string' ? blob.data[key] : (typeof blob.data[legacy] === 'string' ? blob.data[legacy] : null);
      if (value == null || Buffer.byteLength(value) > 204800) return [];
      const given = Number(blob.stamps?.[key] ?? blob.stamps?.[legacy]);
      const stamp = Number.isFinite(given) && given > 0 ? Math.floor(given) : (Number(blob.at) > 0 ? Math.floor(Number(blob.at)) : 0);
      return [{ key, value, stamp }];
    });
  };
  const keyRow = (user, key) => db.saveKeys.find((r) => r.user_id === user && r.key === key);
  const keysFromOldSave = (user, blob) => {
    if (!db.saveMeta.has(user)) return;
    const at = new Date().toISOString();
    for (const b of blobKeys(blob)) {
      const row = keyRow(user, b.key);
      if (!row) db.saveKeys.push({ user_id: user, ...b, updated_at: at });
      else if (row.stamp < b.stamp) {
        if (row.value !== b.value) row.updated_at = at;
        row.value = b.value;
        row.stamp = b.stamp;
      }
    }
  };
  const newerBuild = (a, b) => Boolean(a?.sha) && a.sha !== b?.sha && Number(a.at ?? 0) > Number(b?.at ?? 0);
  const pruneHistory = (user) => {
    const mine = db.savesHistory.filter((h) => h.user_id === user).sort((x, y) => new Date(y.at) - new Date(x.at));
    const drop = new Set(mine.slice(40).map((h) => h.id));
    if (drop.size) db.savesHistory = db.savesHistory.filter((h) => !drop.has(h.id));
  };
  const syncMe = (me, body) => {
    db.syncCalls.push({ user: me, patch: body.p_patch ?? {}, since: body.p_since ?? null, stats: body.p_stats ?? null });
    const now = new Date();
    let meta = db.saveMeta.get(me);
    if (!meta) {
      if (!econHeld(me)) return { live: false };
      meta = { build: null, backupAt: 0 };
      db.saveMeta.set(me, meta);
      const blob = db.saves.get(me)?.data;
      for (const b of blobKeys(blob)) if (!keyRow(me, b.key)) db.saveKeys.push({ user_id: me, ...b, updated_at: now.toISOString() });
      if (blob?.build && typeof blob.build === 'object') meta.build = blob.build;
    }
    const prior = meta.build;
    const outdated = Boolean(body.p_build && typeof body.p_build === 'object') && newerBuild(prior, body.p_build);
    const written = [];
    const lost = [];
    const refused = [];
    const have = {};
    const patch = body.p_patch && typeof body.p_patch === 'object' ? body.p_patch : {};
    if (!outdated) {
      const mine = db.saveKeys.filter((r) => r.user_id === me);
      const due = !meta.backupAt || meta.backupAt < now.getTime() - 600000;
      const backup = due && mine.length && Object.entries(patch).some(([k, v]) => SYNC_KEYS.includes(k) && typeof v?.value === 'string')
        ? { format: 'wikster-save', version: 2, at: now.getTime(), build: meta.build,
            data: Object.fromEntries(mine.map((r) => [r.key, r.value])), stamps: Object.fromEntries(mine.map((r) => [r.key, r.stamp])) }
        : null;
      for (const [key, item] of Object.entries(patch)) {
        if (!SYNC_KEYS.includes(key) || !item || typeof item !== 'object') continue;
        if (typeof item.value !== 'string') {
          if (typeof item.have === 'number') have[key] = Math.floor(item.have);
          continue;
        }
        if (Buffer.byteLength(item.value) > 204800) { refused.push(key); continue; }
        const stamp = typeof item.stamp === 'number' ? Math.max(0, Math.floor(item.stamp)) : 0;
        if (meta.wipedAt && ['wikster.profile.v1', 'wikster.theme'].includes(key) && stamp <= meta.wipedAt) { written.push(key); continue; }
        const row = keyRow(me, key);
        if (!row) {
          db.saveKeys.push({ user_id: me, key, value: item.value, stamp, updated_at: now.toISOString() });
          written.push(key);
        } else if (row.stamp < stamp) {
          if (row.value !== item.value) {
            Object.assign(row, { value: item.value, stamp, updated_at: now.toISOString() });
            written.push(key);
          } else {
            row.stamp = stamp;
            have[key] = stamp;
          }
        } else if (row.value !== item.value) lost.push(key);
        else have[key] = row.stamp;
      }
      if (written.length) {
        if (backup) {
          db.savesHistory.push({ id: ++db.seq, user_id: me, at: now.toISOString(), reason: 'update',
            cards: db.profiles.get(me)?.unique_cards ?? null, coins: econHeld(me)?.wallet?.coins ?? null, data: backup });
          meta.backupAt = now.getTime();
          pruneHistory(me);
        }
        if (body.p_build?.sha && prior?.sha !== body.p_build.sha) {
          meta.build = body.p_build;
          const save = db.saves.get(me);
          if (save?.data) { save.data = { ...save.data, build: body.p_build }; save.updated_at = now.toISOString(); }
        }
      }
      const profile = db.profiles.get(me);
      const stats = body.p_stats && typeof body.p_stats === 'object' ? body.p_stats : {};
      if (profile) {
        const next = {};
        if (typeof stats.playMs === 'number') next.play_ms = Math.max(0, Math.floor(stats.playMs));
        if (typeof stats.rank === 'string') next.rank = stats.rank.slice(0, 60);
        if (stats.badges && typeof stats.badges === 'object' && !Array.isArray(stats.badges)) next.badges = cleanFriendBadges(stats.badges, econHeld(me)?.state ?? {});
        if (Array.isArray(stats.showcase)) next.showcase = stats.showcase.slice(0, 10);
        if (stats.summary && typeof stats.summary === 'object' && !Array.isArray(stats.summary) && JSON.stringify(stats.summary).length <= 6000) next.stats = stats.summary;
        const changed = Object.entries(next).some(([k, v]) => JSON.stringify(profile[k]) !== JSON.stringify(v));
        const stale = !profile.last_seen_at || Date.parse(profile.last_seen_at) < now.getTime() - 60000;
        if (changed || stale) {
          Object.assign(profile, next);
          if (stale) profile.last_seen_at = now.toISOString();
          db.profileWrites = (db.profileWrites ?? 0) + 1;
        }
      }
    }
    const since = body.p_since ? Date.parse(body.p_since) - 5000 : null;
    const rows = db.saveKeys
      .filter((r) => r.user_id === me && !written.includes(r.key) && (lost.includes(r.key)
        || ((since == null || Date.parse(r.updated_at) > since) && !(r.key in have && have[r.key] === r.stamp))))
      .map(({ key, value, stamp }) => ({ key, value, stamp }));
    return { live: true, outdated, now: now.toISOString(), build: prior ?? null, refused, rows };
  };

  const areFriends = (a, b) => db.friendships.some((f) =>
    f.status === 'accepted' &&
    ((f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a)));

  db.realtime ??= { sockets: new Set(), refs: 0 };
  const rt = db.realtime;
  const canSee = (user, table, row) => {
    if (!user || !row) return false;
    if (table === 'messages' || table === 'deliveries') return row.sender === user || row.recipient === user;
    if (table === 'friendships') return row.requester === user || row.addressee === user;
    if (table === 'trades') return row.proposer === user || row.recipient === user;
    if (table === 'guild_invites') return row.inviter === user || row.invitee === user;
    if (table === 'challenges') return row.challenger === user || row.opponent === user;
    if (table === 'guild_messages' || table === 'guild_bank' || table === 'guild_goals') {
      return db.guildMembers.some((m) => m.user_id === user && m.guild_id === row.guild_id);
    }
    return true;
  };
  const bindingMatches = (binding, table, type, row) => {
    if (binding.table !== table) return false;
    if (binding.event !== '*' && binding.event !== type) return false;
    const m = /^(\w+)=eq\.(.+)$/.exec(binding.filter ?? '');
    return !m || String(row?.[m[1]]) === m[2];
  };
  const push = (sock, msg) => { try { sock.ws.send(JSON.stringify(msg)); } catch {} };
  rt.denied ??= [];
  const guildOf = (user) => db.guildMembers.find((m) => m.user_id === user)?.guild_id ?? null;
  const mayJoin = (user, topic) => {
    if (!user) return false;
    if (topic === `user:${user}` || topic === `inbox:${user}` || topic === 'market' || topic === 'world') return true;
    const guild = guildOf(user);
    return Boolean(guild) && topic === `guild:${guild}`;
  };
  db.liveSend = (topic, event, payload) => {
    (db.liveLog ??= []).push({ topic, event, payload });
    for (const sock of rt.sockets) {
      const join = sock.joins.get(`realtime:${topic}`);
      if (!join?.private) continue;
      push(sock, [null, null, `realtime:${topic}`, 'broadcast', { type: 'broadcast', event, payload }]);
    }
  };
  db.noticeLive = (row, retired = false) => {
    const pay = { id: row.id, retired };
    if (row.target_user) db.liveSend(`user:${row.target_user}`, 'notice', pay);
    else if (row.target_guild) {
      db.liveSend(`guild:${row.target_guild}`, 'notice', pay);
      for (const m of db.guildMembers.filter((x) => x.guild_id === row.target_guild)) db.liveSend(`user:${m.user_id}`, 'notice', pay);
    } else db.liveSend('world', 'announcement', pay);
  };
  db.standingLive = (userId) => {
    const s = db.suspensions.find((x) => x.user_id === userId);
    const lapsed = s?.until && Date.parse(s.until) <= Date.now();
    db.liveSend(`user:${userId}`, 'standing', !s || lapsed ? { type: 'clear' }
      : { type: s.muted ? 'mute' : 'suspend', until: s.until ?? null, reason: s.reason ?? '' });
  };
  const liveRow = (table, type, record, old) => {
    const r = type === 'DELETE' ? old : record;
    if (!r) return;
    const both = (a, b, event, payload) => { db.liveSend(`user:${a}`, event, payload); db.liveSend(`user:${b}`, event, payload); };
    if (table === 'messages' && type === 'INSERT') db.liveSend(`user:${r.recipient}`, 'message', { type, row: r });
    if (table === 'messages' && type === 'UPDATE' && record?.read_at && !old?.read_at) {
      const receipt = { type, row: { id: r.id, sender: r.sender, recipient: r.recipient, read_at: r.read_at, created_at: r.created_at } };
      db.liveSend(`user:${r.sender}`, 'read', receipt);
      db.liveSend(`user:${r.recipient}`, 'seen', receipt);
    }
    if (table === 'deliveries' && type === 'INSERT') {
      const { title, amount, reason } = r.payload ?? {};
      db.liveSend(`user:${r.recipient}`, 'delivery', { type, row: { ...r, payload: JSON.parse(JSON.stringify({ title, amount, reason })) } });
    }
    if (table === 'friendships') both(r.requester, r.addressee, 'friendship', { type, row: r });
    if (table === 'trades') {
      const { offer, ask, ...rest } = r;
      both(r.proposer, r.recipient, 'trade', { type, row: rest });
    }
    if (table === 'challenges') {
      const { payload, reply, result, ...rest } = r;
      both(r.challenger, r.opponent, 'challenge', { type, row: { ...rest, result: result && typeof result === 'object' ? { winner: result.winner ?? null } : null } });
    }
    if (table === 'guild_invites' && type === 'INSERT') db.liveSend(`user:${r.invitee}`, 'guild-invite', { type, row: r });
    if (table === 'guild_messages' && type === 'INSERT') db.liveSend(`guild:${r.guild_id}`, 'message', { type, row: r });
    if (table === 'guild_bank') db.liveSend(`guild:${r.guild_id}`, 'bank', { type });
    if (table === 'guild_members') db.liveSend(`guild:${r.guild_id}`, 'member', { type });
    if (table === 'guild_goals') db.liveSend(`guild:${r.guild_id}`, 'goal', { type, row: r });
    if (table === 'auctions') db.liveSend('market', 'auction', type === 'DELETE' ? { type } : { type, row: r });
  };
  db.emitChange = (table, type, record, old = null, { quiet = false } = {}) => {
    if (!quiet) liveRow(table, type, record, old);
    const row = type === 'DELETE' ? old : record;
    for (const sock of rt.sockets) {
      for (const [topic, join] of sock.joins) {
        const ids = join.bindings.filter((b) => bindingMatches(b, table, type, row) && canSee(sock.user, table, row)).map((b) => b.id);
        if (!ids.length) continue;
        push(sock, [null, null, topic, 'postgres_changes', { ids, data: {
          type, schema: 'public', table, commit_timestamp: new Date().toISOString(), columns: [],
          record: type === 'DELETE' ? {} : record, old_record: old ?? {}, errors: null
        } }]);
      }
    }
  };
  const parcel = (sender, recipient, kind, payload) => {
    const row = { id: uuid(), sender, recipient, kind, payload, created_at: new Date().toISOString(), claimed_at: null };
    db.deliveries.push(row);
    db.emitChange('deliveries', 'INSERT', row);
    return row;
  };
  const guildLeave = (id) => {
    const gid = db.guildMembers.find((m) => m.user_id === id)?.guild_id;
    if (!gid) return null;
    db.guildMembers = db.guildMembers.filter((m) => m.user_id !== id);
    db.emitChange('guild_members', 'DELETE', null, { user_id: id, guild_id: gid });
    const left = db.guildMembers.filter((m) => m.guild_id === gid).sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)));
    const row = db.guilds.find((g) => g.id === gid);
    if (!left.length) {
      db.guilds = db.guilds.filter((g) => g.id !== gid);
      db.guildBank = db.guildBank.filter((b) => b.guild_id !== gid);
      db.guildInvites = db.guildInvites.filter((i) => i.guild_id !== gid);
      return { guild: gid, closed: true, heir: null };
    }
    let heir = null;
    if (row && row.owner === id) { heir = left[0].user_id; row.owner = heir; db.liveSend(`user:${heir}`, 'guild', { type: 'owner', guild: gid }); }
    if (row) row.members = left.length;
    return { guild: gid, closed: false, heir };
  };
  const marketPay = async (user, amount, detail) => {
    if (!user || !(amount > 0) || !economy) return;
    await economy.db.store(user).apply({ coins: amount, kind: 'market', reason: 'refund', detail });
  };
  const marketOut = async (id) => {
    const out = { lots: 0, bids: 0, trades_cancelled: 0, trades_declined: 0 };
    db.auctionBids ??= [];
    for (const a of db.auctions.filter((x) => x.seller === id && x.status === 'open')) {
      if (a.bidder && a.current_bid) {
        await marketPay(a.bidder, a.current_bid, { auction: a.id, pulled: true });
        db.liveSend(`user:${a.bidder}`, 'lot', { kind: 'refund', id: a.id, title: a.title ?? a.card?.title });
        db.liveSend(`user:${a.bidder}`, 'econ', { scope: 'wallet' });
      }
      Object.assign(a, { status: 'cancelled', outcome: 'pulled', settled_at: new Date().toISOString() });
      out.lots++;
      db.liveSend('market', 'auction', { type: 'UPDATE', row: { ...a } });
    }
    const bidOn = new Set([...db.auctionBids.filter((b) => b.bidder === id).map((b) => b.auction),
      ...db.auctions.filter((a) => a.bidder === id).map((a) => a.id)]);
    for (const a of db.auctions.filter((x) => bidOn.has(x.id) && x.status === 'open')) {
      db.auctionBids = db.auctionBids.filter((b) => !(b.auction === a.id && b.bidder === id));
      const left = db.auctionBids.filter((b) => b.auction === a.id).length;
      if (a.bidder === id) {
        await marketPay(id, a.current_bid, { auction: a.id, withdrawn: true });
        Object.assign(a, { bidder: null, bidder_name: null, current_bid: null });
      }
      a.bid_count = left;
      out.bids++;
      db.liveSend('market', 'auction', { type: 'UPDATE', row: { ...a } });
    }
    for (const tr of db.trades.filter((x) => x.status === 'pending' && (x.proposer === id || x.recipient === id))) {
      if (tr.recipient === id && economy) {
        await economy.db.store(tr.proposer).apply({ add: (tr.offer ?? []).map((c) => ({ key: c.key, title: c.title ?? c.key, rarityId: c.rarityId ?? 'common', price: c.price ?? 0 })) });
        out.trades_declined++;
      } else out.trades_cancelled++;
      tr.status = tr.proposer === id ? 'cancelled' : 'declined';
      tr.resolved_at = new Date().toISOString();
      db.emitChange('trades', 'UPDATE', { ...tr });
    }
    return out;
  };
  const tellChats = (id) => {
    const by = new Map();
    for (const m of db.messages) {
      if (m.sender !== id && m.recipient !== id) continue;
      const other = m.sender === id ? m.recipient : m.sender;
      by.set(other, [...(by.get(other) ?? []), m.id]);
    }
    for (const [other, ids] of by) db.liveSend(`user:${other}`, 'removed', { table: 'messages', ids });
  };
  db.erased ??= [];
  const eraseInStub = async (id, scope, at) => {
    const market = await marketOut(id);
    const guild = scope === 'all' ? guildLeave(id) : null;
    const gifts = db.deliveries.filter((d) => d.recipient === id && !d.claimed_at).length;
    db.deliveries = db.deliveries.filter((d) => !(d.recipient === id && !d.claimed_at));
    if (scope === 'all') {
      tellChats(id);
      db.messages = db.messages.filter((m) => m.sender !== id && m.recipient !== id);
      for (const f of db.friendships.filter((x) => x.requester === id || x.addressee === id)) db.emitChange('friendships', 'DELETE', null, f);
      db.friendships = db.friendships.filter((x) => x.requester !== id && x.addressee !== id);
      db.challenges = db.challenges.filter((c) => c.challenger !== id && c.opponent !== id);
      db.kudos = db.kudos.filter((k) => k.owner !== id && k.sender !== id);
      db.wishlists = db.wishlists.filter((w) => w.owner !== id);
      db.guildInvites = db.guildInvites.filter((i) => i.inviter !== id && i.invitee !== id);
      db.guildMessages = db.guildMessages.filter((m) => m.sender !== id);
      db.saves.delete(id);
      db.savesHistory = db.savesHistory.filter((h) => h.user_id !== id);
      db.saveKeys = db.saveKeys.filter((r) => !(r.user_id === id && ['wikster.profile.v1', 'wikster.theme'].includes(r.key)));
      const meta = db.saveMeta.get(id) ?? { build: null, backupAt: 0 };
      meta.wipedAt = at;
      meta.backupAt = 0;
      db.saveMeta.set(id, meta);
      const p = db.profiles.get(id);
      if (p) Object.assign(p, { level: 1, rank: null, play_ms: 0, badges: [], showcase: [], avatar: null, cards: 0, unique_cards: 0, collection_value: 0, boosters_opened: 0, best_rarity: null });
    } else {
      const row = keyRow(id, 'wikster.theme');
      if (row) Object.assign(row, { value: 'aurora', stamp: Math.max(row.stamp + 1, at), updated_at: new Date().toISOString() });
      else db.saveKeys.push({ user_id: id, key: 'wikster.theme', value: 'aurora', stamp: at, updated_at: new Date().toISOString() });
    }
    db.liveSend(`user:${id}`, 'wiped', { scope, at });
    db.erased.push({ user: id, scope, at });
    return { market, guild, gifts };
  };
  if (economy) economy.db.onErase = eraseInStub;
  db.deleteAccount = async (id) => {
    const market = await marketOut(id);
    const guild = guildLeave(id);
    for (const d of db.deliveries) if (d.sender === id && d.recipient !== id && !d.claimed_at) d.sender = d.recipient;
    for (const b of db.guildBank) if (b.donor === id) b.donor = null;
    tellChats(id);
    db.liveSend(`user:${id}`, 'gone', { at: Date.now() });
    for (const [email, u] of db.users) if (u.id === id) db.users.delete(email);
    for (const [token, who] of db.tokens) if (who === id) db.tokens.delete(token);
    db.profiles.delete(id);
    db.saves.delete(id);
    db.saveMeta.delete(id);
    db.saveKeys = db.saveKeys.filter((r) => r.user_id !== id);
    db.savesHistory = db.savesHistory.filter((h) => h.user_id !== id);
    db.messages = db.messages.filter((m) => m.sender !== id && m.recipient !== id);
    for (const f of db.friendships.filter((x) => x.requester === id || x.addressee === id)) db.emitChange('friendships', 'DELETE', null, f);
    db.friendships = db.friendships.filter((x) => x.requester !== id && x.addressee !== id);
    db.deliveries = db.deliveries.filter((d) => d.sender !== id && d.recipient !== id);
    for (const tr of db.trades.filter((x) => x.proposer === id || x.recipient === id)) db.emitChange('trades', 'DELETE', null, tr);
    db.trades = db.trades.filter((x) => x.proposer !== id && x.recipient !== id);
    db.auctions = db.auctions.filter((a) => a.seller !== id);
    db.challenges = db.challenges.filter((c) => c.challenger !== id && c.opponent !== id);
    db.wishlists = db.wishlists.filter((w) => w.owner !== id);
    db.kudos = db.kudos.filter((k) => k.owner !== id && k.sender !== id);
    db.grants = db.grants.filter((g) => g.user_id !== id);
    if (economy) {
      economy.db.users.delete(id);
      for (const [nonce, pull] of economy.db.pulls) if (pull.user === id) economy.db.pulls.delete(nonce);
    }
    (db.deletedAccounts ??= []).push(id);
    return { ok: true, market, guild };
  };
  const presenceState = (topic) => {
    const state = {};
    for (const sock of rt.sockets) {
      const join = sock.joins.get(topic);
      if (join?.tracked) (state[join.presenceKey] ??= { metas: [] }).metas.push({ phx_ref: join.tracked.ref, ...join.tracked.meta });
    }
    return state;
  };
  const presenceDiff = (topic, joins, leaves) => {
    for (const sock of rt.sockets) if (sock.joins.has(topic)) push(sock, [null, null, topic, 'presence_diff', { joins, leaves }]);
  };
  const untrack = (sock, topic) => {
    const join = sock.joins.get(topic);
    if (!join?.tracked) return;
    const was = join.tracked;
    join.tracked = null;
    presenceDiff(topic, {}, { [join.presenceKey]: { metas: [{ phx_ref: was.ref, ...was.meta }] } });
  };
  const leaveTopic = (sock, topic) => { untrack(sock, topic); sock.joins.delete(topic); };
  const decodeBinaryPush = (buf) => {
    if (buf[0] !== 3) return null;
    const lens = [buf[1], buf[2], buf[3], buf[4], buf[5]];
    const encoding = buf[6];
    let at = 7;
    const take = (n) => { const out = buf.subarray(at, at + n).toString('utf8'); at += n; return out; };
    const [joinRef, ref, topic, event, meta] = lens.map(take);
    const rest = buf.subarray(at);
    const payload = encoding === 1 ? JSON.parse(rest.toString('utf8') || 'null') : rest;
    return { joinRef, ref, topic, event, meta: meta ? JSON.parse(meta) : null, payload };
  };
  const onSocketMessage = (sock, raw) => {
    if (typeof raw !== 'string') {
      const msg = decodeBinaryPush(Buffer.from(raw));
      if (!msg) return;
      for (const other of rt.sockets) {
        if (other === sock || !other.joins.has(msg.topic)) continue;
        push(other, [null, null, msg.topic, 'broadcast', { type: 'broadcast', event: msg.event, payload: msg.payload }]);
      }
      push(sock, [msg.joinRef || null, msg.ref || null, msg.topic, 'phx_reply', { status: 'ok', response: {} }]);
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    const [joinRef, ref, topic, event, payload] = parsed;
    const reply = (response = {}) => push(sock, [joinRef ?? null, ref ?? null, topic, 'phx_reply', { status: 'ok', response }]);
    if (topic === 'phoenix' && event === 'heartbeat') return reply();
    if (event === 'phx_join') {
      const token = payload?.access_token;
      if (token) sock.user = db.tokens.get(token) ?? sock.user;
      const isPrivate = Boolean(payload?.config?.private);
      if (isPrivate && !mayJoin(sock.user, topic.replace(/^realtime:/, ''))) {
        rt.denied.push({ user: sock.user, topic });
        push(sock, [joinRef ?? null, ref ?? null, topic, 'phx_reply', { status: 'error', response: { reason: `Unauthorized: You do not have permissions to read from this Channel topic: ${topic}` } }]);
        return;
      }
      const bindings = (payload?.config?.postgres_changes ?? []).map((b) => ({ ...b, id: ++rt.refs }));
      sock.joins.set(topic, { joinRef, bindings, private: isPrivate, presenceKey: payload?.config?.presence?.key ?? String(++rt.refs), tracked: null });
      reply({ postgres_changes: bindings.map((b) => ({ id: b.id, event: b.event, schema: b.schema, table: b.table, filter: b.filter })) });
      if (payload?.config?.presence?.enabled) push(sock, [null, null, topic, 'presence_state', presenceState(topic)]);
      return;
    }
    if (event === 'phx_leave') { leaveTopic(sock, topic); return reply(); }
    if (event === 'access_token') { if (payload?.access_token) sock.user = db.tokens.get(payload.access_token) ?? sock.user; return reply(); }
    if (event === 'presence') {
      const join = sock.joins.get(topic);
      if (!join) return reply();
      if (payload?.event === 'track') {
        untrack(sock, topic);
        join.tracked = { ref: String(++rt.refs), meta: payload.payload ?? {} };
        reply();
        presenceDiff(topic, { [join.presenceKey]: { metas: [{ phx_ref: join.tracked.ref, ...join.tracked.meta }] } }, {});
      } else {
        untrack(sock, topic);
        reply();
      }
      return;
    }
    if (event === 'broadcast') {
      for (const other of rt.sockets) {
        if (other === sock || !other.joins.has(topic)) continue;
        push(other, [null, null, topic, 'broadcast', payload]);
      }
      return reply();
    }
    reply();
  };
  await page.route(/^https:\/\/stub\.supabase\.co\/realtime\/v1\/api\/broadcast/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return preflight(route);
    note(req.method(), req.url());
    const me = caller(route);
    if (!me) return json(route, { error: 'unauthorized' }, 401);
    if (db.broadcastDown) return json(route, { error: 'unavailable' }, 503);
    let body = {};
    try { body = JSON.parse(req.postData() ?? '{}'); } catch {}
    for (const m of Array.isArray(body.messages) ? body.messages : []) {
      const target = /^inbox:(.+)$/.exec(String(m?.topic ?? ''))?.[1];
      if (!m.private || !target || !areFriends(me, target)) { (rt.refusedSends ??= []).push({ user: me, topic: m?.topic }); continue; }
      (db.announced ??= []).push({ from: me, topic: m.topic, event: m.event, payload: m.payload });
      db.liveSend(m.topic, m.event, m.payload);
    }
    return route.fulfill({ status: 202, headers: CORS, body: '' });
  });

  await page.routeWebSocket(/stub\.supabase\.co\/realtime\/v1\/websocket/, (ws) => {
    const sock = { ws, user: null, joins: new Map() };
    rt.sockets.add(sock);
    ws.onMessage((raw) => onSocketMessage(sock, raw));
    ws.onClose(() => {
      for (const topic of [...sock.joins.keys()]) leaveTopic(sock, topic);
      rt.sockets.delete(sock);
    });
  });

  await page.route(/^https:\/\/stub\.supabase\.co\/functions\/v1\/economy(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return preflight(route);
    note(req.method(), req.url());
    if (!economy) return json(route, { error: 'NOT_LIVE' }, 503);
    const auth = req.headers().authorization ?? '';
    const userId = db.tokens.get(auth.replace(/^Bearer /, '')) ?? null;
    if (!userId) return json(route, { error: 'SIGN_IN' }, 401);
    let body = {};
    try { body = JSON.parse(req.postData() ?? '{}'); } catch {}
    if (!economy.db.legacy.has(userId)) economy.db.legacy.set(userId, db.saves.get(userId)?.data ?? null);
    const owner = [...db.users.values()].find((u) => u.id === userId);
    if (owner && economy.db.meta) economy.db.meta.set(userId, { ...(owner.meta ?? {}) });
    if (economy.delay) await new Promise((r) => setTimeout(r, economy.delay));
    try {
      return json(route, await economy.handle(userId, body, req.headers()['user-agent'] ?? ''));
    } catch (error) {
      if (error?.code) return json(route, { error: error.code }, 400);
      console.error('economy stub', body.action, error);
      return json(route, { error: 'FAILED' }, 500);
    }
  });

  await page.route(/^https:\/\/stub\.supabase\.co\/functions\/v1\/delete-account(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return preflight(route);
    note(req.method(), req.url());
    const userId = db.tokens.get((req.headers().authorization ?? '').replace(/^Bearer /, '')) ?? null;
    if (!userId) return json(route, { error: 'UNAUTHORISED' }, 401);
    if (db.deleteFails) return json(route, { error: 'DELETE_FAILED' }, 500);
    return json(route, await db.deleteAccount(userId));
  });

  if (quests && economy) {
    await page.route(/^https:\/\/stub\.supabase\.co\/functions\/v1\/quests(\?.*)?$/, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return preflight(route);
      note(req.method(), req.url());
      const userId = db.tokens.get((req.headers().authorization ?? '').replace(/^Bearer /, '')) ?? null;
      if (!userId) return json(route, { error: 'SIGN_IN' }, 401);
      let body = {};
      try { body = JSON.parse(req.postData() ?? '{}'); } catch {}
      db.questCalls = (db.questCalls ?? 0) + 1;
      if (quests.delay) await new Promise((r) => setTimeout(r, quests.delay));
      const day = utcDay();
      const dealt = dealQuests(userId, day);
      for (const q of dealt) {
        const key = `${userId}|${day}|${q.id}`;
        if (!economy.db.quests.has(key)) economy.db.quests.set(key, { progress: 0, target: q.target, claimed: false });
      }
      if (body.action === 'progress' && body.updates && typeof body.updates === 'object') {
        for (const [id, value] of Object.entries(body.updates)) {
          const row = economy.db.quests.get(`${userId}|${day}|${id}`);
          const n = Math.max(0, Math.min(row?.target ?? 0, Math.floor(Number(value) || 0)));
          if (row && n > row.progress) row.progress = n;
        }
      }
      if (body.action === 'claim') return json(route, { error: 'USE_ECONOMY' }, 409);
      const list = dealt.map((q) => {
        const row = economy.db.quests.get(`${userId}|${day}|${q.id}`);
        return { quest_id: q.id, target: row.target, progress: row.progress, claimed: row.claimed, expires_at: new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString() };
      }).sort((a, b) => a.quest_id.localeCompare(b.quest_id));
      return json(route, { day, expiresAt: list[0]?.expires_at ?? null, quests: list });
    });
  }

  page.route(`${SUPA_URL}/auth/v1/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return preflight(route);
    const url = new URL(request.url());
    const path = url.pathname.replace('/auth/v1/', '');
    note(request.method(), request.url());
    const body = request.postData() ? JSON.parse(request.postData()) : {};

    if (path === 'signup') {
      if (db.users.has(body.email)) return fail(route, 'User already registered', 422);
      if ((body.password ?? '').length < 6) return fail(route, 'Password should be at least 6 characters', 422);
      const user = { id: uuid(), email: body.email, password: body.password, meta: body.data ?? {} };
      db.users.set(body.email, user);
      return json(route, session(user));
    }
    if (path === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const id = db.refreshes?.get(body.refresh_token);
      const user = [...db.users.values()].find((u) => u.id === id);
      if (!user) return json(route, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
      db.refreshes.delete(body.refresh_token);
      return json(route, session(user));
    }
    if (path === 'token') {
      const user = db.users.get(body.email);
      if (!user || user.password !== body.password) {
        return fail(route, 'Invalid login credentials', 400);
      }
      return json(route, session(user));
    }
    if (path === 'logout') return route.fulfill({ status: 204, headers: CORS, body: '' });
    if (path === 'recover') {
      db.recoveries ??= [];
      const recent = db.recoveries.filter((r) => r.email === body.email && Date.now() - r.at < 60000).length;
      if (db.recoverLimit != null && recent >= db.recoverLimit) {
        return json(route, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }, 429);
      }
      db.recoveries.push({ email: body.email, redirectTo: url.searchParams.get('redirect_to'), known: db.users.has(body.email), at: Date.now() });
      return json(route, {});
    }
    if (path === 'verify' && request.method() === 'POST') {
      const otp = db.otps?.get(body.token_hash);
      const user = otp && !otp.used && otp.type === body.type ? db.users.get(otp.email) : null;
      if (!user) return json(route, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }, 403);
      otp.used = true;
      return json(route, session(user));
    }
    if (path === 'user') {
      const id = caller(route);
      const user = [...db.users.values()].find((u) => u.id === id);
      if (!user) return fail(route, 'Unauthorized', 401);
      if (request.method() === 'PUT' && body.password !== undefined) {
        if (body.password === user.password) {
          return json(route, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }, 422);
        }
        if (String(body.password).length < 6) {
          return json(route, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }, 422);
        }
        user.password = body.password;
        db.passwordChanges = (db.passwordChanges ?? 0) + 1;
      }
      if (request.method() === 'PUT' && body.data) user.meta = { ...(user.meta ?? {}), ...body.data };
      return json(route, session(user).user);
    }
    return json(route, {});
  });

  const restRoute = async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return preflight(route);
    const url = new URL(request.url());
    const path = url.pathname.replace('/rest/v1/', '');
    const method = request.method();
    note(method, request.url());
    const me = caller(route);
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    if (path === 'rpc/social_digest') {
      if (!me) return fail(route, 'JWT expired', 401);
      if (schema === 'v1' || db.noDigest) return fail(route, 'Could not find the function public.social_digest(p_parts) in the schema cache', 404, 'PGRST202');
      db.digestCalls = (db.digestCalls ?? 0) + 1;
      return json(route, await socialDigest(route, me, Array.isArray(body?.p_parts) ? body.p_parts : null));
    }
    const params = url.searchParams;

    if (path === 'rpc/live_state' || path === 'rpc/live_events_active' || path === 'rpc/packs_live') {
      const live = economy?.db?.live ?? db.live ?? {};
      db.liveCalls = (db.liveCalls ?? 0) + 1;
      const state = liveStateOf(live);
      if (path === 'rpc/live_events_active') return json(route, state.events);
      if (path === 'rpc/packs_live') return json(route, state.packs);
      return json(route, state);
    }
    if (!me && !['rpc/username_available', 'announcements'].includes(path)) {
      return fail(route, 'JWT expired', 401);
    }

    if (path === 'rpc/username_available') {
      const taken = [...db.profiles.values()]
        .some((p) => p.username.toLowerCase() === String(body.name).toLowerCase());
      return json(route, !taken);
    }
    const board = () => {
      const totals = new Map();
      for (const r of db.scores ?? []) {
        const row = totals.get(r.user_id) ?? { user_id: r.user_id, username: r.username, score: 0 };
        row.score += r.score;
        totals.set(r.user_id, row);
      }
      return [...totals.values()].sort((a, b) => b.score - a.score);
    };
    if (path === 'rpc/leaderboard_page') {
      const all = board();
      const page = Number(body.p_page) || 0;
      return json(route, all.slice(page * 20, page * 20 + 20).map((r, i) => ({ rank: page * 20 + i + 1, user_id: r.user_id, username: r.username, score: r.score })));
    }
    const weekKey = utcWeek;
    const GOAL_BASE = { open: 12, points: 1500, new: 15, wikdle: 3 };
    const goalEnsure = (g) => {
      const wk = weekKey();
      const n = Math.max(1, db.guilds.find((x) => x.id === g)?.members ?? 1);
      let goal = db.guildGoals.find((x) => x.guild_id === g && x.week === wk);
      if (goal) {
        if (n > goal.members && !goal.done_at) {
          goal.members = n;
          goal.target = Math.max(goal.progress, Math.round(GOAL_BASE[goal.kind] * (1 + 0.5 * (n - 1))));
        }
        return goal;
      }
      const kind = db.goalKind ?? ['open', 'points', 'new', 'wikdle'][(g.charCodeAt(0) + Number(wk)) % 4];
      goal = { guild_id: g, week: wk, kind, target: Math.round(GOAL_BASE[kind] * (1 + 0.5 * (n - 1))), progress: 0, members: n, done_at: null };
      db.guildGoals.push(goal);
      return goal;
    };
    db.goalBump = (g, kind, amount) => {
      if (!g || !(amount > 0)) return;
      const goal = goalEnsure(g);
      if (goal.kind !== kind || goal.done_at) return;
      goal.progress = Math.min(goal.target, goal.progress + amount);
      if (goal.progress >= goal.target) goal.done_at = new Date().toISOString();
      db.emitChange?.('guild_goals', 'UPDATE', { ...goal });
    };
    const weeklyScore = (g) => guildTotals().find((x) => x.id === g)?.score ?? 0;
    if (path === 'rpc/submit_score') {
      const max = { wikdle: 1400, duel: 3100, reveal: 1600, quiz: 1000 }[body.p_game];
      if (!max) return fail(route, 'this game is not scored by the client', 400);
      if (body.p_points < 0 || body.p_points > max) return fail(route, 'points out of range', 400);
      db.scores ??= [];
      const username = db.profiles.get(me)?.username ?? 'someone';
      const found = db.scores.find((r) => r.user_id === me && r.game === body.p_game && r.day === body.p_day);
      const delta = found ? body.p_points - found.score : body.p_points;
      if (found) {
        if (body.p_game === 'wikdle' || body.p_points <= found.score) return json(route, null, 204);
        found.score = body.p_points;
      } else {
        db.scores.push({ user_id: me, username, game: body.p_game, day: body.p_day, score: body.p_points });
      }
      const mine = board().find((r) => r.user_id === me);
      for (const table of ['leaderboard_daily', 'leaderboard_weekly', 'leaderboard_alltime']) {
        db.emitChange?.(table, 'UPDATE', { user_id: me, score: mine?.score ?? 0, updated_at: new Date().toISOString() });
      }
      const g = db.guildMembers.find((m) => m.user_id === me)?.guild_id;
      if (g) for (const table of ['guild_daily', 'guild_weekly', 'guild_alltime']) db.emitChange?.(table, 'UPDATE', { guild_id: g, updated_at: new Date().toISOString() });
      if (g) db.goalBump(g, 'points', delta);
      return json(route, null, 204);
    }
    if (path === 'rpc/my_rank') {
      const all = board();
      const at = all.findIndex((r) => r.user_id === me);
      return json(route, at < 0 ? [] : [{ rank: at + 1, score: all[at].score, total: all.length }]);
    }
    const guildOf = (user) => db.guildMembers.find((m) => m.user_id === user)?.guild_id ?? null;
    const guildTotals = () => {
      const perUser = new Map(board().map((r) => [r.user_id, r.score]));
      const totals = new Map();
      for (const m of db.guildMembers) totals.set(m.guild_id, (totals.get(m.guild_id) ?? 0) + (perUser.get(m.user_id) ?? 0));
      return [...db.guilds].map((g) => ({ ...g, score: totals.get(g.id) ?? 0 })).filter((g) => g.score > 0)
        .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));
    };
    const emitGuild = (id) => {
      const row = guildTotals().find((g) => g.id === id);
      for (const table of ['guild_daily', 'guild_weekly', 'guild_alltime']) db.emitChange?.(table, 'UPDATE', { guild_id: id, score: row?.score ?? 0, updated_at: new Date().toISOString() });
      db.emitChange?.('guild_members', 'UPDATE', { guild_id: id });
    };
    if (path === 'rpc/my_guild') {
      const id = guildOf(me);
      return json(route, id ? db.guilds.find((g) => g.id === id) ?? null : null);
    }
    if (path === 'rpc/create_guild') {
      if (guildOf(me)) return fail(route, 'ALREADY_IN_GUILD', 400);
      const name = String(body.p_name ?? '').trim();
      const tag = String(body.p_tag ?? '').trim().toUpperCase();
      if (name.length < 3 || name.length > 24) return fail(route, 'violates check constraint', 400);
      if (!/^[A-Z0-9]{2,5}$/.test(tag)) return fail(route, 'violates check constraint', 400);
      if (db.guilds.some((g) => g.name.toLowerCase() === name.toLowerCase())) return fail(route, 'NAME_TAKEN', 400);
      if (db.guilds.some((g) => g.tag === tag)) return fail(route, 'TAG_TAKEN', 400);
      const row = { id: uuid(), name, tag, about: String(body.p_about ?? '').trim(), owner: me, members: 1, created_at: new Date().toISOString() };
      db.guilds.push(row);
      db.guildMembers.push({ user_id: me, guild_id: row.id, joined_at: new Date().toISOString() });
      return json(route, row);
    }
    if (path === 'rpc/join_guild') {
      if (guildOf(me)) return fail(route, 'ALREADY_IN_GUILD', 400);
      const row = db.guilds.find((g) => g.id === body.p_guild);
      if (!row) return fail(route, 'NOT_FOUND', 400);
      if (row.members >= 50) return fail(route, 'GUILD_FULL', 400);
      db.guildMembers.push({ user_id: me, guild_id: row.id, joined_at: new Date().toISOString() });
      row.members += 1;
      emitGuild(row.id);
      return json(route, row);
    }
    if (path === 'rpc/leave_guild') {
      const id = guildOf(me);
      if (!id) return json(route, null, 204);
      db.guildMembers = db.guildMembers.filter((m) => m.user_id !== me);
      const left = db.guildMembers.filter((m) => m.guild_id === id);
      const row = db.guilds.find((g) => g.id === id);
      if (!left.length) {
        db.guilds = db.guilds.filter((g) => g.id !== id);
        db.guildInvites = db.guildInvites.filter((i) => i.guild_id !== id);
      } else {
        row.members = left.length;
        if (row.owner === me) row.owner = [...left].sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0].user_id;
      }
      emitGuild(id);
      return json(route, null, 204);
    }
    if (path === 'rpc/delete_guild') {
      const id = guildOf(me);
      if (!id) return fail(route, 'NOT_FOUND', 400);
      const row = db.guilds.find((g) => g.id === id);
      if (row?.owner !== me) return fail(route, 'NOT_OWNER', 400);
      db.guilds = db.guilds.filter((g) => g.id !== id);
      db.guildMembers = db.guildMembers.filter((m) => m.guild_id !== id);
      db.guildInvites = db.guildInvites.filter((i) => i.guild_id !== id);
      emitGuild(id);
      return json(route, null, 204);
    }
    if (path === 'rpc/invite_to_guild') {
      const id = guildOf(me);
      const guest = body.p_user;
      if (!guest || guest === me) return fail(route, 'NOT_FOUND', 400);
      if (!id) return fail(route, 'NOT_IN_GUILD', 400);
      const row = db.guilds.find((g) => g.id === id);
      if (row.members >= 50) return fail(route, 'GUILD_FULL', 400);
      if (!areFriends(me, guest)) return fail(route, 'NOT_FRIEND', 400);
      if (guildOf(guest)) return fail(route, 'ALREADY_MEMBER', 400);
      if (!db.guildInvites.some((i) => i.guild_id === id && i.invitee === guest)) {
        const invite = { id: uuid(), guild_id: id, inviter: me, invitee: guest, created_at: new Date().toISOString() };
        db.guildInvites.push(invite);
        db.emitChange?.('guild_invites', 'INSERT', invite);
      }
      return json(route, null, 204);
    }
    if (path === 'rpc/my_guild_invites') {
      return json(route, db.guildInvites.filter((i) => i.invitee === me).map((i) => {
        const g = db.guilds.find((row) => row.id === i.guild_id);
        return {
          id: i.id, guild_id: i.guild_id, name: g?.name ?? '?', tag: g?.tag ?? '', about: g?.about ?? '',
          members: g?.members ?? 0, inviter: i.inviter, inviter_name: db.profiles.get(i.inviter)?.username ?? '?',
          created_at: i.created_at
        };
      }).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
    if (path === 'rpc/accept_guild_invite') {
      if (guildOf(me)) return fail(route, 'ALREADY_IN_GUILD', 400);
      const invite = db.guildInvites.find((i) => i.id === body.p_invite && i.invitee === me);
      if (!invite) return fail(route, 'INVITE_GONE', 400);
      const row = db.guilds.find((g) => g.id === invite.guild_id);
      if (!row) return fail(route, 'NOT_FOUND', 400);
      if (row.members >= 50) return fail(route, 'GUILD_FULL', 400);
      db.guildMembers.push({ user_id: me, guild_id: row.id, joined_at: new Date().toISOString() });
      row.members += 1;
      for (const gone of db.guildInvites.filter((i) => i.invitee === me)) {
        db.liveSend(`user:${me}`, 'guild-invite', { type: 'DELETE', row: { id: gone.id, guild_id: gone.guild_id, invitee: me } });
      }
      db.guildInvites = db.guildInvites.filter((i) => i.invitee !== me);
      emitGuild(row.id);
      return json(route, row);
    }
    const challengeRow = (c) => ({
      ...c, challenger_name: db.profiles.get(c.challenger)?.username ?? '?', opponent_name: db.profiles.get(c.opponent)?.username ?? '?'
    });
    const hand = (cards) => (Array.isArray(cards) ? cards : []).map((c) => Number(c?.views) || 0).sort((x, y) => y - x);
    const sortScore = (cards, order) => {
      const truth = [...(cards ?? [])].sort((x, y) => (Number(y.views) || 0) - (Number(x.views) || 0)).map((c) => c.key);
      return (Array.isArray(order) ? order : []).reduce((n, k, i) => n + (truth[i] === k ? 1 : 0), 0);
    };
    if (path === 'rpc/challenge_send') {
      const other = body.p_user;
      if (!other || other === me) return fail(route, 'NOT_FOUND', 400);
      if (!['clash', 'sort'].includes(body.p_kind)) return fail(route, 'BAD_KIND', 400);
      if (!areFriends(me, other)) return fail(route, 'NOT_FRIEND', 400);
      if (db.challenges.filter((c) => c.challenger === me && c.opponent === other && c.status === 'open').length >= 5) return fail(route, 'TOO_MANY', 400);
      if (!Array.isArray(body.p_payload?.cards)) return fail(route, 'BAD_HAND', 400);
      const now = new Date().toISOString();
      const row = { id: uuid(), kind: body.p_kind, challenger: me, opponent: other, status: 'open', payload: body.p_payload, reply: null, result: null, claimed: [], created_at: now, updated_at: now };
      db.challenges.push(row);
      db.emitChange?.('challenges', 'INSERT', row);
      return json(route, challengeRow(row));
    }
    if (path === 'rpc/my_challenges') {
      const cutoff = Date.now() - 14 * 86400000;
      return json(route, db.challenges
        .filter((c) => (c.challenger === me || c.opponent === me) && (c.status === 'open' || Date.parse(c.updated_at) > cutoff))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 40).map(challengeRow));
    }
    if (path === 'rpc/challenge_decline') {
      const row = db.challenges.find((c) => c.id === body.p_id && c.status === 'open' && (c.opponent === me || c.challenger === me));
      if (!row) return fail(route, 'GONE', 400);
      row.status = 'declined'; row.updated_at = new Date().toISOString();
      db.emitChange?.('challenges', 'UPDATE', row);
      return json(route, null, 204);
    }
    if (path === 'rpc/challenge_answer') {
      const row = db.challenges.find((c) => c.id === body.p_id && c.opponent === me);
      if (!row) return fail(route, 'GONE', 400);
      if (row.status !== 'open') return fail(route, 'SETTLED', 400);
      const reply = body.p_reply ?? {};
      let result;
      if (row.kind === 'clash') {
        if (!Array.isArray(reply.cards) || !reply.cards.length) return fail(route, 'BAD_HAND', 400);
        const a = hand(row.payload.cards), b = hand(reply.cards);
        let sc = 0, so = 0;
        for (let i = 0; i < Math.min(a.length, 5); i++) {
          if (i >= b.length || a[i] > b[i]) sc++; else if (b[i] > a[i]) so++;
        }
        result = { winner: sc > so ? 'challenger' : so > sc ? 'opponent' : 'draw', scores: { challenger: sc, opponent: so } };
      } else {
        if (!Array.isArray(reply.order)) return fail(route, 'BAD_HAND', 400);
        const sc = sortScore(row.payload.cards, row.payload.order), so = sortScore(row.payload.cards, reply.order);
        const cm = Number(row.payload.ms) || 0, om = Number(reply.ms) || 0;
        const winner = sc > so ? 'challenger' : so > sc ? 'opponent' : cm < om ? 'challenger' : om < cm ? 'opponent' : 'draw';
        result = { winner, scores: { challenger: sc, opponent: so }, ms: { challenger: cm, opponent: om } };
      }
      row.reply = reply; row.result = result; row.status = 'done'; row.updated_at = new Date().toISOString();
      db.emitChange?.('challenges', 'UPDATE', row);
      return json(route, challengeRow(row));
    }
    if (path === 'rpc/challenge_claim') {
      const row = db.challenges.find((c) => c.id === body.p_id && (c.challenger === me || c.opponent === me));
      if (!row) return fail(route, 'GONE', 400);
      if (row.status !== 'done') return fail(route, 'NOT_DONE', 400);
      if (row.claimed.includes(me)) return fail(route, 'CLAIMED', 400);
      const side = row.challenger === me ? 'challenger' : 'opponent';
      const w = row.result.winner;
      row.claimed.push(me); row.updated_at = new Date().toISOString();
      return json(route, w === 'draw' ? 300 : w === side ? 600 : 150);
    }
    if (path === 'rpc/decline_guild_invite') {
      for (const gone of db.guildInvites.filter((i) => i.id === body.p_invite && i.invitee === me)) {
        db.liveSend(`user:${me}`, 'guild-invite', { type: 'DELETE', row: { id: gone.id, guild_id: gone.guild_id, invitee: me } });
      }
      db.guildInvites = db.guildInvites.filter((i) => !(i.id === body.p_invite && i.invitee === me));
      return json(route, null, 204);
    }
    if (path === 'rpc/guild_say') {
      const g = guildOf(me);
      if (!g) return fail(route, 'NOT_IN_GUILD', 400);
      const text = String(body.p_body ?? '').trim().slice(0, 500);
      if (!text) return fail(route, 'violates check constraint', 400);
      const row = { id: uuid(), guild_id: g, sender: me, sender_name: db.profiles.get(me)?.username ?? '', body: text, created_at: new Date().toISOString() };
      db.guildMessages.push(row);
      db.emitChange?.('guild_messages', 'INSERT', row);
      return json(route, row);
    }
    if (path === 'rpc/guild_chat') {
      const g = guildOf(me);
      return json(route, db.guildMessages.filter((m) => m.guild_id === g).slice(-60));
    }
    if (path === 'rpc/guild_goal') {
      const g = guildOf(me);
      if (!g) return json(route, []);
      const goal = goalEnsure(g);
      return json(route, [{ ...goal, claimed: db.guildGoalClaims.some((c) => c.guild_id === g && c.week === goal.week && c.user_id === me), reward: 900 }]);
    }
    if (path === 'rpc/guild_goal_add') {
      if (!['open', 'new', 'wikdle'].includes(body.p_kind)) return fail(route, 'not a client kind', 400);
      db.goalBump(guildOf(me), body.p_kind, Math.min(100, Math.max(0, Number(body.p_amount) || 0)));
      return json(route, null, 204);
    }
    if (path === 'rpc/guild_goal_claim') {
      const g = guildOf(me);
      if (!g) return fail(route, 'NOT_IN_GUILD', 400);
      const goal = db.guildGoals.find((x) => x.guild_id === g && x.week === weekKey());
      if (!goal?.done_at) return fail(route, 'NOT_DONE', 400);
      if (db.guildGoalClaims.some((c) => c.guild_id === g && c.week === goal.week && c.user_id === me)) return fail(route, 'CLAIMED', 400);
      db.guildGoalClaims.push({ guild_id: g, week: goal.week, user_id: me });
      return json(route, 900);
    }
    if (path === 'rpc/guild_bank') {
      const g = guildOf(me);
      return json(route, db.guildBank.filter((d) => d.guild_id === g).slice().reverse().slice(0, 200));
    }
    if (path === 'rpc/guild_bank_donate') {
      const g = guildOf(me);
      if (!g) return fail(route, 'NOT_IN_GUILD', 400);
      const card = body.p_card;
      if (!card?.key || !card?.title) return fail(route, 'BAD_CARD', 400);
      if (db.guildBank.filter((d) => d.guild_id === g).length >= 200) return fail(route, 'BANK_FULL', 400);
      const row = { id: uuid(), guild_id: g, donor: me, donor_name: db.profiles.get(me)?.username ?? '', card, created_at: new Date().toISOString() };
      db.guildBank.push(row);
      db.emitChange?.('guild_bank', 'INSERT', row);
      return json(route, row);
    }
    if (path === 'rpc/guild_bank_take') {
      const g = guildOf(me);
      if (!g) return fail(route, 'NOT_IN_GUILD', 400);
      const day = utcDay();
      const takes = db.guildBankTakes.find((x) => x.user_id === me && x.day === day);
      if ((takes?.n ?? 0) >= 3) return fail(route, 'TAKE_LIMIT', 400);
      const at = db.guildBank.findIndex((d) => d.id === body.p_id && d.guild_id === g);
      if (at < 0) return fail(route, 'GONE', 400);
      const [taken] = db.guildBank.splice(at, 1);
      if (takes) takes.n += 1; else db.guildBankTakes.push({ user_id: me, day, n: 1 });
      db.emitChange?.('guild_bank', 'DELETE', null, taken);
      return json(route, taken.card);
    }
    if (path === 'rpc/guild_bank_takes_left') {
      const day = utcDay();
      return json(route, 3 - (db.guildBankTakes.find((x) => x.user_id === me && x.day === day)?.n ?? 0));
    }
    if (path === 'rpc/guild_match') {
      const g = guildOf(me);
      if (!g) return json(route, []);
      const wk = weekKey();
      const prev = weekKey(Date.now() - 7 * 86400000);
      let m = db.guildMatches.find((x) => x.week === wk && (x.guild_a === g || x.guild_b === g));
      if (!m) {
        const mine = weeklyScore(g);
        const other = db.guilds.filter((x) => x.id !== g && !db.guildMatches.some((y) => y.week === wk && (y.guild_a === x.id || y.guild_b === x.id)))
          .sort((a, b) => Math.abs(weeklyScore(a.id) - mine) - Math.abs(weeklyScore(b.id) - mine) || b.members - a.members)[0];
        if (other) { m = { week: wk, guild_a: g, guild_b: other.id, score_a: null, score_b: null }; db.guildMatches.push(m); }
      }
      const other = m ? (m.guild_a === g ? m.guild_b : m.guild_a) : null;
      const og = db.guilds.find((x) => x.id === other);
      const lm = db.guildMatches.find((x) => x.week === prev && (x.guild_a === g || x.guild_b === g));
      const lo = lm ? (lm.guild_a === g ? lm.guild_b : lm.guild_a) : null;
      const lmine = lm ? (lm.guild_a === g ? lm.score_a : lm.score_b) : null;
      const ltheirs = lm ? (lm.guild_a === g ? lm.score_b : lm.score_a) : null;
      return json(route, [{
        week: wk, opponent_id: other, opponent_name: og?.name ?? null, opponent_tag: og?.tag ?? null, opponent_members: og?.members ?? null,
        my_score: weeklyScore(g), their_score: other ? weeklyScore(other) : 0,
        last_week: lm?.week ?? null, last_opponent_name: db.guilds.find((x) => x.id === lo)?.name ?? null,
        last_my_score: lmine, last_their_score: ltheirs,
        last_won: lm && lm.score_a != null ? lmine > ltheirs : null,
        last_claimed: db.guildMatchClaims.some((c) => c.week === prev && c.user_id === me)
      }]);
    }
    if (path === 'rpc/guild_match_claim') {
      const g = guildOf(me);
      if (!g) return fail(route, 'NOT_IN_GUILD', 400);
      const prev = weekKey(Date.now() - 7 * 86400000);
      const lm = db.guildMatches.find((x) => x.week === prev && (x.guild_a === g || x.guild_b === g));
      if (!lm || lm.score_a == null) return fail(route, 'NOT_DONE', 400);
      const won = lm.guild_a === g ? lm.score_a > lm.score_b : lm.score_b > lm.score_a;
      if (!won) return fail(route, 'NOT_DONE', 400);
      if (db.guildMatchClaims.some((c) => c.week === prev && c.user_id === me)) return fail(route, 'CLAIMED', 400);
      db.guildMatchClaims.push({ week: prev, user_id: me });
      return json(route, 750);
    }
    if (path === 'rpc/search_guilds') {
      const term = String(body.p_term ?? '').toLowerCase();
      return json(route, db.guilds.filter((g) => !term || g.name.toLowerCase().includes(term) || g.tag.toLowerCase().includes(term))
        .sort((a, b) => b.members - a.members).slice(0, 20));
    }
    if (path === 'rpc/guild_roster') {
      const perUser = new Map(board().map((r) => [r.user_id, r.score]));
      return json(route, db.guildMembers.filter((m) => m.guild_id === body.p_guild).map((m) => ({
        user_id: m.user_id, username: db.profiles.get(m.user_id)?.username ?? '?', level: db.profiles.get(m.user_id)?.level ?? 1,
        joined_at: m.joined_at, score: perUser.get(m.user_id) ?? 0
      })).sort((a, b) => b.score - a.score));
    }
    if (path === 'rpc/guild_board') {
      const all = guildTotals();
      const page = Number(body.p_page) || 0;
      return json(route, all.slice(page * 20, page * 20 + 20).map((g, i) => ({ rank: page * 20 + i + 1, guild_id: g.id, name: g.name, tag: g.tag, members: g.members, score: g.score })));
    }
    if (path === 'rpc/my_guild_rank') {
      const id = guildOf(me);
      if (!id) return json(route, []);
      const all = guildTotals();
      const at = all.findIndex((g) => g.id === id);
      return json(route, [{ rank: at < 0 ? null : at + 1, score: at < 0 ? 0 : all[at].score, total: all.length }]);
    }
    if (path === 'rpc/sync_me') {
      if (schema === 'v1') return fail(route, 'Could not find the function public.sync_me in the schema cache', 404, 'PGRST202');
      return json(route, syncMe(me, body ?? {}));
    }
    if (path === 'save_keys' || path === 'save_meta') {
      if (schema === 'v1') return noTable(route, path);
      if (method === 'GET') {
        const list = path === 'save_keys' ? db.saveKeys : [...db.saveMeta.entries()].map(([user_id, m]) => ({ user_id, ...m }));
        return rows(route, filtered(list.filter((r) => r.user_id === me), params));
      }
      if (method === 'DELETE') {
        if (path === 'save_keys') db.saveKeys = db.saveKeys.filter((r) => r.user_id !== me);
        else db.saveMeta.delete(me);
        return json(route, [], 204);
      }
    }
    if (path === 'rpc/my_conversations') {
      if (schema === 'v1') return fail(route, 'Could not find the function public.my_conversations in the schema cache', 404, 'PGRST202');
      db.conversationCalls = (db.conversationCalls ?? 0) + 1;
      const pals = db.friendships.filter((f) => f.status === 'accepted' && (f.requester === me || f.addressee === me))
        .map((f) => (f.requester === me ? f.addressee : f.requester));
      const out = [];
      for (const other of new Set(pals)) {
        const pair = db.messages.filter((m) => (m.sender === me && m.recipient === other) || (m.sender === other && m.recipient === me))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (!pair.length) continue;
        const m = pair[0];
        if (body?.p_before && !(m.created_at < body.p_before)) continue;
        out.push({ other, last_id: m.id, last_sender: m.sender, last_body: m.body, last_at: m.created_at, last_read_at: m.read_at ?? null,
          unread: pair.filter((x) => x.recipient === me && !x.read_at).length });
      }
      out.sort((a, b) => b.last_at.localeCompare(a.last_at) || a.other.localeCompare(b.other));
      return json(route, out.slice(0, Math.max(1, Math.min(100, Number(body?.p_limit) || 30))));
    }
    if (path === 'rpc/friend_cards') {
      const target = body.target;
      if (target !== me && !areFriends(me, target)) return json(route, { allowed: false });
      const held = econHeld(target);
      if (held) {
        const entries = Object.fromEntries([...held.cards.values()].map((row) => { const e = rowToEntry(row); return [e.key, e]; }));
        return json(route, { allowed: true, cards: JSON.stringify({ entries }) });
      }
      const save = db.saves.get(target);
      return json(route, {
        allowed: true,
        cards: save?.data?.data?.['wikster.collection.v3'] ?? null
      });
    }

    const auctionFloor = (a) => (a.current_bid == null ? a.start_price : Math.ceil(a.current_bid * 1.15));
    const postParcel = (sender, recipient, kind, payload) => {
      const row = { id: uuid(), sender, recipient, kind, payload, created_at: new Date().toISOString(), claimed_at: null };
      db.deliveries.push(row);
      db.emitChange('deliveries', 'INSERT', row);
      return row;
    };
    if (path === 'rpc/create_auction') {
      if (schema === 'v1') return fail(route, 'function public.create_auction does not exist', 404);
      const minutes = Number(body.minutes);
      if (![10, 30, 60, 180, 360, 720, 1440].includes(minutes)) return fail(route, 'BAD_DURATION', 400);
      const price = Number(body.price);
      if (!(price >= 1 && price <= 1000000)) return fail(route, 'BAD_PRICE', 400);
      const mine = db.auctions.filter((a) => a.seller === me && a.status === 'open').length;
      if (mine >= 10) return fail(route, 'TOO_MANY', 400);
      const row = {
        id: uuid(), seller: me,
        seller_name: db.profiles.get(me)?.username ?? '',
        card: body.card, start_price: price, current_bid: null,
        bidder: null, bidder_name: null, bid_count: 0,
        ends_at: new Date(Date.now() + minutes * 60000).toISOString(),
        status: 'open', created_at: new Date().toISOString()
      };
      db.auctions.push(row);
      db.emitChange('auctions', 'INSERT', row);
      return json(route, row);
    }
    if (path === 'rpc/place_bid') {
      if (schema === 'v1') return fail(route, 'function public.place_bid does not exist', 404);
      const a = db.auctions.find((x) => x.id === body.auction);
      if (!a) return fail(route, 'NOT_FOUND', 400);
      if (a.status !== 'open' || Date.now() >= new Date(a.ends_at).getTime()) return fail(route, 'ENDED', 400);
      if (a.seller === me) return fail(route, 'OWN_AUCTION', 400);
      const amount = Number(body.amount);
      if (!(amount >= auctionFloor(a))) return fail(route, 'TOO_LOW', 400);
      if (a.bidder) {
        postParcel(a.seller, a.bidder, 'auction-money',
          { amount: a.current_bid, reason: 'refund', title: a.card?.title });
      }
      a.current_bid = amount;
      a.bidder = me;
      a.bidder_name = db.profiles.get(me)?.username ?? '';
      a.bid_count += 1;
      if (new Date(a.ends_at).getTime() - Date.now() < 10000) {
        a.ends_at = new Date(Date.now() + 65000).toISOString();
      }
      db.emitChange('auctions', 'UPDATE', { ...a });
      return json(route, a);
    }
    if (path === 'rpc/cancel_auction') {
      if (schema === 'v1') return fail(route, 'function public.cancel_auction does not exist', 404);
      const a = db.auctions.find((x) => x.id === body.auction);
      if (!a) return fail(route, 'NOT_FOUND', 400);
      if (a.seller !== me) return fail(route, 'NOT_YOURS', 400);
      if (a.status !== 'open') return fail(route, 'ENDED', 400);
      if (a.bid_count > 0) return fail(route, 'HAS_BIDS', 400);
      a.status = 'cancelled';
      postParcel(a.seller, a.seller, 'auction-card', a.card);
      db.emitChange('auctions', 'UPDATE', { ...a });
      return json(route, a);
    }
    if (path === 'rpc/settle_auction') {
      if (schema === 'v1') return fail(route, 'function public.settle_auction does not exist', 404);
      const a = db.auctions.find((x) => x.id === body.auction);
      if (!a) return fail(route, 'NOT_FOUND', 400);
      if (a.status !== 'open') return json(route, a);
      if (Date.now() < new Date(a.ends_at).getTime()) return fail(route, 'NOT_OVER', 400);
      a.status = 'settled';
      if (!a.bidder) {
        postParcel(a.seller, a.seller, 'auction-card', a.card);
      } else {
        postParcel(a.seller, a.bidder, 'auction-card', a.card);
        postParcel(a.bidder, a.seller, 'auction-money',
          { amount: a.current_bid, reason: 'sale', title: a.card?.title });
      }
      db.emitChange('auctions', 'UPDATE', { ...a });
      return json(route, a);
    }
    if (['rpc/market_browse', 'rpc/market_lot', 'rpc/market_mine', 'rpc/market_prices'].includes(path)) {
      if (schema === 'v1') return fail(route, `function public.${path.slice(4)} does not exist`, 404);
      try {
        if (path === 'rpc/market_browse') return json(route, await db.market.browse(me, body?.p_filter, body?.p_sort, body?.p_limit ?? 24, body?.p_offset ?? 0));
        if (path === 'rpc/market_lot') return json(route, await db.market.lot(me, body?.p_id));
        if (path === 'rpc/market_mine') return json(route, await db.market.mine(me, body?.p_view, body?.p_limit ?? 30, body?.p_offset ?? 0));
        return json(route, await db.market.prices(body?.p_key, body?.p_rarity ?? null));
      } catch (error) {
        return fail(route, error?.code ?? String(error?.message ?? error), 400);
      }
    }
    if (path === 'auctions') {
      if (schema === 'v1') return fail(route, 'relation "public.auctions" does not exist', 404);
      if (method === 'GET') {
        const found = db.auctions.filter((a) => a.status === 'open' || a.seller === me || a.bidder === me);
        found.sort((x, y) => new Date(x.ends_at) - new Date(y.ends_at));
        return rows(route, found);
      }
    }

    if (path === 'rpc/codex_counts') {
      if (schema === 'v1') return fail(route, 'function public.codex_counts does not exist', 404);
      const byRarity = {};
      for (const row of db.codex.values()) {
        if (row.rarity) byRarity[row.rarity] = (byRarity[row.rarity] ?? 0) + 1;
      }
      return json(route, { total: db.codex.size, byRarity });
    }
    if (path === 'codex') {
      if (schema === 'v1') return fail(route, 'relation "public.codex" does not exist', 404);
      if (method === 'GET') {
        let found = [...db.codex.values()];
        const rarityParam = params.get('rarity');
        if ((rarityParam ?? '').startsWith('eq.')) found = found.filter((r) => r.rarity === rarityParam.slice(3));
        else if ((rarityParam ?? '').startsWith('in.')) {
          const want = rarityParam.slice(3).replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
          found = found.filter((r) => want.includes(r.rarity));
        }
        const titleParam = params.get('title');
        if ((titleParam ?? '').startsWith('ilike.')) {
          const q = titleParam.slice(6).replace(/\*/g, '').replace(/%/g, '').toLowerCase();
          found = found.filter((r) => r.title.toLowerCase().includes(q));
        }
        const order = params.get('order') ?? '';
        if (order.startsWith('title')) found.sort((a, b) => a.title.localeCompare(b.title));
        else if (order.startsWith('price')) found.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        else found.sort((a, b) => new Date(b.found_at) - new Date(a.found_at));
        const range = request.headers()['range'] ?? '0-39';
        const [lo, hi] = range.split('-').map(Number);
        return rows(route, found.slice(lo, hi + 1));
      }
      if (method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        for (const row of list) {
          if (row.found_by !== me) return fail(route, 'row-level security policy', 403);
          if (!db.codex.has(row.key)) db.codex.set(row.key, { ...row, found_at: new Date().toISOString() });
        }
        return rows(route, [], 201);
      }
    }
    const viaControl = me && db.creators.has(me) && request.headers()['x-wikster-control'] === '1';
    if (path === 'announcements') {
      if (method !== 'GET') return fail(route, 'permission denied for table announcements', 403);
      const now = Date.now();
      const guild = me ? db.guildMembers.find((m) => m.user_id === me)?.guild_id ?? null : null;
      const visible = viaControl ? db.announcements : db.announcements.filter((a) =>
        new Date(a.starts_at ?? 0).getTime() <= now
        && (!a.ends_at || new Date(a.ends_at).getTime() > now)
        && (a.target_user ? a.target_user === me : a.target_guild ? Boolean(guild) && a.target_guild === guild : true));
      return rows(route, filtered(visible, params));
    }

    if (path === 'claims' && method === 'GET') {
      const held = economy?.db?.users?.get(me)?.claims ?? new Set();
      const key = (params.get('key') ?? '').replace(/^eq\./, '');
      return rows(route, [...held].filter((k) => !key || k === key).map((k) => ({ key: k })));
    }

    if (path === 'grants') {
      if (schema === 'v1') return noTable(route, 'grants');
      if (!me) return fail(route, 'permission denied for table grants', 401);
      if (method === 'GET') {
        let found = db.grants.filter((g) => g.user_id === me);
        if ((params.get('claimed_at') ?? '') === 'is.null') found = found.filter((g) => !g.claimed_at);
        found.sort((a, b) => new Date(a.at) - new Date(b.at));
        return rows(route, found);
      }
      if (method === 'PATCH') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        const idParam = params.get('id') ?? '';
        const wanted = idParam.startsWith('in.')
          ? idParam.slice(4, -1).split(',').map((x) => Number(x.replace(/"/g, '')))
          : [Number(idParam.slice(3))];
        const hit = db.grants.filter((g) => wanted.includes(g.id) && g.user_id === me && !g.claimed_at);
        for (const g of hit) g.claimed_at = body.claimed_at ?? new Date().toISOString();
        return rows(route, hit);
      }
      return fail(route, 'permission denied for table grants', 403);
    }

    if (path === 'suspensions') {
      if (method !== 'GET') return fail(route, 'permission denied for table suspensions', 403);
      const visible = viaControl ? db.suspensions : db.suspensions.filter((x) => x.user_id === me);
      return rows(route, filtered(visible, params));
    }

    if (path === 'wishlists') {
      if (schema === 'v1') return fail(route, 'relation "public.wishlists" does not exist', 404);
      if (method === 'GET') {
        let found = db.wishlists;
        const ownerParam = params.get('owner');
        if ((ownerParam ?? '').startsWith('eq.')) {
          const owner = ownerParam.slice(3);
          if (owner !== me && !areFriends(me, owner)) return rows(route, []);
          found = found.filter((w) => w.owner === owner);
        } else if ((ownerParam ?? '').startsWith('in.')) {
          const ids = ownerParam.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''));
          found = found.filter((w) => ids.includes(w.owner) && (w.owner === me || areFriends(me, w.owner)));
        } else {
          found = found.filter((w) => w.owner === me || areFriends(me, w.owner));
        }
        return rows(route, found);
      }
      if (method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        for (const row of list) {
          if (row.owner !== me) return fail(route, 'row-level security policy', 403);
          if (!db.wishlists.some((w) => w.owner === row.owner && w.key === row.key)) {
            db.wishlists.push({ ...row, created_at: new Date().toISOString() });
          }
        }
        return rows(route, [], 201);
      }
      if (method === 'DELETE') {
        const owner = (params.get('owner') ?? '').slice(3);
        const key = (params.get('key') ?? '').slice(3);
        if (owner !== me) return fail(route, 'row-level security policy', 403);
        db.wishlists = db.wishlists.filter((w) => !(w.owner === owner && w.key === key));
        return rows(route, []);
      }
    }

    if (path === 'guild_members' && method === 'GET') {
      db.guildOfCalls = (db.guildOfCalls ?? 0) + 1;
      const who = params.get('user_id');
      const found = db.guildMembers.filter((m) => !who?.startsWith('eq.') || m.user_id === who.slice(3));
      const embed = /guilds\(/.test(params.get('select') ?? '');
      return rows(route, found.map((m) => {
        const g = db.guilds.find((x) => x.id === m.guild_id);
        return embed ? { ...m, guilds: g ? { name: g.name, tag: g.tag } : null } : m;
      }));
    }

    if (path === 'profiles') {
      if (schema === 'v1') {
        const asked = params.get('select') ?? '';
        const missingRead = V1_ABSENT_COLUMNS.find((c) => asked.includes(c));
        if (missingRead) return noColumn(route, missingRead);
        const missingWrite = body && V1_ABSENT_COLUMNS.find((c) => c in body);
        if (missingWrite) return noColumn(route, missingWrite);
      }
      if (method === 'GET') {
        let found = [...db.profiles.values()];
        const eq = params.get('id');
        if (eq?.startsWith('eq.')) found = found.filter((p) => p.id === eq.slice(3));
        if (eq?.startsWith('in.')) {
          const wanted = eq.slice(3).replace(/[()]/g, '').split(',');
          found = found.filter((p) => wanted.includes(p.id));
        }
        const neq = params.get('id')?.startsWith('neq.') ? params.get('id').slice(4) : null;
        if (neq) found = found.filter((p) => p.id !== neq);
        const like = params.get('username');
        if (like?.startsWith('ilike.')) {
          const pattern = like.slice(6).replace(/%$/, '').toLowerCase();
          found = found.filter((p) => p.username.toLowerCase().startsWith(pattern));
        }
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.id !== me) return fail(route, 'new row violates row-level security policy', 403);
        if ([...db.profiles.values()].some((p) => p.username.toLowerCase() === body.username.toLowerCase())) {
          return fail(route, 'duplicate key value violates unique constraint "profiles_username_key"', 409);
        }
        const row = {
          id: body.id, username: body.username, created_at: new Date().toISOString(),
          level: 1, rank: null, cards: 0, unique_cards: 0, boosters_opened: 0,
          collection_value: 0, best_rarity: null, play_ms: 0,
          ...(schema === 'v1' ? {} : {
            visibility: 'public', presence: 'online',
            last_seen_at: new Date().toISOString(), avatar: null
          })
        };
        db.profiles.set(row.id, row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const target = (params.get('id') ?? '').slice(3);
        if (target !== me) return fail(route, 'row-level security policy', 403);
        const row = db.profiles.get(target);
        if (row && body.username && [...db.profiles.values()]
            .some((p) => p.id !== target && p.username.toLowerCase() === body.username.toLowerCase())) {
          return fail(route, 'duplicate key value violates unique constraint', 409);
        }
        if (body && 'appearance' in body) {
          body.appearance = body.appearance == null ? null : cleanAppearance(body.appearance, econHeld(me)?.state ?? null);
          db.appearanceWrites = (db.appearanceWrites ?? 0) + 1;
        }
        if (body && body.badges && typeof body.badges === 'object') body.badges = cleanFriendBadges(body.badges, econHeld(me)?.state ?? {});
        if (row) Object.assign(row, body);
        return rows(route, row ? [row] : []);
      }
    }

    if (path === 'saves') {
      if (method === 'GET') {
        const target = (params.get('user_id') ?? '').slice(3);
        if (target !== me) return json(route, []);
        const row = db.saves.get(target);
        return rows(route, row ? [row] : []);
      }
      if (method === 'POST') {
        if (body.user_id !== me) return fail(route, 'row-level security policy', 403);
        const previous = db.saves.get(body.user_id);
        if (previous) fileSave(previous, 'update');
        db.saves.set(body.user_id, { ...body, updated_at: new Date().toISOString() });
        keysFromOldSave(body.user_id, body.data);
        return rows(route, [db.saves.get(body.user_id)], 201);
      }
      if (method === 'DELETE') {
        const target = (params.get('user_id') ?? '').slice(3);
        if (target !== me) return fail(route, 'row-level security policy', 403);
        const previous = db.saves.get(target);
        if (previous) fileSave(previous, 'erase');
        db.saves.delete(target);
        return json(route, [], 204);
      }
    }
    if (path === 'saves_history') {
      if (schema === 'v1') return fail(route, 'relation "public.saves_history" does not exist', 404);
      if (method === 'GET') {
        const found = db.savesHistory.filter((h) => h.user_id === me);
        const id = (params.get('id') ?? '').slice(3);
        const picked = id ? found.filter((h) => String(h.id) === id) : found;
        picked.sort((x, y) => new Date(y.at) - new Date(x.at));
        return rows(route, picked);
      }
      if (method === 'POST') {
        if (body.user_id !== me) return fail(route, 'row-level security policy', 403);
        fileSave({ user_id: body.user_id, data: body.data }, body.reason ?? 'update');
        return rows(route, [db.savesHistory[db.savesHistory.length - 1]], 201);
      }
    }

    if (['rpc/block_player', 'rpc/unblock_player', 'rpc/file_report', 'rpc/note_filtered', 'rpc/reports_answered', 'rpc/reports_seen', 'blocks'].includes(path) && schema === 'v1') {
      return path === 'blocks' ? noTable(route, path) : fail(route, `function public.${path.slice(4)} does not exist`, 404, 'PGRST202');
    }
    if (path === 'rpc/block_player') {
      if (!body.p_user || body.p_user === me) return fail(route, 'BAD_TARGET', 400, 'P0001');
      if (!db.blocks.some((b) => b.blocker === me && b.blocked === body.p_user)) {
        db.blocks.push({ blocker: me, blocked: body.p_user, created_at: new Date().toISOString() });
      }
      for (let i = db.friendships.length - 1; i >= 0; i--) {
        const f = db.friendships[i];
        if ((f.requester === me && f.addressee === body.p_user) || (f.requester === body.p_user && f.addressee === me)) {
          const [gone] = db.friendships.splice(i, 1);
          db.emitChange('friendships', 'DELETE', null, gone);
        }
      }
      return json(route, null);
    }
    if (path === 'rpc/unblock_player') {
      db.blocks = db.blocks.filter((b) => !(b.blocker === me && b.blocked === body.p_user));
      return json(route, null);
    }
    if (path === 'blocks') {
      return rows(route, db.blocks.filter((b) => b.blocker === me));
    }
    if (path === 'rpc/file_report') {
      const open = db.reports.find((r) => r.reporter === me && r.kind === body.p_kind && r.ref === body.p_ref && r.target === body.p_target && r.status === 'open');
      if (open) return json(route, open.id);
      const row = { id: ++db.seq, reporter: me, kind: body.p_kind, ref: body.p_ref, target: body.p_target, reason: body.p_reason,
        note: body.p_note ?? '', status: 'open', seen_at: null, created_at: new Date().toISOString() };
      db.reports.push(row);
      return json(route, row.id);
    }
    if (path === 'rpc/note_filtered') {
      db.filterHits.push({ user_id: me, scope: body.p_scope, text: body.p_text, at: new Date().toISOString() });
      return json(route, null);
    }
    if (path === 'rpc/reports_answered') {
      return json(route, db.reports.filter((r) => r.reporter === me && r.status !== 'open' && !r.seen_at)
        .map((r) => ({ id: r.id, kind: r.kind, status: r.status, username: db.profiles.get(r.target)?.username ?? null })));
    }
    if (path === 'rpc/reports_seen') {
      for (const r of db.reports) if (r.reporter === me && r.status !== 'open') r.seen_at = r.seen_at ?? new Date().toISOString();
      return json(route, null);
    }

    if (path === 'friendships') {
      if (method === 'GET') {
        return rows(route, db.friendships.filter((f) => f.requester === me || f.addressee === me));
      }
      if (method === 'POST') {
        if (body.requester !== me) return fail(route, 'row-level security policy', 403);
        if (body.requester === body.addressee) return fail(route, 'violates check constraint', 400);
        if (db.friendships.some((f) => f.requester === body.requester && f.addressee === body.addressee)) {
          return fail(route, 'duplicate key value violates unique constraint', 409);
        }
        const row = { id: uuid(), status: 'pending', created_at: new Date().toISOString(), ...body };
        db.friendships.push(row);
        db.emitChange('friendships', 'INSERT', row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const id = (params.get('id') ?? '').slice(3);
        const row = db.friendships.find((f) => f.id === id);
        if (!row || row.addressee !== me) return fail(route, 'row-level security policy', 403);
        const before = { ...row };
        Object.assign(row, body);
        db.emitChange('friendships', 'UPDATE', row, before);
        return rows(route, [row]);
      }
      if (method === 'DELETE') {
        const id = (params.get('id') ?? '').slice(3);
        const at = db.friendships.findIndex((f) => f.id === id);
        if (at < 0) return rows(route, []);
        if (db.friendships[at].requester !== me && db.friendships[at].addressee !== me) {
          return fail(route, 'row-level security policy', 403);
        }
        const [gone] = db.friendships.splice(at, 1);
        db.emitChange('friendships', 'DELETE', null, gone);
        return rows(route, [gone]);
      }
    }

    if (schema === 'v1' && V1_ABSENT_TABLES.includes(path)) return noTable(route, path);

    if (path === 'rpc/message_live') {
      const m = db.messages.find((x) => x.id === body?.p_id && x.sender === me && !x.read_at);
      if (!m) return json(route, false);
      (db.liveFallbacks ??= []).push(m.id);
      db.liveSend(`user:${m.recipient}`, 'message', { type: 'INSERT', row: m });
      return json(route, true);
    }

    if (path === 'messages') {
      if (method === 'GET') {
        let found = db.messages.filter((m) => m.sender === me || m.recipient === me);
        const orParam = params.get('or');
        if (orParam) {
          const ids = [...orParam.matchAll(/(?:sender|recipient)\.eq\.([0-9a-f-]+)/g)].map((m) => m[1]);
          const pair = new Set(ids);
          found = found.filter((m) => pair.has(m.sender) && pair.has(m.recipient));
        }
        if ((params.get('recipient') ?? '').startsWith('eq.')) {
          found = found.filter((m) => m.recipient === params.get('recipient').slice(3));
        }
        const idIn = /^in\.\((.*)\)$/.exec(params.get('id') ?? '');
        if (idIn) {
          const ids = new Set(idIn[1].split(',').map((v) => v.replace(/"/g, '')));
          (db.idReads ??= []).push(...ids);
          found = found.filter((m) => ids.has(m.id));
        }
        if (params.get('read_at') === 'is.null') found = found.filter((m) => !m.read_at);
        if ((params.get('order') ?? '').includes('created_at.desc')) {
          found = [...found].sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
        const limit = Number(params.get('limit') ?? 0);
        if (limit) found = found.slice(0, limit);
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.sender !== me) return fail(route, 'row-level security policy', 403);
        if (!areFriends(body.sender, body.recipient)) return fail(route, 'row-level security policy', 403);
        if (screenText(body.body, 'chat')) return fail(route, 'FILTERED', 400, 'P0001');
        const row = { id: uuid(), read_at: null, created_at: new Date().toISOString(), ...body };
        db.messages.push(row);
        db.emitChange('messages', 'INSERT', row, null, { quiet: route.request().headers()['x-wikster-chat'] === 'inbox' });
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const recipient = (params.get('recipient') ?? '').slice(3);
        if (recipient !== me) return fail(route, 'row-level security policy', 403);
        const sender = (params.get('sender') ?? '').slice(3);
        const changed = [];
        for (const m of db.messages) {
          if (m.recipient !== me) continue;
          if (sender && m.sender !== sender) continue;
          if (params.get('read_at') === 'is.null' && m.read_at) continue;
          const before = { ...m };
          Object.assign(m, body);
          changed.push(m);
          db.emitChange('messages', 'UPDATE', m, before);
        }
        return rows(route, changed);
      }
    }

    if (path === 'showcase_kudos') {
      if (method === 'GET') {
        const owner = (params.get('owner') ?? '').slice(3);
        return rows(route, db.kudos.filter((k) => !owner || k.owner === owner));
      }
      if (method === 'POST') {
        if (body.sender !== me) return fail(route, 'row-level security policy', 403);
        if (!areFriends(body.sender, body.owner)) return fail(route, 'row-level security policy', 403);
        if (db.kudos.some((k) => k.owner === body.owner && k.key === body.key && k.sender === body.sender)) return fail(route, 'duplicate key value violates unique constraint', 409);
        const row = { created_at: new Date().toISOString(), ...body };
        db.kudos.push(row);
        return rows(route, [row], 201);
      }
      if (method === 'DELETE') {
        const sender = (params.get('sender') ?? '').slice(3);
        if (sender !== me) return fail(route, 'row-level security policy', 403);
        const owner = (params.get('owner') ?? '').slice(3);
        const key = (params.get('key') ?? '').slice(3);
        db.kudos = db.kudos.filter((k) => !(k.owner === owner && k.key === key && k.sender === sender));
        return json(route, [], 204);
      }
    }

    if (path === 'deliveries') {
      if (method === 'GET') {
        let found = db.deliveries.filter((d) => d.sender === me || d.recipient === me);
        if ((params.get('recipient') ?? '').startsWith('eq.')) {
          found = found.filter((d) => d.recipient === params.get('recipient').slice(3));
        }
        if (params.get('claimed_at') === 'is.null') found = found.filter((d) => !d.claimed_at);
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.sender !== me) return fail(route, 'row-level security policy', 403);
        if (body.sender !== body.recipient && !areFriends(body.sender, body.recipient)) {
          return fail(route, 'row-level security policy', 403);
        }
        const row = { id: uuid(), claimed_at: null, created_at: new Date().toISOString(), ...body };
        db.deliveries.push(row);
        db.emitChange('deliveries', 'INSERT', row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const id = (params.get('id') ?? '').slice(3);
        const row = db.deliveries.find((d) => d.id === id);
        if (!row || row.recipient !== me) return fail(route, 'row-level security policy', 403);
        Object.assign(row, body);
        return rows(route, [row]);
      }
    }

    if (path === 'trades') {
      if (method === 'GET') {
        let found = db.trades.filter((tr) => tr.proposer === me || tr.recipient === me);
        const statusParam = params.get('status');
        if (statusParam?.startsWith('neq.')) found = found.filter((tr) => tr.status !== statusParam.slice(4));
        if ((params.get('order') ?? '').includes('created_at.desc')) {
          found = [...found].sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.proposer !== me) return fail(route, 'row-level security policy', 403);
        if (!areFriends(body.proposer, body.recipient)) return fail(route, 'row-level security policy', 403);
        const row = { id: uuid(), status: 'pending', resolved_at: null,
          created_at: new Date().toISOString(), ...body };
        db.trades.push(row);
        db.emitChange('trades', 'INSERT', row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const id = (params.get('id') ?? '').slice(3);
        const row = db.trades.find((tr) => tr.id === id);
        if (!row || (row.proposer !== me && row.recipient !== me)) {
          return fail(route, 'row-level security policy', 403);
        }
        const before = { ...row };
        Object.assign(row, body);
        db.emitChange('trades', 'UPDATE', row, before);
        return rows(route, [row]);
      }
    }

    return fail(route, `unstubbed: ${method} ${path}`, 404);
  };
  page.route(`${SUPA_URL}/rest/v1/**`, restRoute);

  const inner = async (route, method, target, payload = null) => {
    const real = route.request();
    let held = null;
    const fake = {
      request: () => ({
        url: () => `${SUPA_URL}/rest/v1/${target}${target.includes('?') ? '&' : '?'}stub-inner=1`,
        method: () => method,
        headers: () => ({ ...real.headers(), accept: 'application/json' }),
        postData: () => (payload == null ? null : JSON.stringify(payload))
      }),
      fulfill: async (res) => { held = res; },
      fallback: async () => { held = { status: 404, body: 'null' }; },
      continue: async () => { held = { status: 404, body: 'null' }; },
      abort: async () => { held = { status: 500, body: 'null' }; }
    };
    await restRoute(fake);
    if (!held || held.status >= 400) return null;
    try { return JSON.parse(held.body ?? 'null'); } catch { return null; }
  };

  async function socialDigest(route, me, parts) {
    const every = parts == null;
    const want = (part) => every || parts.includes(part);
    const out = { at: new Date().toISOString() };
    const enc = encodeURIComponent;
    if (want('me')) out.me = (await inner(route, 'GET', `profiles?select=*&id=eq.${me}`))?.[0] ?? null;
    let friendships = null;
    if (want('friends') || want('wishes')) {
      friendships = (await inner(route, 'GET', `friendships?select=id,requester,addressee,status,created_at&or=${enc(`(requester.eq.${me},addressee.eq.${me})`)}`)) ?? [];
    }
    if (want('friends')) {
      out.friendships = friendships;
      const others = [...new Set(friendships.map((r) => (r.requester === me ? r.addressee : r.requester)))];
      out.people = others.length ? ((await inner(route, 'GET', `profiles?select=*&id=in.(${others.join(',')})`)) ?? [])
        .filter((p) => (p.visibility ?? 'public') !== 'private') : [];
    }
    if (want('social')) {
      out.blocks = (await inner(route, 'GET', `blocks?select=blocked,created_at&blocker=eq.${me}&order=created_at.desc`)) ?? [];
      out.reports = (await inner(route, 'POST', 'rpc/reports_answered', {})) ?? [];
      out.invites = (await inner(route, 'POST', 'rpc/my_guild_invites', {})) ?? [];
      out.unread = (await inner(route, 'GET', `messages?select=id,sender,created_at&recipient=eq.${me}&read_at=is.null`)) ?? [];
      out.trades = ((await inner(route, 'GET', `trades?select=*&or=${enc(`(proposer.eq.${me},recipient.eq.${me})`)}&status=neq.closed&order=created_at.desc&limit=30`)) ?? []).slice(0, 30);
      out.challenges = (await inner(route, 'POST', 'rpc/my_challenges', {})) ?? [];
      const econ = economy?.db;
      out.deliveries = db.deliveries.filter((d) => d.recipient === me && !d.claimed_at).length
        + (econ?.deliveries ?? []).filter((d) => d.recipient === me && !d.claimedAt).length;
      out.grants = db.grants.filter((g) => g.user_id === me && !g.claimed_at).length
        + (econ?.grants ?? []).filter((g) => g.user === me && !g.claimedAt).length;
    }
    if (want('guild')) {
      const g = await inner(route, 'POST', 'rpc/my_guild', {});
      const row = Array.isArray(g) ? g[0] : g;
      out.guild = row?.id ? row : null;
    }
    if (want('notices')) {
      out.suspension = (await inner(route, 'GET', `suspensions?select=reason,until,muted&user_id=eq.${me}`))?.[0] ?? null;
      out.notices = ((await inner(route, 'GET', 'announcements?select=*')) ?? [])
        .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at))).slice(0, 10);
    }
    if (want('wishes')) {
      out.wishes = (await inner(route, 'GET', `wishlists?select=key,card,created_at&owner=eq.${me}&order=created_at.desc&limit=200`)) ?? [];
      const pals = (friendships ?? []).filter((r) => r.status === 'accepted').map((r) => (r.requester === me ? r.addressee : r.requester));
      out.friendWishes = pals.length ? ((await inner(route, 'GET', `wishlists?select=owner,key&owner=in.(${pals.join(',')})&limit=1000`)) ?? [])
        .map((w) => ({ owner: w.owner, key: w.key })) : [];
    }
    return out;
  }

  return db;
}
