import { RARITIES, normalizeRarityId, rarityRank } from './data/rarities.js';
import { PITY_RANK, bestPrint, collectionValue, pityLeft, pityLimit, printsOf } from './econ/rules.js';
import { albumCompleteEdition, albumEditionClaimed } from './albums.js';
import { streakAlive } from './daily.js';
import { seasonAt } from './season.js';
import { DAY_MS, utcDay, utcDayIndex, utcWeekIndex } from './days.js';
import { SEASONS } from './data/seasons.js';

export const SPARK_WEEKS = 12;

export const BOOSTER_KINDS = [
  ['theme', 'opens_theme'],
  ['open', 'opens_open'],
  ['custom', 'opens_custom'],
  ['timed', 'opens_timed'],
  ['today', 'opens_today'],
  ['season', 'opensSeason'],
  ['code', 'opens_code']
];

const num = (v) => Math.max(0, Number(v) || 0);
const whole = (v) => Math.round(num(v));

function weekSeries(now, add) {
  const week = utcWeekIndex(now);
  const out = new Array(SPARK_WEEKS).fill(0);
  add((w, n) => {
    const i = SPARK_WEEKS - 1 - (week - w);
    if (i >= 0 && i < SPARK_WEEKS) out[i] += n;
  });
  return out;
}

function collectionPart({ profile, entries, albums, now }) {
  const byPrint = Object.fromEntries(RARITIES.map((r) => [r.id, 0]));
  let copies = 0;
  let best = null;
  let favorites = 0;
  let specials = 0;
  let customs = 0;
  for (const e of entries) {
    const prints = printsOf(e);
    for (const [id, n] of Object.entries(prints)) {
      const k = normalizeRarityId(id);
      if (k in byPrint) byPrint[k] += n;
    }
    copies += Math.max(1, whole(e.count) || 1);
    if (e.favorite) favorites++;
    if (e.special) { specials++; continue; }
    if (String(e.packId ?? '').startsWith('custom')) customs++;
    const top = bestPrint(prints);
    const at = Number(e.firstPulledAt) || null;
    if (!best || rarityRank(top) > rarityRank(best.rarityId)
      || (rarityRank(top) === rarityRank(best.rarityId) && num(e.price) > best.price)) {
      best = { rarityId: top, key: e.key, title: e.title ?? e.key, price: num(e.price), at };
    }
  }
  const list = Array.isArray(albums) ? albums : [];
  const family = (id, kinds) => {
    const of = list.filter((a) => kinds.includes(a.kind));
    const started = of.filter((a) => a.owned > 0);
    const known = of.filter((a) => a.total != null && a.total > 0 && a.kind !== 'wild' && a.kind !== 'custom');
    const owned = of.reduce((s, a) => s + (a.owned ?? 0), 0);
    const knownOwned = known.reduce((s, a) => s + Math.min(a.owned ?? 0, a.total), 0);
    const total = known.reduce((s, a) => s + a.total, 0);
    return {
      id, albums: of.length, started: started.length, owned,
      complete: of.filter((a) => a.complete).length,
      knownOwned, total, pct: total > 0 ? knownOwned / total : null
    };
  };
  const families = [family('theme', ['theme']), family('code', ['code']), family('custom', ['custom']), family('wild', ['wild'])]
    .filter((f) => f.albums > 0 && (f.id === 'theme' || f.owned > 0));
  const counted = families.filter((f) => f.total > 0);
  const knownTotal = counted.reduce((s, f) => s + f.total, 0);
  const tiered = list.filter((a) => a.kind !== 'code');
  return {
    copies,
    unique: entries.length,
    value: collectionValue(entries),
    favorites,
    specials,
    customs,
    byPrint,
    best,
    albums: {
      started: list.filter((a) => a.owned > 0).length,
      complete: list.filter((a) => a.complete).length,
      editions: tiered.filter((a) => albumEditionClaimed(profile, a) || albumCompleteEdition(a)).length,
      medals: Object.values(profile.albumTiers ?? {}).reduce((s, n) => s + whole(n), 0)
    },
    families,
    completion: knownTotal > 0 ? counted.reduce((s, f) => s + f.knownOwned, 0) / knownTotal : null,
    newPerWeek: weekSeries(now, (add) => {
      for (const e of entries) {
        const at = Number(e.firstPulledAt);
        if (Number.isFinite(at) && at > 0) add(utcWeekIndex(at), 1);
      }
    })
  };
}

