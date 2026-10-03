import { check, done, fakeStorage } from './lib.mjs';

fakeStorage();
const { notePulls, PULL_WEEKS_KEPT } = await import('../../src/econ/rules.js');
const { computeStats, SPARK_WEEKS } = await import('../../src/profilestats.js');
const { measure } = await import('../../src/achievements.js');
const { buildAlbums } = await import('../../src/albums.js');
const { claim, emptyDaily } = await import('../../src/daily.js');
const { DAY_MS, utcWeekIndex } = await import('../../src/days.js');
const { ECON_KEYS } = await import('../../src/econ/core.js');

const T0 = Date.parse('2026-09-01T10:00:00Z');
const card = (rarityId, price, key = `k${price}`, extra = {}) => ({ rarityId, price, key, title: `Title ${key}`, ...extra });

check('pull stats are mirrored from the server', ECON_KEYS.includes('pullStats'));

let ps = notePulls(null, [card('common', 10), card('rare', 40)], 1, T0);
check('a first booster starts the count', ps.n === 1 && ps.v === 50 && ps.since === T0, JSON.stringify(ps));
check('it counts the day', ps.d[0] === '2026-09-01' && ps.d[1] === 1 && ps.d[2] === 50);
check('its best pull is the rarest card', ps.top.r === 'rare' && ps.top.k === 'k40' && ps.top.at === T0);
ps = notePulls(ps, [card('rare', 90, 'x')], 1, T0 + 1000);
check('a dearer card of the same tier takes the best pull', ps.top.k === 'x' && ps.top.p === 90);
ps = notePulls(ps, [card('epic', 5, 'e'), card('legendary', 1, 'special', { special: 'code' })], 1, T0 + 2000);
check('a higher tier wins over price, special cards never count', ps.top.k === 'e' && ps.v === 145, JSON.stringify(ps.top));
check('three boosters that day', ps.d[1] === 3 && ps.luck[0] === '2026-09-01' && ps.luck[1] === 145 && ps.luck[2] === 3);
ps = notePulls(ps, [card('common', 20)], 2, T0 + DAY_MS);
check('a new day starts its own count and keeps the luckiest day', ps.d[0] === '2026-09-02' && ps.d[1] === 2 && ps.luck[1] === 145);
check('the total keeps adding up', ps.n === 5 && ps.v === 165 && ps.since === T0);
let far = ps;
for (let i = 1; i <= 20; i++) far = notePulls(far, [card('common', 1)], 1, T0 + i * 7 * DAY_MS);
check('only the last weeks are kept', far.w.length === PULL_WEEKS_KEPT && far.w.at(-1)[0] === utcWeekIndex(T0 + 20 * 7 * DAY_MS), JSON.stringify(far.w));
check('pull stats stay small', JSON.stringify(far).length < 700, String(JSON.stringify(far).length));

let daily = emptyDaily();
claim(daily, T0);
claim(daily, T0 + DAY_MS);
claim(daily, T0 + 2 * DAY_MS);
check('a daily streak is counted', daily.run === 3 && daily.best === 3 && daily.total === 3, JSON.stringify(daily));
claim(daily, T0 + 5 * DAY_MS);
check('a missed day starts it again but keeps the best', daily.run === 1 && daily.best === 3 && daily.total === 4);
const older = { v: 2, day: 4, weeks: 2, lastDay: Math.floor(T0 / DAY_MS), shownDay: null };
claim(older, T0 + DAY_MS);
check('an older save carries its running week into the streak', older.run === 5 && older.best === 5 && older.total === 1);

