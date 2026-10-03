const DURATIONS = [60, 360, 1440, 4320];
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const themeOf = (pack) => {
  const [kind, id] = String(pack ?? '').split('|');
  return kind === 'theme' && id && id !== 'any' ? id : null;
};

export function createMarket(db) {
  db.auctionBids ??= [];
  const m = { econ: null, tuning: { fee: 5, step: 5, maxLots: 20 }, bidSeq: 0, counters: new Map() };
  const name = (id) => db.profiles.get(id)?.username ?? '';
  const shape = (a) => {
    a.rarity ??= a.card?.rarityId ?? 'common';
    a.title ??= a.card?.title ?? a.card?.key ?? '';
    a.theme ??= themeOf(a.card?.packId);
    a.buyout ??= null;
    a.fee_pct ??= 5;
    a.outcome ??= null;
    a.settled_at ??= null;
    a.fee ??= null;
    a.paid ??= null;
    a.bid_count ??= 0;
    return a;
  };
  const floor = (a) => (a.current_bid == null ? a.start_price : a.current_bid + Math.max(1, Math.ceil(a.current_bid * m.tuning.step / 100)));
  const row = (a, me = null) => {
    shape(a);
    const { extract, favorite, ...card } = a.card ?? {};
    return {
      id: a.id, seller: a.seller, seller_name: a.seller_name, card, rarity: a.rarity, title: a.title,
      start_price: a.start_price, current_bid: a.current_bid, buyout: a.buyout, bidder: a.bidder, bidder_name: a.bidder_name,
      bid_count: a.bid_count, floor: floor(a), fee_pct: a.fee_pct, ends_at: a.ends_at, created_at: a.created_at,
      status: a.status, outcome: a.outcome, settled_at: a.settled_at, fee: a.fee, paid: a.paid,
      mine: me != null && a.seller === me, leading: me != null && a.bidder === me
    };
  };
  const shout = (a, type = 'UPDATE') => db.liveSend?.('market', 'auction', { type, row: row(a) });
  const tell = (user, kind, a) => {
    if (!user) return;
    db.liveSend?.(`user:${user}`, 'lot', { kind, id: a.id, title: a.title, rarity: a.rarity, key: a.card?.key,
      amount: a.current_bid ?? a.start_price, paid: a.paid, fee: a.fee });
  };
  const store = (id) => m.econ?.store(id);
  const pay = async (user, amount, reason, detail) => {
    if (!user || !(amount > 0) || !m.econ) return;
    await store(user).apply({ coins: amount, kind: 'market', reason, detail });
  };
  const cardOf = (entry) => {
    const { key, title, rarityId, price, lang, packId, count, prints, ...data } = entry;
    return { key, title: title ?? key, rarityId: rarityId ?? 'common', price: Math.max(0, Math.round(Number(price) || 0)), lang: lang ?? 'en',
      packId: packId ?? null, copies: Math.max(1, Number(count) || 1), data, ...(prints ? { prints } : {}) };
  };
  const give = async (user, a) => {
    if (!user || !m.econ) return;
    await store(user).apply({ add: [cardOf(a.card)] });
  };
  const limit = (user) => {
    const w = Math.floor(Date.now() / 60000);
    const k = `${user}|${w}`;
    const n = (m.counters.get(k) ?? 0) + 1;
    m.counters.set(k, n);
    if (n > 40) fail('SLOW_DOWN');
  };

  async function close(a, outcome = null) {
    shape(a);
    if (a.status !== 'open') return a;
    if (Date.parse(a.ends_at) > Date.now() && outcome !== 'bought') return a;
    if (a.bidder && (a.current_bid ?? 0) > 0) {
      const fee = Math.min(a.current_bid, Math.ceil(a.current_bid * (a.fee_pct ?? 5) / 100));
      await give(a.bidder, a);
      await pay(a.seller, a.current_bid - fee, 'sale', { auction: a.id, fee });
      Object.assign(a, { status: 'settled', outcome: outcome ?? 'sold', settled_at: iso(), fee, paid: a.current_bid - fee });
      if (Date.parse(a.ends_at) > Date.now()) a.ends_at = iso();
      shout(a);
      tell(a.bidder, 'won', a);
      tell(a.seller, 'sold', a);
    } else {
      await give(a.seller, a);
      Object.assign(a, { status: 'settled', outcome: 'unsold', settled_at: iso(), fee: 0, paid: 0 });
      shout(a);
      tell(a.seller, 'expired', a);
    }
    return a;
  }

  async function sweep(max = 50) {
    let n = 0;
    for (const a of db.auctions) {
      if (n >= max) break;
      if (a.status === 'open' && Date.parse(a.ends_at) <= Date.now()) { await close(a); n++; }
    }
    return n;
  }

  async function list(user, { p_key, p_rarity, p_start, p_buyout, p_minutes }) {
    limit(user);
    if (!DURATIONS.includes(Number(p_minutes))) fail('BAD_DURATION');
    if (!(p_start >= 1 && p_start <= 1000000)) fail('BAD_PRICE');
    if (p_buyout != null && (p_buyout < p_start || p_buyout > 1000000)) fail('BAD_BUYOUT');
    if (db.auctions.filter((a) => a.seller === user && a.status === 'open').length >= m.tuning.maxLots) fail('TOO_MANY');
    const done = await store(user).apply({ remove: [{ key: p_key, copies: 1, ...(p_rarity ? { rarityId: p_rarity } : {}) }] });
    const took = done.removed[0];
    const { data, copies, ...rest } = took;
    const card = { ...(data ?? {}), ...rest, count: 1 };
    const a = shape({
      id: `00000000-0000-4000-a000-${String(++db.seq).padStart(12, '0')}`, seller: user, seller_name: name(user), card,
      start_price: p_start, buyout: p_buyout ?? null, current_bid: null, bidder: null, bidder_name: null, bid_count: 0,
      ends_at: iso(Date.now() + p_minutes * 60000), minutes: p_minutes, status: 'open', created_at: iso(),
      rarity: card.rarityId ?? 'common', title: card.title ?? p_key, theme: themeOf(card.packId), fee_pct: m.tuning.fee
    });
    db.auctions.push(a);
    shout(a, 'INSERT');
    return { ok: true, lot: row(a, user) };
  }

  async function bid(user, { p_id, p_amount = null, p_buyout = false }) {
    limit(user);
    const a = db.auctions.find((x) => x.id === p_id);
    if (!a) fail('NOT_FOUND');
    shape(a);
    if (a.status !== 'open') return { error: 'ENDED', lot: row(a, user) };
    if (Date.parse(a.ends_at) <= Date.now()) { await close(a); return { error: 'ENDED', lot: row(a, user) }; }
    if (a.seller === user) fail('OWN_AUCTION');
    if (a.bidder === user) fail('LEADING');
    let amount;
    let buy = false;
    if (p_buyout) {
      if (a.buyout == null || (a.current_bid ?? 0) >= a.buyout) fail('NO_BUYOUT');
      amount = a.buyout;
      buy = true;
    } else {
      if (p_amount == null || p_amount < floor(a)) return { error: 'TOO_LOW', lot: row(a, user) };
      amount = p_amount;
      if (a.buyout != null && amount >= a.buyout && (a.current_bid ?? 0) < a.buyout) { amount = a.buyout; buy = true; }
    }
    if (m.econ) await store(user).apply({ coins: -amount, kind: 'market', reason: buy ? 'buyout' : 'bid', detail: { auction: a.id } });
    const prev = a.bidder;
    const prevBid = a.current_bid;
    if (prev && prevBid > 0) await pay(prev, prevBid, 'refund', { auction: a.id });
    db.auctionBids.push({ id: ++m.bidSeq, auction: a.id, bidder: user, bidder_name: name(user), amount, buyout: buy, at: iso() });
    Object.assign(a, { current_bid: amount, bidder: user, bidder_name: name(user), bid_count: a.bid_count + 1 });
    if (!buy && Date.parse(a.ends_at) - Date.now() < 60000) a.ends_at = iso(Date.now() + 60000);
    shout(a);
    if (prev) tell(prev, 'outbid', a);
    if (buy) await close(a, 'bought');
    return { ok: true, lot: row(a, user), bought: buy, paid: amount };
  }

  async function cancel(user, { p_id }) {
    limit(user);
    const a = db.auctions.find((x) => x.id === p_id);
    if (!a) fail('NOT_FOUND');
    shape(a);
    if (a.seller !== user) fail('NOT_YOURS');
    if (a.status !== 'open') return { error: 'ENDED', lot: row(a, user) };
    if (Date.parse(a.ends_at) <= Date.now()) { await close(a); return { error: 'ENDED', lot: row(a, user) }; }
    if (a.bidder) fail('HAS_BIDS');
    await give(user, a);
    Object.assign(a, { status: 'cancelled', outcome: 'cancelled', settled_at: iso() });
    shout(a);
    return { ok: true, lot: row(a, user) };
  }

  m.p2p = async (user, fn, args) => {
    if (fn === 'market_list') return list(user, args);
    if (fn === 'market_bid') return bid(user, args);
    if (fn === 'market_cancel') return cancel(user, args);
    fail('UNKNOWN_P2P');
  };

  m.browse = async (me, filter = {}, sort = 'ending', limitN = 24, offset = 0) => {
    await sweep(10);
    const f = filter ?? {};
    const rar = Array.isArray(f.rarity) ? f.rarity : f.rarity ? [f.rarity] : null;
    const q = String(f.q ?? '').trim().toLowerCase();
    const now = Date.now();
    let rows = db.auctions.map(shape).filter((a) => a.status === 'open' && Date.parse(a.ends_at) > now)
      .filter((a) => !rar?.length || rar.includes(a.rarity))
      .filter((a) => !f.theme || (a.theme ?? 'wild') === f.theme)
      .filter((a) => !(f.min > 0) || (a.current_bid ?? a.start_price) >= f.min)
      .filter((a) => !(f.max > 0) || (a.current_bid ?? a.start_price) <= f.max)
      .filter((a) => !f.buyout || (a.buyout != null && (a.current_bid ?? 0) < a.buyout))
      .filter((a) => !f.soon || Date.parse(a.ends_at) <= now + 3600000)
      .filter((a) => !f.others || a.seller !== me)
      .filter((a) => !q || String(a.title ?? '').toLowerCase().includes(q));
    const key = {
      ending: (a) => Date.parse(a.ends_at), newest: (a) => -Date.parse(a.created_at), price: (a) => a.current_bid ?? a.start_price,
      price_desc: (a) => -(a.current_bid ?? a.start_price), bids: (a) => -a.bid_count
    }[sort] ?? ((a) => Date.parse(a.ends_at));
    rows = rows.sort((x, y) => key(x) - key(y) || Date.parse(x.ends_at) - Date.parse(y.ends_at));
    return { total: rows.length, now: iso(), rows: rows.slice(offset, offset + limitN).map((a) => row(a, me)) };
  };

  m.lot = async (me, id) => {
    const a = db.auctions.find((x) => x.id === id);
    if (!a) fail('NOT_FOUND');
    shape(a);
    if (a.status === 'open' && Date.parse(a.ends_at) <= Date.now()) await close(a);
    return {
      ...row(a, me), card: clone(a.card), now: iso(),
      bids: db.auctionBids.filter((b) => b.auction === a.id).sort((x, y) => y.id - x.id).slice(0, 20)
        .map((b) => ({ name: b.bidder_name, amount: b.amount, buyout: b.buyout, at: b.at, me: b.bidder === me })),
      sales: db.auctions.filter((s) => s.id !== a.id && s.card?.key === a.card?.key && ['sold', 'bought'].includes(s.outcome))
        .slice(-5).reverse().map((s) => ({ price: s.current_bid, rarity: s.rarity, at: s.settled_at }))
    };
  };

  m.mine = async (me, view = 'selling', limitN = 30, offset = 0) => {
    await sweep(10);
    const bidOn = (a) => db.auctionBids.some((b) => b.auction === a.id && b.bidder === me);
    const all = db.auctions.map(shape);
    const roleOf = (a) => {
      if (a.status === 'open') return a.seller === me ? 'selling' : a.bidder === me ? 'leading' : 'outbid';
      if (a.seller === me) return { sold: 'sold', bought: 'sold', unsold: 'expired' }[a.outcome] ?? (a.outcome ?? 'cancelled');
      return a.bidder === me && ['sold', 'bought'].includes(a.outcome) ? 'won' : 'lost';
    };
    let rows = all.filter((a) => (view === 'selling' ? a.seller === me && a.status === 'open'
      : view === 'bidding' ? a.status === 'open' && a.seller !== me && (a.bidder === me || bidOn(a))
        : a.status !== 'open' && (a.seller === me || a.bidder === me || bidOn(a))));
    rows = view === 'history'
      ? rows.sort((x, y) => Date.parse(y.settled_at ?? y.ends_at) - Date.parse(x.settled_at ?? x.ends_at))
      : rows.sort((x, y) => Date.parse(x.ends_at) - Date.parse(y.ends_at));
    return {
      total: rows.length, now: iso(),
      counts: {
        selling: all.filter((a) => a.seller === me && a.status === 'open').length,
        leading: all.filter((a) => a.bidder === me && a.status === 'open').length,
        outbid: all.filter((a) => a.status === 'open' && a.seller !== me && a.bidder !== me && bidOn(a)).length
      },
      rows: rows.slice(offset, offset + limitN).map((a) => ({ ...row(a, me), role: roleOf(a) }))
    };
  };

  m.prices = async (key, rarity = null) => ({
    sales: db.auctions.filter((s) => s.card?.key === key && ['sold', 'bought'].includes(s.outcome)).slice(-8).reverse()
      .map((s) => ({ price: s.current_bid, rarity: s.rarity, at: s.settled_at })),
    open: (() => {
      const open = db.auctions.filter((a) => a.status === 'open' && a.card?.key === key && (!rarity || a.rarity === rarity));
      return open.length ? Math.min(...open.map((a) => a.current_bid ?? a.start_price)) : null;
    })()
  });

  m.sweep = sweep;
  m.close = close;
  m.row = row;
  return m;
}