function boostersPart({ profile, now }) {
  const rc = profile.rarityCounts ?? {};
  const ledger = profile.ledger ?? {};
  const ps = profile.pullStats && typeof profile.pullStats === 'object' ? profile.pullStats : null;
  const today = utcDay(now);
  const week = utcWeekIndex(now);
  const weeks = Array.isArray(ps?.w) ? ps.w.filter((w) => Array.isArray(w)) : [];
  const thisWeek = weeks.find((w) => w[0] === week);
  const dry = whole(profile.pity);
  const limit = Math.max(1, whole(pityLimit()) || 40);
  return {
    opened: whole(profile.boostersOpened),
    cards: Object.values(rc).reduce((s, n) => s + whole(n), 0),
    legendaryPlus: RARITIES.filter((r) => rarityRank(r.id) >= PITY_RANK).reduce((s, r) => s + whole(rc[r.id]), 0),
    byRarity: Object.fromEntries(RARITIES.map((r) => [r.id, whole(rc[r.id])])),
    kinds: BOOSTER_KINDS.map(([id, key]) => [id, whole(ledger[key])]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]),
    pity: { dry, limit, left: pityLeft(dry, limit) },
    since: ps ? Number(ps.since) || null : null,
    today: ps ? (Array.isArray(ps.d) && ps.d[0] === today ? whole(ps.d[1]) : 0) : null,
    week: ps ? whole(thisWeek?.[1]) : null,
    tracked: ps ? whole(ps.n) : 0,
    average: ps && whole(ps.n) > 0 ? num(ps.v) / whole(ps.n) : null,
    luck: ps && Array.isArray(ps.luck) && whole(ps.luck[1]) > 0 ? { day: String(ps.luck[0]), value: whole(ps.luck[1]), boosters: whole(ps.luck[2]) } : null,
    top: ps?.top?.r ? { rarityId: normalizeRarityId(ps.top.r), key: ps.top.k ?? null, title: ps.top.t ?? '', price: whole(ps.top.p), at: Number(ps.top.at) || null } : null,
    perWeek: ps ? weekSeries(now, (add) => { for (const w of weeks) add(Number(w[0]), whole(w[1])); }) : null
  };
}

function economyPart({ profile, facts, wallet, ink }) {
  return {
    coins: whole(wallet),
    ink: whole(ink),
    spent: whole(facts.spent),
    shopBuys: whole(facts.shopBuys),
    crates: whole(facts.crates),
    bundles: whole(facts.bundles),
    sold: whole(profile.cardsSold),
    sellEarned: whole(facts.sellEarned),
    fused: whole(profile.fused),
    auctionsListed: whole(facts.auctionsListed),
    auctionsSold: whole(profile.auctionsSold),
    auctionsWon: whole(profile.auctionsWon),
    auctionBest: whole(facts.auctionBest),
    bidsPlaced: whole(facts.bidsPlaced),
    trades: whole(profile.tradesDone),
    giftsSent: whole(profile.giftsSent),
    giftsReceived: whole(facts.giftsReceived),
    inkEarned: whole(facts.inkEarned),
    inkSpent: whole(facts.inkSpent),
    atelierBuys: whole(facts.atelierBuys)
  };
}

function activityPart({ profile, facts, achDone, achTotal, now }) {
  const daily = profile.daily ?? {};
  const alive = streakAlive(daily, now);
  const streak = alive ? Math.max(whole(daily.run), whole(daily.day) || (daily.lastDay != null ? 1 : 0)) : 0;
  const seasons = profile.seasons ?? {};
  const current = seasonAt(now);
  const points = Object.values(seasons).map((s) => whole(s?.points));
  const bestRank = whole(profile.ledger?.bestRank);
  return {
    playMs: num(profile.playMs),
    createdAt: Number(profile.createdAt) || null,
    days: Math.max(whole(facts.playDays), profile.createdAt ? 1 : 0),
    streak,
    bestStreak: Math.max(whole(daily.best), streak),
    gifts: Math.max(whole(daily.total), whole(daily.weeks) * 7 + (alive ? whole(daily.day) : 0)),
    giftWeeks: whole(daily.weeks),
    quests: whole(facts.questsClaimed),
    questsHard: whole(facts.questsHard),
    questDays: whole(facts.questDays),
    achDone: whole(achDone),
    achTotal: whole(achTotal),
    season: { id: current.season.id, name: current.season.name, points: whole(seasons[current.key]?.points) },
    seasonBest: points.length ? Math.max(...points) : 0,
    seasonsPlayed: points.filter((p) => p > 0).length,
    seasonRungs: whole(facts.seasonRungs),
    bestRank: bestRank > 0 ? bestRank : null
  };
}

