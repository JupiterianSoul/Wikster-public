import { RARITIES, rarityById, rarityText } from '../data/rarities.js';
import { buckSvg, iconSvg, inkSvg } from '../data/icons.js';
import { getLanguage, t, tx } from '../i18n.js';
import { h } from '../ui/dom.js';
import { Bar } from '../ui/components.js';
import { computeStats, dayOf, fromSummary, SPARK_WEEKS, toSummary, weekStartOf } from '../profilestats.js';
import { evaluate as evaluateAchievements } from '../achievements.js';
import { achFacts } from './regalia.js';
import { buildAlbums } from '../albums.js';
import { loadStats as loadWikdleStats } from '../wikdle.js';
import { saveWrites } from '../save.js';
import { SHOWCASE_MAX } from '../showcase.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { state } from './core.js';
import { signedIn } from './gate.js';
import { formatDuration } from './profile.js';

const formats = new Map();
const numberFormat = (opts = {}) => {
  const lang = getLanguage();
  const key = `${lang}|${JSON.stringify(opts)}`;
  if (!formats.has(key)) formats.set(key, new Intl.NumberFormat(lang, opts));
  return formats.get(key);
};
export const n = (v) => numberFormat().format(Math.round(Number(v) || 0));
const pct = (v) => numberFormat({ style: 'percent', maximumFractionDigits: v < 0.1 ? 1 : 0 }).format(v);
const date = (ms, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(ms).toLocaleDateString(getLanguage(), { ...opts, timeZone: 'UTC' });
const coins = (v) => `${buckSvg({ size: 13 })}${n(v)}`;
const inks = (v) => `${inkSvg({ size: 13 })}${n(v)}`;

let memo = null;

export function ownStats({ facts, achDone, achTotal }) {
  const key = [saveWrites(), getLanguage(), state.collection, state.customPacks, state.profile, state.wallet, state.ink,
    state.social.friends.length, state.guild, achDone, achTotal, Math.floor(Date.now() / 60000)];
  if (memo && memo.key.every((v, i) => v === key[i])) return memo.stats;
  const entries = store.allEntries(state.collection);
  const stats = computeStats({
    profile: state.profile,
    entries,
    albums: buildAlbums(entries, state.customPacks ?? []),
    facts,
    wallet: state.wallet,
    ink: state.ink,
    friends: state.social.friends.length,
    guild: state.guild,
    wikdle: loadWikdleStats(),
    achDone,
    achTotal,
    showcaseMax: SHOWCASE_MAX,
    now: Date.now()
  });
  memo = { key, stats };
  return stats;
}

function tile(id, label, value, { sub = null, html = false, color = null, wide = false } = {}) {
  const b = h('b');
  if (html) b.innerHTML = value;
  else b.textContent = value;
  if (color) b.style.color = color;
  return h('div.stat-cell', { dataset: { stat: id }, class: wide ? 'is-wide' : null },
    b, h('span', label), sub ? h('small.stat-sub', sub) : null);
}

function section(id, icon, title, body, note = null) {
  const parts = body.flat().filter(Boolean);
  if (!parts.length) return null;
  return h('section.stat-sec', { dataset: { sec: id } },
    h('header.stat-sec-head',
      h('span.stat-sec-icon', { html: icon, 'aria-hidden': 'true' }),
      h('h4', title),
      note ? h('span.stat-sec-note', note) : null),
    ...parts);
}

const tiles = (list) => {
  const kept = list.filter(Boolean);
  return kept.length ? h('div.stat-tiles', kept) : null;
};

function printBar(byPrint) {
  const total = RARITIES.reduce((s, r) => s + (byPrint[r.id] ?? 0), 0);
  if (!total) return null;
  const shown = RARITIES.filter((r) => (byPrint[r.id] ?? 0) > 0);
  const label = shown.map((r) => `${tx(r.name)} ${n(byPrint[r.id])}`).join(', ');
  return h('figure.stat-chart',
    h('figcaption', t('statByPrint')),
    h('div.stat-stack', { role: 'img', 'aria-label': label },
      shown.map((r) => h('span.stat-seg', {
        title: `${tx(r.name)}: ${n(byPrint[r.id])} (${pct(byPrint[r.id] / total)})`,
        style: { flexGrow: String(byPrint[r.id]), background: r.color }
      }))),
    h('ul.stat-legend', shown.map((r) => h('li',
      h('i', { style: { background: r.color }, 'aria-hidden': 'true' }),
      h('span', { style: { color: rarityText(r) } }, tx(r.name)),
      h('b', n(byPrint[r.id]))))));
}

function spark(id, title, series, now) {
  if (!series || !series.some((v) => v > 0)) return null;
  const peak = Math.max(1, ...series);
  const last = series.length - 1;
  const tip = (i) => t('statPerWeekTip', { date: date(weekStartOf(now, last - i), { day: 'numeric', month: 'short' }), n: n(series[i]) });
  return h('figure.stat-chart', { dataset: { chart: id } },
    h('figcaption', h('span', title), h('b', n(series[last]))),
    h('div.stat-spark', { role: 'img', 'aria-label': series.map((_, i) => tip(i)).join(', ') },
      series.map((v, i) => h('span.stat-spark-bar', {
        title: tip(i),
        class: i === last ? 'is-now' : null,
        style: { height: `${v > 0 ? Math.max(6, (v / peak) * 100) : 0}%` }
      }))),
    h('div.stat-spark-axis', h('span', t('statWeeksAgo', { n: SPARK_WEEKS - 1 })), h('span', t('statThisWeekShort'))));
}

function familyRows(families) {
  if (!families.length) return null;
  const label = { theme: 'statFamTheme', code: 'statFamCode', custom: 'statFamCustom', wild: 'statFamWild' };
  return h('figure.stat-chart',
    h('figcaption', t('statFamilies')),
    h('div.stat-rows', families.map((f) => {
      const subs = [];
      if (f.id === 'custom') subs.push(t('statFamWikis', { n: n(f.started) }));
      else if (f.id !== 'wild') subs.push(t('statFamStarted', { started: n(f.started), albums: n(f.albums) }));
      subs.push(t('statFamCards', { n: n(f.owned) }));
      const row = h('div.stat-row', { dataset: { family: f.id } },
        h('span.stat-row-name', t(label[f.id])),
        h('span.stat-row-sub', subs.join(' · ')),
        f.pct == null ? h('span.stat-row-pct') : h('span.stat-row-pct', pct(f.pct)));
      if (f.pct != null) {
        const track = h('span.stat-row-track');
        new Bar(track).set(f.pct, { animate: false });
        row.append(track);
      }
      return row;
    })));
}

function pityTile(pity) {
  const cell = tile('pity', t('statPity'), t('statPityLeft', { n: n(pity.left) }), {
    sub: t('statPitySub', { n: n(pity.dry), limit: n(pity.limit) }), wide: true
  });
  const track = h('span.stat-cell-track');
  const bar = new Bar(track);
  bar.set(Math.min(1, pity.dry / pity.limit), { animate: false });
  bar.fill.style.background = rarityById('legendary').color;
  cell.append(track);
  return cell;
}

function kindChips(kinds) {
  if (!kinds.length) return null;
  const label = { theme: 'statKindTheme', open: 'statKindOpen', custom: 'statKindCustom', timed: 'statKindTimed', today: 'statKindToday', season: 'statKindSeason', code: 'statKindCode' };
  return h('figure.stat-chart',
    h('figcaption', t('statKinds')),
    h('div.stat-chips', kinds.map(([id, count]) => h('span.stat-chip', { dataset: { kind: id } }, h('span', t(label[id])), h('b', n(count))))));
}

const rarityTile = (id, label, card, sub) => card ? tile(id, label, tx(rarityById(card.rarityId).name), {
  color: rarityText(rarityById(card.rarityId)), sub
}) : null;

export function paintOwnStatsBoard(node, { facts, achDone, achTotal }) {
  const s = ownStats({ facts, achDone, achTotal });
  paintStatsBoard(node, s, { owner: true });
  if (!statsShared()) node.prepend(h('p.stat-foot.stat-hidden', t('statHiddenNote')));
  return s;
}

export const statsShared = () => state.profile?.settings?.publicStats !== false;

const SUMMARY_GAP = 15 * 60 * 1000;
let summarySent = { text: '', at: 0, off: null };

export function publicSummary() {
  if (!statsShared()) return toSummary(null, { hidden: true });
  const facts = achFacts();
  const list = evaluateAchievements(facts, state.profile.achievements?.redeemed ?? []);
  return toSummary(ownStats({ facts, achDone: list.filter((a) => a.unlocked).length, achTotal: list.length }));
}

export function summaryToSend({ leaving = false } = {}) {
  const summary = publicSummary();
  const text = JSON.stringify(summary);
  if (text === summarySent.text) return null;
  const flipped = Boolean(summary.off) !== Boolean(summarySent.off);
  if (!flipped && !leaving && summarySent.at && Date.now() - summarySent.at < SUMMARY_GAP) return null;
  return { summary, text };
}

export function summaryLanded(pending) {
  if (pending) summarySent = { text: pending.text, at: Date.now(), off: Boolean(pending.summary.off) };
}

export function paintPublicStatsBoard(node, raw, row) {
  const stats = fromSummary(raw, row);
  if (!stats) return false;
  paintStatsBoard(node, stats, { owner: false });
  return true;
}

export function paintStatsBoard(node, s, { owner = false } = {}) {
  const now = Date.now();
  const { collection: c, boosters: b, economy: e, activity: a, games: g, social: so } = s;
  const optional = (v, make) => (v > 0 ? make() : null);

  const collection = section('collection', iconSvg('collection', { size: 18 }), t('statSecCollection'), [
    tiles([
      tile('copies', t('statCopies'), n(c.copies)),
      tile('unique', t('statUnique'), n(c.unique)),
      tile('value', t('statValue'), coins(c.value), { html: true }),
      c.completion != null ? tile('completion', t('statCompletion'), pct(c.completion), {
        sub: t('statCompletionSub', { owned: n(c.families.reduce((x, f) => x + f.knownOwned, 0)), total: n(c.families.reduce((x, f) => x + f.total, 0)) })
      }) : null,
      rarityTile('bestPrint', t('statBestPrint'), c.best, c.best?.title),
      tile('albums', t('statAlbumsStarted'), n(c.albums.started), { sub: t('statAlbumsComplete', { n: n(c.albums.complete) }) }),
      optional(c.albums.editions, () => tile('editions', t('statEditions'), n(c.albums.editions))),
      optional(c.albums.medals, () => tile('medals', t('statMedals'), n(c.albums.medals))),
      optional(c.favorites, () => tile('favorites', t('statFavorites'), n(c.favorites))),
      optional(c.specials, () => tile('specials', t('statSpecials'), n(c.specials))),
      optional(c.customs, () => tile('customs', t('statCustoms'), n(c.customs)))
    ]),
    printBar(c.byPrint),
    familyRows(c.families),
    spark('new', t('statNewPerWeek'), c.newPerWeek, now)
  ]);

  const top = b.top;
  const boosters = section('boosters', iconSvg('packs', { size: 18 }), t('statSecBoosters'), [
    tiles([
      tile('boosters', t('statBoosters'), n(b.opened)),
      b.today != null ? tile('today', t('statToday'), n(b.today)) : null,
      b.week != null ? tile('week', t('statWeek'), n(b.week)) : null,
      tile('pulled', t('statCards'), n(b.cards)),
      tile('legendaryPlus', t('statLegendaryPlus'), n(b.legendaryPlus)),
      b.average != null ? tile('average', t('statAverage'), coins(b.average), { html: true }) : null,
      top ? rarityTile('bestPull', t('statBest'), top, [top.title, top.at ? date(top.at) : null].filter(Boolean).join(' · ')) : null,
      b.luck ? tile('luckiest', t('statLuckiest'), coins(b.luck.value), {
        html: true, sub: t('statLuckiestSub', { date: date(dayOf(b.luck.day)), n: n(b.luck.boosters) })
      }) : null,
      b.opened > 0 ? pityTile(b.pity) : null
    ]),
    kindChips(b.kinds),
    spark('boosters', t('statPerWeek'), b.perWeek, now),
    b.since ? h('p.stat-foot', t('statSince', { date: date(b.since) })) : null
  ]);

  const economy = section('economy', buckSvg({ size: 18 }), t('statSecEconomy'), [
    tiles([
      tile('coins', t('statCoins'), coins(e.coins), { html: true }),
      tile('ink', t('statInk'), inks(e.ink), { html: true }),
      tile('spent', t('statSpent'), coins(e.spent), { html: true, sub: t('statBuys', { n: n(e.shopBuys) }) }),
      tile('sales', t('statSellEarned'), coins(e.sellEarned), { html: true, sub: t('statSold', { n: n(e.sold) }) }),
      optional(e.fused, () => tile('fused', t('statFused'), n(e.fused))),
      optional(e.auctionsSold, () => tile('lotsSold', t('statLotsSold'), n(e.auctionsSold), e.auctionBest > 0 ? { sub: t('statLotBest', { amount: n(e.auctionBest) }) } : {})),
      optional(e.auctionsWon, () => tile('lotsWon', t('statLotsWon'), n(e.auctionsWon))),
      optional(e.bidsPlaced, () => tile('bids', t('statBids'), n(e.bidsPlaced))),
      optional(e.trades, () => tile('trades', t('statTrades'), n(e.trades))),
      optional(e.giftsSent, () => tile('giftsSent', t('statGiftsSent'), n(e.giftsSent))),
      optional(e.giftsReceived, () => tile('giftsReceived', t('statGiftsReceived'), n(e.giftsReceived))),
      optional(e.inkEarned, () => tile('inkEarned', t('statInkEarned'), inks(e.inkEarned), { html: true })),
      optional(e.inkSpent, () => tile('inkSpent', t('statInkSpent'), inks(e.inkSpent), { html: true })),
      optional(e.atelierBuys, () => tile('atelier', t('statAtelier'), n(e.atelierBuys)))
    ])
  ]);

  const activity = section('activity', iconSvg('calendar', { size: 18 }), t('statSecActivity'), [
    tiles([
      tile('playtime', t('statPlaytime'), formatDuration(a.playMs)),
      tile('since', t('statAccountAge'), date(a.createdAt ?? now)),
      tile('days', t('statDays'), n(a.days)),
      tile('streak', t('statStreak'), t('statStreakValue', { n: n(a.streak) }), { sub: t('statStreakBest', { n: n(a.bestStreak) }) }),
      tile('gifts', t('statGifts'), n(a.gifts)),
      tile('quests', t('statQuests'), n(a.quests), a.questsHard > 0 ? { sub: t('statQuestsHard', { n: n(a.questsHard) }) } : {}),
      tile('achievements', t('statAchievements'), t('statAchOf', { done: n(a.achDone), total: n(a.achTotal) }), a.achTotal ? { sub: pct(a.achDone / a.achTotal) } : {}),
      tile('season', t('statSeason', { season: tx(a.season.name) }), n(a.season.points), a.seasonBest > a.season.points ? { sub: t('statSeasonBest', { n: n(a.seasonBest) }) } : {}),
      optional(a.seasonRungs, () => tile('rungs', t('statSeasonRungs'), n(a.seasonRungs))),
      a.bestRank ? tile('bestRank', t('statBestRank'), `#${n(a.bestRank)}`) : null
    ])
  ]);

  const gameTiles = [
    optional(g.wikdlePlayed, () => tile('wikdle', t('statWikdle'), t('statWonOf', { won: n(g.wikdleWon), played: n(g.wikdlePlayed) }), g.wikdleBest > 0 ? { sub: t('statWikdleBest', { n: n(g.wikdleBest) }) } : {})),
    optional(g.quizPlayed, () => tile('quiz', t('statQuiz'), n(g.quizPlayed), { sub: t('statQuizSub', { wins: n(g.quizWins), perfect: n(g.quizPerfect) }) })),
    optional(g.duelBest + g.duelRounds, () => tile('duel', t('statDuel'), n(g.duelBest), g.duelRounds > 0 ? { sub: t('statDuelSub', { n: n(g.duelRounds) }) } : {})),
    optional(g.revealRounds, () => tile('reveal', t('statReveal'), n(g.revealRounds), g.revealPerfect > 0 ? { sub: t('statRevealSub', { n: n(g.revealPerfect) }) } : {})),
    optional(g.versusPlayed, () => tile('versus', t('statVersus'), t('statWonOf', { won: n(g.versusWins), played: n(g.versusPlayed) }))),
    optional(g.arcadePoints, () => tile('arcade', t('statArcade'), n(g.arcadePoints)))
  ].filter(Boolean);
  const games = section('games', iconSvg('dice', { size: 18 }), t('statSecGames'), [
    gameTiles.length ? tiles(gameTiles) : h('p.stat-foot', t('statNoGames'))
  ]);

  const online = !owner || (account.configured && signedIn());
  const social = section('social', iconSvg('friends', { size: 18 }), t('statSecSocial'), [
    tiles([
      online ? tile('friends', t('statFriends'), n(so.friends)) : null,
      so.guild ? tile('guild', t('statGuild'), so.guild.tag ? `${so.guild.name} [${so.guild.tag}]` : so.guild.name, so.guildDonated > 0 ? { sub: t('statGuildSub', { n: n(so.guildDonated) }) } : {}) : null,
      optional(so.guildGoals, () => tile('guildGoals', t('statGuildGoals'), n(so.guildGoals))),
      online || so.messages ? tile('messages', t('statMessages'), n(so.messages), so.conversations > 0 ? { sub: t('statChats', { n: n(so.conversations) }) } : {}) : null,
      optional(so.kudosGiven, () => tile('kudos', t('statKudos'), n(so.kudosGiven))),
      tile('showcase', t('statShowcase'), `${n(so.showcase)} / ${n(so.showcaseMax)}`)
    ])
  ]);

  node.replaceChildren(...[collection, boosters, economy, activity, games, social].filter(Boolean));
  return node;
}
