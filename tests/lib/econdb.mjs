import * as R from '../../src/econ/rules.js';
import { screenText } from '../../src/wordfilter.js';

const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic', 'special'];
const rank = (id) => RANK.indexOf(String(id ?? '').toLowerCase()) + 1;
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const rowCard = (row) => ({ rarityId: row.rarity_id, count: row.copies, prints: row.prints, price: row.price });

export function createEconDb() {
  const users = new Map();
  const pulls = new Map();
  let seq = 0;
  const db = {
    users, pulls, cutover: Date.now() + 365 * 86400000, legacy: new Map(), born: new Map(),
    quests: new Map(), challenges: new Map(), guildGoal: new Map(), guildMatch: new Map(), grants: [],
    deliveries: [], friends: new Set(), scores: [], codex: new Map(), blockedHosts: new Set(), meta: new Map(), applies: 0,
    live: { tuning: {}, events: [], packs: [], stock: {} }, codes: new Map(), codeUses: [], overrides: new Map(), stock: new Map()
  };
  let useSeq = 0;
  const codeFail = (code) => { const e = new Error(code); e.code = code; throw e; };
  const stockLimit = (item) => {
    const m = /^live\|(?:event:(.+)|(pack-.+))$/.exec(item);
    if (!m) return null;
    if (m[1]) {
      const n = Number(db.live.events?.find((e) => e.id === m[1])?.params?.stock);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
    const n = Number(db.live.packs?.find((p) => p.id === m[2])?.limited_stock);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const restock = () => { db.live = { ...db.live, stock: Object.fromEntries(db.stock) }; };
  const friends = (a, b) => db.friends.has(`${a}|${b}`) || db.friends.has(`${b}|${a}`);

  function mark(id, item) {
    if (item.kind === 'quest') {
      const q = db.quests.get(`${id}|${item.day}|${item.id}`);
      if (!q || q.claimed || q.progress < q.target) return false;
      return () => { q.claimed = true; };
    }
    if (item.kind === 'challenge') {
      const c = db.challenges.get(item.id);
      if (!c || c.status !== 'done' || ![c.challenger, c.opponent].includes(id) || c.claimed.includes(id)) return false;
      return () => { c.claimed.push(id); };
    }
    if (item.kind === 'guildGoal' || item.kind === 'guildMatch') {
      const g = (item.kind === 'guildGoal' ? db.guildGoal : db.guildMatch).get(id);
      const ok = g && g.week === item.week && !g.claimed && (item.kind === 'guildGoal' ? g.done : g.won);
      return ok ? () => { g.claimed = true; } : false;
    }
    if (item.kind === 'delivery') {
      const d = db.deliveries.find((x) => x.id === item.id && x.recipient === id && !x.claimedAt);
      return d ? () => { d.claimedAt = Date.now(); } : false;
    }
    if (item.kind === 'grantFail') {
      const r = db.grants.find((x) => x.id === item.id && x.user === id && !x.claimedAt);
      return () => { if (r) { r.claimedAt = Date.now(); r.failedAt = Date.now(); } };
    }
    if (item.kind === 'grant') {
      const r = db.grants.find((x) => x.id === item.id && x.user === id && !x.claimedAt);
      return r ? () => { r.claimedAt = Date.now(); } : false;
    }
    throw new Error('BAD_MARK');
  }

  const user = (id) => {
    if (!users.has(id)) {
      users.set(id, { wallet: { coins: 0, ink: 0 }, state: {}, inventory: new Map(), cards: new Map(), claims: new Set(), custom: new Map(), ledger: [], gone: new Map() });
    }
    return users.get(id);
  };

  function apply(id, ops) {
    db.applies++;
    const live = user(id);
    const draft = {
      wallet: { ...live.wallet }, state: clone(live.state), inventory: new Map(clone([...live.inventory])),
      cards: new Map(clone([...live.cards])), claims: new Set(live.claims), ledger: [...live.ledger], gone: new Map(live.gone)
    };
    const at = Date.now();
    for (const k of ops.claims ?? []) {
      if (draft.claims.has(k)) throw new Error('ALREADY_CLAIMED');
      draft.claims.add(k);
    }
    const marks = (ops.marks ?? []).map((item) => mark(id, item) || (() => { throw new Error('NOT_CLAIMABLE'); })());
    if (ops.rev !== undefined && (Number(draft.state.rev) || 0) !== Number(ops.rev)) throw new Error('CONFLICT');
    let claimedPull = null;
    if (ops.pull) {
      const p = pulls.get(ops.pull);
      if (!p || p.user !== id || p.claimedAt) throw new Error('NO_PULL');
      claimedPull = p;
    }
    const consumed = (ops.consume ?? []).map((n) => {
      const p = pulls.get(n);
      if (!p || p.user !== id || p.claimedAt) throw new Error('NO_PULL');
      return p;
    });
    draft.wallet.coins += Number(ops.coins ?? 0);
    draft.wallet.ink += Number(ops.ink ?? 0);
    if (draft.wallet.coins < 0 || draft.wallet.ink < 0) throw new Error('INSUFFICIENT_FUNDS');
    for (const item of ops.inventory ?? []) {
      const n = Number(item.delta) || 0;
      const slot = draft.inventory.get(item.spec_id);
      if (n > 0) draft.inventory.set(item.spec_id, { spec: slot?.spec ?? clone(item.spec), count: (slot?.count ?? 0) + n });
      else if (n < 0) {
        if (!slot || slot.count < -n) throw new Error('NOT_HELD');
        if (slot.count === -n) draft.inventory.delete(item.spec_id);
        else slot.count += n;
      }
    }
    const removed = [];
    for (const item of ops.remove ?? []) {
      const n = Math.max(1, Number(item.copies) || 1);
      const row = draft.cards.get(item.key);
      if (!row || row.copies < n) throw new Error('NOT_OWNED');
      if (row.data?.special && !item.force) throw new Error('LOCKED');
      const card = rowCard(row);
      const best = R.bestPrint(R.printsOf(card));
      const took = R.takePrints(card, n, item.rarityId ?? null);
      if (!took) throw new Error('NOT_OWNED');
      const kinds = Object.keys(took.taken);
      const rid = kinds.length === 1 ? kinds[0] : best;
      removed.push({ key: row.article_key, title: row.title, rarityId: rid, price: R.printPrice(row.price, best, rid), lang: row.lang, packId: row.pack_id, copies: n, data: clone(row.data), ...(kinds.length > 1 ? { prints: took.taken } : {}) });
      if (row.copies === n) { draft.cards.delete(item.key); draft.gone.set(item.key, at); }
      else {
        row.copies -= n;
        row.last_at = at;
        const left = R.bestPrint(took.prints);
        if (left !== best) { row.price = R.printPrice(row.price, best, left); row.rarity_id = left; }
        row.prints = took.prints;
      }
    }
    for (const item of ops.add ?? []) {
      const row = draft.cards.get(item.key);
      const incoming = {
        article_key: item.key, title: item.title ?? item.key, rarity_id: item.rarityId ?? 'common',
        price: Math.max(0, Number(item.price) || 0), copies: Math.max(1, Number(item.copies) || 1),
        lang: item.lang ?? 'en', pack_id: item.packId ?? null, origin: item.origin ?? 'pull', data: clone(item.data ?? {}), favorite: false, last_at: at
      };
      const more = R.printsOf({ rarityId: incoming.rarity_id, count: incoming.copies, prints: item.prints });
      if (!row) { draft.cards.set(item.key, { ...incoming, prints: more }); continue; }
      const up = rank(incoming.rarity_id) > rank(row.rarity_id);
      row.prints = R.addPrints(R.printsOf(rowCard(row)), more);
      row.copies += incoming.copies;
      row.last_at = at;
      if (up) { row.rarity_id = incoming.rarity_id; row.price = incoming.price; row.data = { ...row.data, ...incoming.data }; }
      else {
        if (item.reprice !== undefined) row.price = Math.max(0, Number(item.reprice) || 0);
        row.data = { ...incoming.data, ...row.data };
      }
    }
    for (const item of ops.patch ?? []) {
      const row = draft.cards.get(item.key);
      if (!row) continue;
      row.last_at = at;
      if (item.data) row.data = { ...row.data, ...item.data };
      if (item.title !== undefined) row.title = item.title;
      if (item.favorite !== undefined) row.favorite = Boolean(item.favorite);
    }
    if (ops.state) draft.state = { ...draft.state, ...clone(ops.state) };
    if ((ops.coins || ops.ink || ops.kind) && !(ops.kind === 'open' && !ops.coins && !ops.ink)) draft.ledger.push({ at: Date.now(), kind: ops.kind ?? 'change', coins: ops.coins ?? 0, ink: ops.ink ?? 0, reason: ops.reason ?? null, detail: ops.detail ?? null });
    live.wallet = draft.wallet;
    live.state = draft.state;
    live.inventory = draft.inventory;
    live.cards = draft.cards;
    live.claims = draft.claims;
    live.ledger = draft.ledger;
    live.gone = draft.gone;
    if (claimedPull) {
      claimedPull.claimedAt = Date.now();
      if (Array.isArray(ops.pullCards)) claimedPull.cards = clone(ops.pullCards);
    }
    for (const p of consumed) p.claimedAt = Date.now();
    if (ops.pull) {
      for (const item of ops.add ?? []) {
        if (item.key && !/^(custom|code)\|/.test(String(item.packId ?? '')) && !db.codex.has(item.key)) db.codex.set(item.key, { title: item.title, rarity: item.rarityId, by: id });
      }
    }
    if (ops.score && Number(ops.score.points) > 0) {
      const at = db.scores.findIndex((r) => r.user === id && r.game === ops.score.game && r.day === ops.score.day);
      if (at < 0) db.scores.push({ user: id, ...ops.score });
      else if (ops.score.game !== 'wikdle' && ops.score.points > db.scores[at].points) db.scores[at].points = ops.score.points;
    }
    for (const done of marks) done();
    return { coins: live.wallet.coins, ink: live.wallet.ink, removed };
  }

  db.store = (id) => ({
    async load() {
      const u = user(id);
      return {
        wallet: { ...u.wallet },
        state: clone(u.state),
        inventory: Object.fromEntries([...u.inventory].map(([k, v]) => [k, clone(v)])),
        custom: [...u.custom.values()].map((row) => ({ def: clone(row.def) })),
        born: db.born.get(id) ?? Date.now(),
        cutover: db.cutover
      };
    },
    async cards(keys) {
      const u = user(id);
      const rows = keys == null ? [...u.cards.values()] : keys.map((k) => u.cards.get(k)).filter(Boolean);
      return clone(rows);
    },
    async apply(ops) { return apply(id, clone(ops)); },
    async cardsSince(since) {
      const u = user(id);
      const rows = [...u.cards.values()].filter((row) => (row.last_at ?? 0) > since);
      const gone = [...u.gone].filter(([k, t]) => t > since && !u.cards.has(k)).map(([k]) => k);
      return { rows: clone(rows), gone };
    },
    async blockedHosts() { return [...db.blockedHosts]; },
    async account() { return clone(db.meta.get(id) ?? {}); },
    async waiting(specId, skip = []) {
      for (const [nonce, p] of pulls) if (p.user === id && p.specId === specId && !p.claimedAt && !skip.includes(nonce)) return { nonce, cards: clone(p.cards) };
      return null;
    },
    async firstWaiting(specId) {
      for (const [nonce, p] of pulls) if (p.user === id && p.specId === specId && !p.claimedAt) return nonce;
      return null;
    },
    async waitingList() {
      return [...pulls].filter(([, p]) => p.user === id && !p.claimedAt).map(([nonce, p]) => ({ nonce, specId: p.specId }));
    },
    async pullCards(nonces) {
      return nonces.map((nonce) => pulls.get(nonce)).map((p, i) => (p && p.user === id ? { nonce: nonces[i], cards: clone(p.cards) } : null)).filter(Boolean);
    },
    async stash({ specId, spec, cards, nonce: wanted = null }) {
      if (wanted && pulls.has(wanted)) return pulls.get(wanted).user === id ? wanted : null;
      const nonce = wanted ?? `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
      pulls.set(nonce, { user: id, specId, spec: clone(spec), cards: clone(cards), claimedAt: null });
      return nonce;
    },
    async dropPulls(nonces) {
      for (const nonce of nonces) { const p = pulls.get(nonce); if (p && p.user === id && !p.claimedAt) pulls.delete(nonce); }
    },
    async pullByNonce(nonce) {
      const p = pulls.get(nonce);
      if (!p || p.user !== id) return null;
      return { nonce, specId: p.specId, spec: clone(p.spec), cards: clone(p.cards), claimed: Boolean(p.claimedAt) };
    },
    async facts(kind, args = {}) {
      if (kind === 'quest') {
        const q = db.quests.get(`${id}|${args.day}|${args.id}`);
        return q ? { day: args.day, id: args.id, progress: q.progress, target: q.target, claimed: q.claimed } : null;
      }
      if (kind === 'challenge') {
        const c = db.challenges.get(args.id);
        if (!c || ![c.challenger, c.opponent].includes(id)) return null;
        const side = c.challenger === id ? 'challenger' : 'opponent';
        const outcome = c.winner == null ? null : c.winner === 'draw' ? 'draw' : c.winner === side ? 'win' : 'lose';
        return { status: c.status, outcome, claimed: c.claimed.includes(id) };
      }
      if (kind === 'guildGoal' || kind === 'guildMatch') {
        const g = (kind === 'guildGoal' ? db.guildGoal : db.guildMatch).get(id);
        return g ? clone(g) : null;
      }
      if (kind === 'deliveries') {
        return db.deliveries.filter((d) => d.recipient === id && !d.claimedAt)
          .map((d) => ({ id: d.id, sender: d.sender, kind: d.kind, payload: clone(d.payload), note: d.note ?? null }));
      }
      if (kind === 'grants') {
        return db.grants.filter((r) => r.user === id && !r.claimedAt)
          .map((r) => ({ id: r.id, kind: r.kind, payload: clone(r.payload), note_en: r.note_en ?? '', note_fr: r.note_fr ?? '' }));
      }
      if (kind === 'launch') {
        if (db.noLaunch) return null;
        db.launchFacts = (db.launchFacts ?? 0) + 1;
        const day = String(args.day ?? '');
        const quests = [...db.quests].filter(([k]) => k.startsWith(`${id}|${day}|`))
          .map(([k, q]) => ({ quest_id: k.split('|')[2], target: q.target, progress: q.progress, claimed: q.claimed, expires_at: new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString() }))
          .sort((a, b) => a.quest_id.localeCompare(b.quest_id));
        return {
          grants: db.grants.filter((r) => r.user === id && !r.claimedAt)
            .map((r) => ({ id: r.id, kind: r.kind, payload: clone(r.payload), note_en: r.note_en ?? '', note_fr: r.note_fr ?? '' })),
          deliveries: db.deliveries.filter((d) => d.recipient === id && !d.claimedAt)
            .map((d) => ({ id: d.id, sender: d.sender, kind: d.kind, payload: clone(d.payload), note: d.note ?? null })),
          quests
        };
      }
      return null;
    },
    async wipe(scope, claim = null, coins = 0) {
      const u = user(id);
      if (!['cards', 'all'].includes(scope)) throw new Error('BAD_SCOPE');
      if (claim) {
        if (u.claims.has(claim)) throw new Error('ALREADY_CLAIMED');
        u.claims.add(claim);
      }
      const rev = (Number(u.state.rev) || 0) + 1;
      const at = Date.now();
      const extra = db.onErase ? await db.onErase(id, scope, at) : null;
      for (const [k, row] of u.cards) if (scope === 'all' || !row.data?.special) u.gone.set(k, at);
      if (scope === 'all') {
        const sup = Array.isArray(u.state.owned?.supporter) && u.state.owned.supporter.length ? u.state.owned.supporter : null;
        u.cards = new Map();
        u.inventory = new Map();
        for (const [nonce, p] of pulls) if (p.user === id && !p.claimedAt) pulls.delete(nonce);
        u.custom = new Map();
        u.wallet = { coins: 0, ink: 0 };
        u.state = { imported: true, rev, wiped: { at, scope },
          ...(sup ? { owned: { supporter: sup, themes: (u.state.owned?.themes ?? []).filter((x) => ['folio', 'gilded'].includes(x)) } } : {}) };
        for (const k of [...u.claims]) if (k === 'starter' || /^(level|medal|ach):/.test(k)) u.claims.delete(k);
      } else {
        for (const [k, row] of [...u.cards]) if (!row.data?.special) u.cards.delete(k);
        for (const [k, slot] of [...u.inventory]) if (slot.spec?.kind !== 'code') u.inventory.delete(k);
        for (const [nonce, p] of pulls) if (p.user === id && !p.claimedAt && p.spec?.kind !== 'code') pulls.delete(nonce);
        u.wallet = { ...u.wallet, coins: Math.max(0, Number(coins) || 0) };
        u.state = { ...u.state, rev, wiped: { at, scope } };
      }
      u.ledger.push({ at, kind: 'wipe', coins: 0, ink: 0, reason: scope, detail: null });
      return { ok: true, scope, at, ...(extra ?? {}) };
    },
    async p2p(fn, args) {
      if (db.market && /^market_/.test(fn)) return clone(await db.market.p2p(id, fn, clone(args)));
      if (fn !== 'gift') throw new Error(`econdb: ${fn} is covered by the SQL tests`);
      if (!friends(id, args.p_to)) throw new Error('NOT_FRIENDS');
      const u = user(id);
      let payload;
      if (args.p_kind === 'card') {
        const row = u.cards.get(args.p_ref);
        if (!row) throw new Error('NOT_OWNED');
        if (row.data?.special) throw new Error('LOCKED');
        const card = rowCard(row);
        const best = R.bestPrint(R.printsOf(card));
        const took = R.takePrints(card, 1, null);
        const rid = Object.keys(took.taken)[0];
        payload = { ...clone(row.data), key: row.article_key, title: row.title, rarityId: rid, price: R.printPrice(row.price, best, rid), lang: row.lang, packId: row.pack_id, count: 1 };
        if (row.copies === 1) { u.cards.delete(args.p_ref); u.gone.set(args.p_ref, Date.now()); }
        else {
          row.copies -= 1;
          row.last_at = Date.now();
          const left = R.bestPrint(took.prints);
          if (left !== best) { row.price = R.printPrice(row.price, best, left); row.rarity_id = left; }
          row.prints = took.prints;
        }
      } else {
        const slot = u.inventory.get(args.p_ref);
        if (!slot || slot.count < 1) throw new Error('NOT_HELD');
        if (slot.count === 1) u.inventory.delete(args.p_ref); else slot.count -= 1;
        payload = { spec: clone(slot.spec), spec_id: args.p_ref, count: 1 };
      }
      const row = { id: `d-${++seq}`, sender: id, recipient: args.p_to, kind: args.p_kind, payload, note: args.p_note, claimedAt: null };
      db.deliveries.push(row);
      return clone(row);
    },
    async redeemCode(code) {
      const c = db.codes.get(code);
      const now = Date.now();
      if (!c || (c.starts_at && Date.parse(c.starts_at) > now)) codeFail('UNKNOWN_CODE');
      if (Array.isArray(c.allowed) && !c.allowed.includes(id)) codeFail('UNKNOWN_CODE');
      if (c.disabled || (c.expires_at && Date.parse(c.expires_at) <= now)) codeFail('CODE_EXPIRED');
      const all = db.codeUses.filter((u) => u.code === code);
      const mine = all.filter((u) => u.user === id).length;
      if (mine >= (c.per_user ?? 1)) codeFail('ALREADY_CLAIMED');
      if (c.max_uses != null && all.length >= c.max_uses) codeFail('CODE_USED_UP');
      const use = ++useSeq;
      db.codeUses.push({ id: use, code, user: id, at: now });
      return { code, items: clone(c.items ?? []), special: clone(c.special ?? null), legacy: clone(c.legacy ?? null), use, n: mine + 1 };
    },
    async codeDefs(ids) {
      const redeemed = users.get(id)?.state?.codesRedeemed ?? {};
      const want = new Set((ids ?? []).filter((x) => Number(redeemed[x]) > 0));
      return [...db.codes.values()].map((c) => c.legacy).filter((def) => def && want.has(def.id)).map(clone);
    },
    async redeemRelease(use) {
      const at = db.codeUses.findIndex((u) => u.id === use);
      if (at >= 0) db.codeUses.splice(at, 1);
    },
    async stockTake(item) {
      const limit = stockLimit(item);
      const sold = db.stock.get(item) ?? 0;
      if (limit != null && sold >= limit) codeFail('SOLD_OUT');
      db.stock.set(item, sold + 1);
      restock();
      return sold + 1;
    },
    async stockGive(item) {
      db.stock.set(item, Math.max(0, (db.stock.get(item) ?? 0) - 1));
      restock();
    },
    async overrides(keys) {
      return keys.map((k) => db.overrides.get(k)).filter(Boolean).map(clone);
    },
    async legacy() { return clone(db.legacy.get(id) ?? null); },
    async customPut(def) {
      if (screenText(def?.name ?? '', def?.wiki?.mature === true ? 'adultPack' : 'pack')) throw Object.assign(new Error('NAME_REFUSED'), { code: 'NAME_REFUSED' });
      user(id).custom.set(def.id, { def: clone(def), at: ++seq });
    },
    async customDrop(customId) { user(id).custom.delete(customId); }
  });

  return db;
}