function gamesPart({ profile, facts, wikdle }) {
  return {
    wikdlePlayed: whole(facts.wikdlePlays),
    wikdleWon: whole(facts.wikdleWins),
    wikdleStreak: whole(wikdle?.streak),
    wikdleBest: whole(facts.wikdleStreak),
    quizPlayed: whole(profile.quizPlayed),
    quizWins: whole(profile.quizWins),
    quizPerfect: whole(profile.quizPerfect),
    duelBest: whole(profile.duelBest),
    duelRounds: whole(profile.duelRounds),
    revealRounds: whole(profile.revealRounds),
    revealPerfect: whole(profile.revealPerfect),
    versusPlayed: whole(facts.versusPlayed),
    versusWins: whole(facts.versusWins),
    arcadePoints: whole(facts.arcadePoints)
  };
}

function socialPart({ facts, friends, guild, showcaseMax }) {
  return {
    friends: whole(friends),
    guild: guild?.id ? { name: guild.name ?? '', tag: guild.tag ?? '', members: whole(guild.members) } : null,
    guildDonated: whole(facts.guildDonated),
    guildGoals: whole(facts.guildGoals),
    guildMatches: whole(facts.guildMatches),
    messages: whole(facts.messagesSent),
    conversations: whole(facts.conversations),
    kudosGiven: whole(facts.kudosGiven),
    showcase: whole(facts.showcase),
    showcaseMax: whole(showcaseMax)
  };
}

export function computeStats(input) {
  const ctx = {
    profile: input.profile ?? {},
    entries: Array.isArray(input.entries) ? input.entries : [],
    albums: input.albums ?? [],
    facts: input.facts ?? {},
    wallet: input.wallet ?? 0,
    ink: input.ink ?? 0,
    friends: input.friends ?? 0,
    guild: input.guild ?? null,
    wikdle: input.wikdle ?? null,
    achDone: input.achDone ?? 0,
    achTotal: input.achTotal ?? 0,
    showcaseMax: input.showcaseMax ?? 0,
    now: input.now ?? Date.now()
  };
  return {
    collection: collectionPart(ctx),
    boosters: boostersPart(ctx),
    economy: economyPart(ctx),
    activity: activityPart(ctx),
    games: gamesPart(ctx),
    social: socialPart(ctx)
  };
}

export const dayOf = (day) => Date.parse(`${day}T12:00:00Z`);

export const weekStartOf = (now, back) => (((utcWeekIndex(now) - back) * 7) - 4) * DAY_MS;

export const SUMMARY_VERSION = 1;
const BIG = 1e13;
const FAMILY_IDS = ['theme', 'code', 'custom', 'wild'];
const KIND_IDS = BOOSTER_KINDS.map(([id]) => id);
const rarityIndex = (id) => Math.max(0, RARITIES.findIndex((r) => r.id === normalizeRarityId(id)));

export const SUMMARY_NUMBERS = {
  at: BIG, off: 1,
  cC: BIG, cU: BIG, cV: BIG, cF: BIG, cS: BIG, cX: BIG, cP: 1000, cB: RARITIES.length - 1, cBa: BIG, cAs: BIG, cAc: BIG, cAe: BIG, cAm: BIG,
  bN: BIG, bC: BIG, bH: BIG, bPd: BIG, bPl: BIG, bS: BIG, bT: BIG, bW: BIG, bA: BIG, bLd: BIG, bLv: BIG, bLn: BIG, bR: RARITIES.length - 1, bRa: BIG,
  aD: BIG, aSt: BIG, aSb: BIG, aG: BIG, aQ: BIG, aQh: BIG, aA: BIG, aAt: BIG, aSp: BIG, aSi: SEASONS.length - 1, aSx: BIG, aSn: BIG, aR: BIG, aBr: BIG,
  gWp: BIG, gWw: BIG, gWs: BIG, gWb: BIG, gQp: BIG, gQw: BIG, gQf: BIG, gDb: BIG, gDr: BIG, gRr: BIG, gRf: BIG, gVp: BIG, gVw: BIG, gP: BIG,
  sF: BIG, sGd: BIG, sGg: BIG, sGm: BIG, sMs: BIG, sCv: BIG, sK: BIG, sSh: 100, sSm: 100
};