const NOW = T0 + 3 * DAY_MS;
const entries = [
  { key: 'a', title: 'Alpha', rarityId: 'legendary', price: 900, count: 3, prints: { common: 1, legendary: 2 }, packId: 'theme|animals', favorite: true, firstPulledAt: NOW - DAY_MS },
  { key: 'b', title: 'Beta', rarityId: 'rare', price: 120, count: 1, packId: 'theme|animals', firstPulledAt: NOW - 8 * DAY_MS },
  { key: 'c', title: 'Gamma', rarityId: 'epic', price: 300, count: 2, packId: 'custom|zelda.fandom.com', firstPulledAt: NOW - 15 * DAY_MS },
  { key: 'd', title: 'Delta', rarityId: 'common', price: 30, count: 1, packId: null, firstPulledAt: NOW },
  { key: 'special:x', title: 'Creator', rarityId: 'prismatic', price: 5000, count: 1, special: 'creator', packId: null }
];
localStorage.setItem('wikster.albumTotals.v1', JSON.stringify({ 'en|theme:animals': { total: 40, at: NOW } }));
const albums = buildAlbums(entries, []);
const profile = {
  boostersOpened: 12, pity: 30, rarityCounts: { common: 30, rare: 10, legendary: 2, mythic: 1 },
  cardsSold: 7, fused: 2, tradesDone: 1, giftsSent: 3, auctionsSold: 2, quizPlayed: 4, quizWins: 2, quizPerfect: 1, duelBest: 6,
  playMs: 3 * 3600000, createdAt: T0 - 30 * DAY_MS, albumTiers: { 'theme:animals': 1 },
  daily: { v: 2, day: 2, weeks: 3, lastDay: Math.floor(NOW / DAY_MS), run: 9, best: 12, total: 30 },
  seasons: { '2026-a': { points: 500 } },
  ledger: { opens_theme: 8, opens_timed: 3, opensSeason: 1, spent: 4200, shopBuys: 6, sellEarned: 650, inkEarned: 90, inkSpent: 40, playDays: 14, questsClaimed: 21, questsHard: 4, messagesSent: 11, bestRank: 37 },
  pullStats: notePulls(notePulls(null, [card('mythic', 700, 'm')], 2, NOW - 2 * DAY_MS), [card('rare', 100)], 1, NOW),
  showcase: [{ key: 'a' }]
};
const facts = measure({ profile, entries: entries.filter((e) => !e.special), albumsDeep: 0, customPacks: [], friends: 4 });
const s = computeStats({ profile, entries, albums, facts, wallet: 1234, ink: 56, friends: 4, guild: { id: 'g', name: 'Readers', tag: 'RD', members: 5 },
  wikdle: { streak: 2 }, achDone: 9, achTotal: 300, showcaseMax: 5, now: NOW });
const c = s.collection;
check('copies and unique cards', c.copies === 8 && c.unique === 5, `${c.copies} ${c.unique}`);
check('copies by print', c.byPrint.legendary === 2 && c.byPrint.common === 2 && c.byPrint.rare === 1 && c.byPrint.epic === 2 && c.byPrint.prismatic === 1, JSON.stringify(c.byPrint));
check('the best print skips special cards', c.best.key === 'a' && c.best.rarityId === 'legendary');
check('favourites, specials and custom cards', c.favorites === 1 && c.specials === 1 && c.customs === 1);
const theme = c.families.find((f) => f.id === 'theme');
check('the theme family counts its known totals', theme.knownOwned === 2 && theme.total >= 40 && theme.started === 1, JSON.stringify(theme));
check('completion is owned over known totals', c.completion != null && c.completion > 0 && c.completion < 0.1, String(c.completion));
check('album medals come from claimed tiers', c.albums.medals === 1 && c.albums.started >= 3);
check('new cards per week, this week last', c.newPerWeek.length === SPARK_WEEKS && c.newPerWeek.reduce((a, b) => a + b, 0) === 4, JSON.stringify(c.newPerWeek));
const b = s.boosters;
check('boosters and cards pulled', b.opened === 12 && b.cards === 43 && b.legendaryPlus === 3);
check('opened today and this week', b.today === 1 && b.tracked === 3, JSON.stringify(b));
check('the average is per tracked booster', Math.round(b.average) === 267, String(b.average));
check('the luckiest day', b.luck.value === 700 && b.luck.boosters === 2);
check('the best pull ever', b.top.rarityId === 'mythic' && b.top.key === 'm');
check('the pity counter', b.pity.dry === 30 && b.pity.limit === 40 && b.pity.left === 10);
check('opened by kind, most first, zero left out', JSON.stringify(b.kinds) === JSON.stringify([['theme', 8], ['timed', 3], ['season', 1]]), JSON.stringify(b.kinds));
check('boosters per week ends with this week', b.perWeek.length === SPARK_WEEKS && b.perWeek.reduce((x, y) => x + y, 0) === 3);
const e = s.economy;
check('the economy', e.coins === 1234 && e.ink === 56 && e.spent === 4200 && e.shopBuys === 6 && e.sold === 7 && e.sellEarned === 650 && e.fused === 2 && e.auctionsSold === 2 && e.giftsSent === 3 && e.inkEarned === 90);
const a = s.activity;
check('activity', a.days === 14 && a.streak === 9 && a.bestStreak === 12 && a.gifts === 30 && a.quests === 21 && a.questsHard === 4 && a.bestRank === 37 && a.achDone === 9, JSON.stringify(a));
check('season points', a.seasonBest === 500 && a.seasonsPlayed === 1);
check('games', s.games.quizPlayed === 4 && s.games.duelBest === 6 && s.games.wikdleStreak === 2);
check('social', s.social.friends === 4 && s.social.guild.tag === 'RD' && s.social.messages === 11 && s.social.showcase === 1 && s.social.showcaseMax === 5);

