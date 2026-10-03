import { RARITIES, normalizeRarityId, rarityRank } from './data/rarities.js';
import { PITY_RANK, bestPrint, collectionValue, pityLeft, pityLimit, printsOf } from './econ/rules.js';
import { albumCompleteEdition, albumEditionClaimed } from './albums.js';
import { streakAlive } from './daily.js';
import { seasonAt } from './season.js';
import { DAY_MS, utcDay, utcWeekIndex } from './days.js';

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