export const SUMMARY_LISTS = { cPr: RARITIES.length, cNw: SPARK_WEEKS, bPw: SPARK_WEEKS, bK: BOOSTER_KINDS.length * 2, cFm: FAMILY_IDS.length * 6 };

export const SUMMARY_MAX_BYTES = 3000;

export function cleanSummary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = { v: SUMMARY_VERSION };
  for (const [key, max] of Object.entries(SUMMARY_NUMBERS)) {
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[key] = Math.min(max, Math.max(0, Math.round(v)));
  }
  for (const [key, len] of Object.entries(SUMMARY_LISTS)) {
    const v = raw[key];
    if (!Array.isArray(v) || !v.length || v.length > len || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) continue;
    out[key] = v.map((x) => Math.min(BIG, Math.max(0, Math.round(x))));
  }
  if (out.off) return { v: SUMMARY_VERSION, off: 1, ...(out.at != null ? { at: out.at } : {}) };
  return out;
}

const put = (out, key, v) => { if (v != null && Number.isFinite(Number(v))) out[key] = Math.round(Number(v)); };
const KEEP_ZERO = new Set(['v', 'at', 'bN', 'cC', 'cU']);

export function toSummary(stats, { now = Date.now(), hidden = false } = {}) {
  const at = utcDayIndex(now);
  if (hidden) return { v: SUMMARY_VERSION, off: 1, at };
  const o = { v: SUMMARY_VERSION, at };
  const { collection: c, boosters: b, economy: e, activity: a, games: g, social: so } = stats;
  put(o, 'cC', c.copies); put(o, 'cU', c.unique); put(o, 'cV', c.value); put(o, 'cF', c.favorites); put(o, 'cS', c.specials); put(o, 'cX', c.customs);
  if (c.completion != null) put(o, 'cP', c.completion * 1000);
  if (c.best) { put(o, 'cB', rarityIndex(c.best.rarityId)); put(o, 'cBa', c.best.at); }
  put(o, 'cAs', c.albums.started); put(o, 'cAc', c.albums.complete); put(o, 'cAe', c.albums.editions); put(o, 'cAm', c.albums.medals);
  if (c.copies > 0) o.cPr = RARITIES.map((r) => whole(c.byPrint[r.id]));
  if (c.newPerWeek.some((x) => x > 0)) o.cNw = c.newPerWeek.map(whole);
  if (c.families.length) o.cFm = c.families.flatMap((f) => [FAMILY_IDS.indexOf(f.id), f.albums, f.started, f.owned, f.knownOwned, f.total].map(whole));
  put(o, 'bN', b.opened); put(o, 'bC', b.cards); put(o, 'bH', b.legendaryPlus); put(o, 'bPd', b.pity.dry); put(o, 'bPl', b.pity.limit);
  put(o, 'bS', b.since); put(o, 'bT', b.today); put(o, 'bW', b.week); put(o, 'bA', b.average);
  if (b.luck) { put(o, 'bLd', Math.floor(dayOf(b.luck.day) / DAY_MS)); put(o, 'bLv', b.luck.value); put(o, 'bLn', b.luck.boosters); }
  if (b.top) { put(o, 'bR', rarityIndex(b.top.rarityId)); put(o, 'bRa', b.top.at); }
  if (b.perWeek) o.bPw = b.perWeek.map(whole);
  if (b.kinds.length) o.bK = b.kinds.flatMap(([id, count]) => [KIND_IDS.indexOf(id), whole(count)]);
  put(o, 'aD', a.days); put(o, 'aSt', a.streak); put(o, 'aSb', a.bestStreak); put(o, 'aG', a.gifts); put(o, 'aQ', a.quests); put(o, 'aQh', a.questsHard);
  put(o, 'aA', a.achDone); put(o, 'aAt', a.achTotal); put(o, 'aSp', a.season.points); put(o, 'aSi', Math.max(0, SEASONS.findIndex((x) => x.id === a.season.id)));
  put(o, 'aSx', a.seasonBest); put(o, 'aSn', a.seasonsPlayed); put(o, 'aR', a.seasonRungs); put(o, 'aBr', a.bestRank);
  put(o, 'gWp', g.wikdlePlayed); put(o, 'gWw', g.wikdleWon); put(o, 'gWs', g.wikdleStreak); put(o, 'gWb', g.wikdleBest); put(o, 'gQp', g.quizPlayed);
  put(o, 'gQw', g.quizWins); put(o, 'gQf', g.quizPerfect); put(o, 'gDb', g.duelBest); put(o, 'gDr', g.duelRounds); put(o, 'gRr', g.revealRounds);
  put(o, 'gRf', g.revealPerfect); put(o, 'gVp', g.versusPlayed); put(o, 'gVw', g.versusWins); put(o, 'gP', g.arcadePoints);
  put(o, 'sF', so.friends); put(o, 'sGd', so.guildDonated); put(o, 'sGg', so.guildGoals); put(o, 'sGm', so.guildMatches); put(o, 'sMs', so.messages);
  put(o, 'sCv', so.conversations); put(o, 'sK', so.kudosGiven); put(o, 'sSh', so.showcase); put(o, 'sSm', so.showcaseMax);
  for (const k of Object.keys(o)) if (o[k] === 0 && !KEEP_ZERO.has(k) && !(k === 'aSi')) delete o[k];
  return cleanSummary(o);
}