const empty = computeStats({ profile: {}, entries: [], albums: [], facts: {}, now: NOW });
check('an empty save gives zeros, not errors', empty.collection.copies === 0 && empty.boosters.average === null && empty.boosters.today === null && empty.boosters.perWeek === null && empty.activity.streak === 0);
const broken = { ...profile, daily: { ...profile.daily, lastDay: Math.floor(NOW / DAY_MS) - 3 } };
check('a broken streak shows zero but keeps the best', computeStats({ profile: broken, entries: [], albums: [], facts: {}, now: NOW }).activity.streak === 0
  && computeStats({ profile: broken, entries: [], albums: [], facts: {}, now: NOW }).activity.bestStreak === 12);

const { toSummary, fromSummary, fromColumns, cleanSummary, SUMMARY_NUMBERS, SUMMARY_LISTS } = await import('../../src/profilestats.js');
const { readFileSync } = await import('node:fs');
const summary = toSummary(s, { now: NOW });
const sent = JSON.stringify(summary);
check('the public summary is small', sent.length < 1500, String(sent.length));
check('it carries no card key or title', !/Alpha|Title|"k\d|en:/.test(sent), sent);
check('cleaning a clean summary changes nothing', JSON.stringify(cleanSummary(summary)) === sent);
const back = fromSummary(summary, { cards: 8, unique_cards: 5, collection_value: 999, boosters_opened: 12, play_ms: 3 * 3600000, created_at: new Date(T0).toISOString() }, NOW);
check('a viewer reads the same collection', back.collection.unique === 5 && back.collection.value === 999 && back.collection.byPrint.legendary === 2 && back.collection.best.rarityId === 'legendary' && back.collection.families.find((f) => f.id === 'theme').knownOwned === 2);
check('the same boosters', back.boosters.opened === 12 && back.boosters.cards === 43 && back.boosters.legendaryPlus === 3 && back.boosters.today === 1 && Math.round(back.boosters.average) === 267
  && back.boosters.luck.value === 700 && back.boosters.top.rarityId === 'mythic' && back.boosters.pity.left === 10 && JSON.stringify(back.boosters.kinds) === JSON.stringify(b.kinds), JSON.stringify(back.boosters));
check('no wallet or spending number is published', Object.keys(summary).every((k) => !k.startsWith('e')) && back.economy === null, JSON.stringify(summary));
check('the same activity, games and social', back.activity.streak === 9 && back.activity.bestRank === 37
  && back.activity.achDone === 9 && back.games.quizPlayed === 4 && back.social.messages === 11 && back.social.showcaseMax === 5);
check('the week charts line up', JSON.stringify(back.collection.newPerWeek) === JSON.stringify(c.newPerWeek) && JSON.stringify(back.boosters.perWeek) === JSON.stringify(b.perWeek));
const later = fromSummary(summary, {}, NOW + 14 * DAY_MS);
check('read two weeks later, today and this week are zero and the charts slide', later.boosters.today === 0 && later.boosters.week === 0 && later.activity.streak === 0
  && JSON.stringify(later.collection.newPerWeek.slice(0, 10)) === JSON.stringify(c.newPerWeek.slice(2)));
check('a hidden summary shows nothing', fromSummary(toSummary(s, { now: NOW, hidden: true }), {}, NOW) === null && JSON.stringify(toSummary(null, { now: NOW, hidden: true })).length < 40);
const junk = cleanSummary({ cC: -5, cU: 'x', cV: 1e40, cB: 99, zz: 1, cPr: [1, 2, 'a'], cNw: new Array(40).fill(1), bK: [0, 3], title: 'Alpha' });
check('junk is cleaned: no negatives, no strings, caps held, unknown keys dropped', junk.cC === 0 && !('cU' in junk) && junk.cV === 1e13 && junk.cB === 7 && !('zz' in junk) && !('cPr' in junk) && !('cNw' in junk) && JSON.stringify(junk.bK) === '[0,3]' && !('title' in junk), JSON.stringify(junk));
check('a summary without its row falls back to its own numbers', fromSummary(summary, {}, NOW).collection.copies === 8);

const row = { cards: 12, unique_cards: 5, collection_value: 3400, boosters_opened: 9, best_rarity: 'epic', play_ms: 7200000, created_at: '2026-01-15T12:00:00Z', level: 14 };
const bare = fromColumns(row, { ach: 7, achTotal: 355, showcase: 2, showcaseMax: 10, guild: { name: 'Owls', tag: 'OWL' } });
check('a player with no summary gets a partial board from the public columns', bare.partial && bare.collection.copies === 12 && bare.collection.unique === 5 && bare.collection.value === 3400
  && bare.boosters.opened === 9 && bare.boosters.top.rarityId === 'epic' && bare.activity.playMs === 7200000 && bare.activity.level === 14 && bare.activity.achDone === 7 && bare.activity.achTotal === 355, JSON.stringify(bare));
check('with no economy or minigame section, and nothing it cannot know', bare.economy === null && bare.games === null && bare.boosters.cards === null && bare.collection.byPrint === null && bare.collection.albums === null);
check('the guild and showcase still show', bare.social.guild.tag === 'OWL' && bare.social.showcase === 2 && bare.social.showcaseMax === 10);
const seen = [card('legendary', 900, 'a', { count: 2, prints: { common: 1, legendary: 1 }, packId: 'theme|animals' }), card('rare', 40, 'b', { packId: 'theme|space' })];
const withCards = fromColumns({ ...row, cards: null }, { entries: seen, albums: buildAlbums(seen, []) });
check('a friend\'s cards fill in prints, albums and the best card', withCards.collection.copies === 3 && withCards.collection.byPrint.legendary === 1 && withCards.collection.byPrint.common === 1
  && withCards.collection.albums.started === 2 && withCards.collection.best.key === 'a', JSON.stringify(withCards.collection));
check('an empty row is safe', fromColumns({}).collection.copies === null && fromColumns(null).activity.createdAt === null);

const sql = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
const body = sql.slice(sql.indexOf('create or replace function public.stats_clean'));
const nums = [...body.slice(body.indexOf('v_nums'), body.indexOf('v_caps')).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
check('the server cleans the same numbers', JSON.stringify([...nums].sort()) === JSON.stringify(Object.keys(SUMMARY_NUMBERS).sort()), nums.join(' '));
const caps = JSON.parse(body.match(/v_caps constant jsonb := '([^']+)'/)[1]);
check('with the same caps', Object.entries(caps).every(([k, v]) => SUMMARY_NUMBERS[k] === v) && Object.entries(SUMMARY_NUMBERS).every(([k, v]) => v === 1e13 || caps[k] === v));
const lists = JSON.parse(body.match(/v_lists constant jsonb := '([^']+)'/)[1]);
check('and the same lists', JSON.stringify(lists) === JSON.stringify(SUMMARY_LISTS), JSON.stringify(lists));

done();