function shifted(list, by) {
  if (!Array.isArray(list)) return null;
  const late = Math.min(SPARK_WEEKS, Math.max(0, by));
  const out = [...list.slice(late), ...new Array(late).fill(0)];
  while (out.length < SPARK_WEEKS) out.unshift(0);
  return out.slice(-SPARK_WEEKS);
}

export function fromSummary(raw, row = {}, now = Date.now()) {
  const s = cleanSummary(raw);
  if (!s || s.off) return null;
  const n = (k) => (s[k] != null ? s[k] : 0);
  const has = (k) => s[k] != null;
  const at = has('at') ? s.at : utcDayIndex(now);
  const today = utcDayIndex(now);
  const weeksLate = utcWeekIndex(now) - utcWeekIndex(at * DAY_MS);
  const families = [];
  const fm = s.cFm ?? [];
  for (let i = 0; i + 5 < fm.length; i += 6) {
    const [id, albums, started, owned, knownOwned, total] = fm.slice(i, i + 6);
    if (!FAMILY_IDS[id]) continue;
    families.push({ id: FAMILY_IDS[id], albums, started, owned, complete: 0, knownOwned, total, pct: total > 0 ? Math.min(1, knownOwned / total) : null });
  }
  const kinds = [];
  const bk = s.bK ?? [];
  for (let i = 0; i + 1 < bk.length; i += 2) if (KIND_IDS[bk[i]] && bk[i + 1] > 0) kinds.push([KIND_IDS[bk[i]], bk[i + 1]]);
  const season = SEASONS[n('aSi')] ?? SEASONS[0];
  const col = (v, fallback) => (v != null && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : fallback);
  const limit = Math.max(1, n('bPl') || 40);
  return {
    collection: {
      copies: col(row.cards, n('cC')),
      unique: col(row.unique_cards, n('cU')),
      value: col(row.collection_value, n('cV')),
      favorites: n('cF'), specials: n('cS'), customs: n('cX'),
      byPrint: Object.fromEntries(RARITIES.map((r, i) => [r.id, s.cPr?.[i] ?? 0])),
      best: has('cB') ? { rarityId: RARITIES[s.cB].id, key: null, title: '', price: 0, at: s.cBa ?? null } : null,
      albums: { started: n('cAs'), complete: n('cAc'), editions: n('cAe'), medals: n('cAm') },
      families,
      completion: has('cP') ? s.cP / 1000 : null,
      newPerWeek: shifted(s.cNw ?? [], weeksLate)
    },
    boosters: {
      opened: col(row.boosters_opened, n('bN')),
      cards: n('bC'), legendaryPlus: n('bH'), byRarity: null, kinds,
      pity: { dry: Math.min(n('bPd'), limit), limit, left: Math.max(1, limit - n('bPd')) },
      since: has('bS') ? s.bS : null,
      today: has('bS') ? (at === today ? n('bT') : 0) : null,
      week: has('bS') ? (weeksLate === 0 ? n('bW') : 0) : null,
      tracked: 0,
      average: has('bA') ? s.bA : null,
      luck: has('bLd') && n('bLv') > 0 ? { day: utcDay(s.bLd * DAY_MS), value: s.bLv, boosters: n('bLn') } : null,
      top: has('bR') ? { rarityId: RARITIES[s.bR].id, key: null, title: '', price: 0, at: s.bRa ?? null } : null,
      perWeek: s.bPw ? shifted(s.bPw, weeksLate) : null
    },
    economy: null,
    activity: {
      playMs: col(row.play_ms, 0),
      createdAt: row.created_at ? Date.parse(row.created_at) || null : null,
      days: n('aD'), streak: at >= today - 1 ? n('aSt') : 0, bestStreak: n('aSb'), gifts: n('aG'), giftWeeks: 0,
      quests: n('aQ'), questsHard: n('aQh'), questDays: 0, achDone: n('aA'), achTotal: n('aAt'),
      season: { id: season.id, name: season.name, points: n('aSp') },
      seasonBest: n('aSx'), seasonsPlayed: n('aSn'), seasonRungs: n('aR'), bestRank: n('aBr') > 0 ? s.aBr : null
    },
    games: {
      wikdlePlayed: n('gWp'), wikdleWon: n('gWw'), wikdleStreak: n('gWs'), wikdleBest: n('gWb'), quizPlayed: n('gQp'), quizWins: n('gQw'),
      quizPerfect: n('gQf'), duelBest: n('gDb'), duelRounds: n('gDr'), revealRounds: n('gRr'), revealPerfect: n('gRf'),
      versusPlayed: n('gVp'), versusWins: n('gVw'), arcadePoints: n('gP')
    },
    social: {
      friends: n('sF'), guild: null, guildDonated: n('sGd'), guildGoals: n('sGg'), guildMatches: n('sGm'),
      messages: n('sMs'), conversations: n('sCv'), kudosGiven: n('sK'), showcase: n('sSh'), showcaseMax: n('sSm') || 10
    }
  };
}

export function fromColumns(row = {}, { entries = null, albums = null, ach = null, achTotal = 0, showcase = 0, showcaseMax = 10, guild = null, now = Date.now() } = {}) {
  const col = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null);
  const part = Array.isArray(entries) ? collectionPart({ profile: {}, entries, albums: albums ?? [], now }) : null;
  const pulled = row?.best_rarity ? { rarityId: normalizeRarityId(row.best_rarity), key: null, title: '', price: 0, at: null } : null;
  return {
    partial: true,
    collection: {
      copies: col(row?.cards) ?? part?.copies ?? null,
      unique: col(row?.unique_cards) ?? part?.unique ?? null,
      value: col(row?.collection_value) ?? part?.value ?? null,
      favorites: part?.favorites ?? 0,
      specials: part?.specials ?? 0,
      customs: part?.customs ?? 0,
      byPrint: part?.byPrint ?? null,
      best: part?.best ?? null,
      albums: part ? { ...part.albums, medals: 0 } : null,
      families: part?.families ?? [],
      completion: part?.completion ?? null,
      newPerWeek: part?.newPerWeek ?? null
    },
    boosters: {
      opened: col(row?.boosters_opened), cards: null, legendaryPlus: null, kinds: [], pity: null,
      since: null, today: null, week: null, average: null, luck: null, top: pulled, perWeek: null
    },
    economy: null,
    activity: {
      playMs: col(row?.play_ms),
      createdAt: row?.created_at ? Date.parse(row.created_at) || null : null,
      level: col(row?.level),
      achDone: col(ach),
      achTotal: whole(achTotal)
    },
    games: null,
    social: {
      guild: guild?.name ? { name: guild.name, tag: guild.tag ?? '' } : null,
      showcase: whole(showcase),
      showcaseMax: whole(showcaseMax) || 10
    }
  };
}
