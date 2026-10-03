import { RARITIES } from '../src/data/rarities.js';
import { rollRarity } from '../src/data/odds.js';
import { STIPEND, STIPEND_MAX_BANKED, STARTER_COINS, STARTER_PACKS, STARTER_PACK_CARDS, FREE_SLOTS, FREE_CARDS,
  SELL_RATE, boosterPrice, expectedCardValue } from '../src/economy.js';
import { weekLadder } from '../src/daily.js';
import { WIKDLE_POINTS } from '../src/wikdle.js';
import { QUIZ_MONEY, QUIZ_PER_DAY } from '../src/quizrules.js';
import { QUESTS, QUEST_TIERS, QUESTS_PER_DAY } from '../src/data/quests.js';
import { addXp, rewardForLevel, xpForCard } from '../src/progression.js';
import { ACHIEVEMENTS } from '../src/achievements.js';
import { inkForQuestTier, INK_DAILY_WEEK } from '../src/ink.js';
import { AD_REWARDS, AD_DAILY_CAP } from '../src/data/supporter.js';

const DAYS = Number(process.env.DAYS ?? 30);
const RUNS = Number(process.env.RUNS ?? 40);

const PLAYERS = {
  casual: { sessions: 1, wikdle: 0, quiz: 0, questShare: 0.4, freeWindows: 1, sellDupes: false, ads: 1, keep: 0 },
  regular: { sessions: 3, wikdle: 1, quiz: 2, questShare: 0.8, freeWindows: 3, sellDupes: true, ads: 3, keep: 500 },
  grinder: { sessions: 6, wikdle: 1, quiz: 5, questShare: 1, freeWindows: 6, sellDupes: true, ads: AD_DAILY_CAP, keep: 1500 }
};

const ANY = { kind: 'open', themeId: null, rarityId: null, cards: 5 };
const PRICE = boosterPrice(ANY);
const CARD_VALUE = expectedCardValue(ANY);

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

function questDay() {
  const tiers = Object.entries(QUEST_TIERS).map(([id, t]) => [id, t.weight]);
  const total = tiers.reduce((sum, [, w]) => sum + w, 0);
  const board = [];
  for (let i = 0; i < QUESTS_PER_DAY; i++) {
    let ticket = rnd() * total;
    let tier = tiers[0][0];
    for (const [id, w] of tiers) { ticket -= w; if (ticket <= 0) { tier = id; break; } }
    const pool = QUESTS.filter((q) => q.tier === tier);
    board.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return board.map((q) => ({ money: q.reward?.money ?? 0, ink: inkForQuestTier(q.tier) }));
}

function coinsOf(reward) {
  if (!reward) return 0;
  if (reward.kind === 'coins') return reward.coins ?? 0;
  return 0;
}

function simulate(kind, { withAds }) {
  const p = PLAYERS[kind];
  const s = {
    wallet: STARTER_COINS, ink: 0, cards: 0, unique: 0, boosters: 0, progress: { level: 1, xp: 0 },
    quizPlayed: 0, wikdlePlays: 0, dailyClaims: 0, questsClaimed: 0, playDays: 0, shopBuys: 0, spent: 0, sold: 0
  };
  const income = { stipend: 0, daily: 0, quests: 0, wikdle: 0, quiz: 0, levels: 0, achievements: 0, selling: 0, ads: 0, starter: STARTER_COINS };
  const spend = { boosters: 0 };
  const opened = { bought: 0, free: 0, rewards: STARTER_PACKS, ads: 0 };
  const unlocked = new Set();
  let inkIn = 0;

  const open = (cards) => {
    s.boosters++;
    for (let i = 0; i < cards; i++) {
      const rarity = rollRarity(null, rnd);
      s.cards++;
      const dupe = rnd() < Math.min(0.35, s.unique / 40000);
      if (dupe) {
        if (p.sellDupes) { const got = Math.round(CARD_VALUE * SELL_RATE); s.wallet += got; income.selling += got; s.sold++; }
      } else {
        s.unique++;
      }
      const before = s.progress.level;
      addXp(s.progress, xpForCard(rarity.id ?? rarity));
      for (let lv = before + 1; lv <= s.progress.level; lv++) {
        const r = rewardForLevel(lv);
        if (r.coins) { s.wallet += r.coins; income.levels += r.coins; }
        if (r.spec) { opened.rewards++; pending.push(r.spec.cards ?? 3); }
      }
    }
  };
  const pending = [];
  for (let i = 0; i < STARTER_PACKS; i++) open(STARTER_PACK_CARDS);

  for (let day = 0; day < DAYS; day++) {
    s.playDays++;
    const stipend = Math.min(12, p.sessions * STIPEND_MAX_BANKED) * STIPEND;
    s.wallet += stipend; income.stipend += stipend;

    const ladder = weekLadder(Math.floor(day / 7));
    const gift = ladder[day % 7]?.coins ?? 0;
    s.wallet += gift; income.daily += gift; s.dailyClaims++;
    if (day % 7 === 6) { s.ink += INK_DAILY_WEEK; inkIn += INK_DAILY_WEEK; }

    for (const q of questDay()) {
      if (rnd() > p.questShare) continue;
      s.wallet += q.money; income.quests += q.money; s.ink += q.ink; inkIn += q.ink; s.questsClaimed++;
    }
    if (p.wikdle) {
      const pts = Math.round(WIKDLE_POINTS[Math.min(WIKDLE_POINTS.length - 1, Math.floor(rnd() * 4))] * 0.9);
      s.wallet += pts; income.wikdle += pts; s.wikdlePlays++;
    }
    for (let i = 0; i < Math.min(QUIZ_PER_DAY, p.quiz); i++) {
      const pay = rnd() < 0.3 ? QUIZ_MONEY.large : rnd() < 0.7 ? QUIZ_MONEY.medium : QUIZ_MONEY.small;
      s.wallet += pay; income.quiz += pay; s.quizPlayed++;
    }
    if (withAds) {
      for (let i = 0; i < Math.min(AD_DAILY_CAP, p.ads); i++) {
        const pick = i % 3;
        if (pick === 0) { s.wallet += AD_REWARDS.coins.amount; income.ads += AD_REWARDS.coins.amount; }
        else if (pick === 1) { s.ink += AD_REWARDS.ink.amount; inkIn += AD_REWARDS.ink.amount; }
        else { opened.ads++; pending.push(AD_REWARDS.booster.spec.cards); }
      }
    }
    for (let i = 0; i < p.freeWindows * FREE_SLOTS; i++) { opened.free++; open(FREE_CARDS); }
    while (pending.length) open(pending.shift());

    while (s.wallet - p.keep >= PRICE) {
      s.wallet -= PRICE; spend.boosters += PRICE; s.spent += PRICE; s.shopBuys++; opened.bought++;
      open(ANY.cards);
    }

    const facts = {
      boosters: s.boosters, cards: s.cards, unique: s.unique, level: s.progress.level, dailyClaims: s.dailyClaims,
      quizPlayed: s.quizPlayed, wikdlePlays: s.wikdlePlays, questsClaimed: s.questsClaimed, playDays: s.playDays,
      shopBuys: s.shopBuys, spent: s.spent, sold: s.sold, commons: Math.round(s.cards * 0.6)
    };
    for (const a of ACHIEVEMENTS) {
      if (unlocked.has(a.id) || (facts[a.stat] ?? 0) < a.need) continue;
      unlocked.add(a.id);
      const c = coinsOf(a.reward);
      s.wallet += c; income.achievements += c;
    }
  }
  return { income, spend, opened, cards: s.cards, unique: s.unique, level: s.progress.level, ink: inkIn, wallet: s.wallet };
}

function average(kind, opts) {
  const runs = Array.from({ length: RUNS }, (_, i) => { seed = 7 + i * 101; return simulate(kind, opts); });
  const avg = (get) => runs.reduce((sum, r) => sum + get(r), 0) / runs.length;
  const keys = (obj) => Object.keys(obj);
  const first = runs[0];
  return {
    income: Object.fromEntries(keys(first.income).map((k) => [k, avg((r) => r.income[k])])),
    spend: Object.fromEntries(keys(first.spend).map((k) => [k, avg((r) => r.spend[k])])),
    opened: Object.fromEntries(keys(first.opened).map((k) => [k, avg((r) => r.opened[k])])),
    cards: avg((r) => r.cards), unique: avg((r) => r.unique), level: avg((r) => r.level), ink: avg((r) => r.ink), wallet: avg((r) => r.wallet)
  };
}

const n = (x) => Math.round(x).toLocaleString('en-US');
console.log(`# ${DAYS} days, ${RUNS} runs each. A 5-card booster costs ${n(PRICE)}; a card is worth ${n(CARD_VALUE)} on average.\n`);
for (const kind of Object.keys(PLAYERS)) {
  const base = average(kind, { withAds: false });
  const ads = average(kind, { withAds: true });
  const total = (r) => Object.values(r.income).reduce((a, b) => a + b, 0);
  console.log(`## ${kind}`);
  console.log('| | without videos | with videos |');
  console.log('| --- | ---: | ---: |');
  for (const k of Object.keys(base.income)) console.log(`| earned from ${k} | ${n(base.income[k])} | ${n(ads.income[k])} |`);
  console.log(`| **earned in total** | **${n(total(base))}** | **${n(total(ads))}** |`);
  console.log(`| spent on boosters | ${n(base.spend.boosters)} | ${n(ads.spend.boosters)} |`);
  console.log(`| left in the wallet | ${n(base.wallet)} | ${n(ads.wallet)} |`);
  console.log(`| boosters opened (bought / free / rewards / videos) | ${n(base.opened.bought)} / ${n(base.opened.free)} / ${n(base.opened.rewards)} / ${n(base.opened.ads)} | ${n(ads.opened.bought)} / ${n(ads.opened.free)} / ${n(ads.opened.rewards)} / ${n(ads.opened.ads)} |`);
  console.log(`| cards, different cards | ${n(base.cards)}, ${n(base.unique)} | ${n(ads.cards)}, ${n(ads.unique)} |`);
  console.log(`| level reached | ${base.level.toFixed(0)} | ${ads.level.toFixed(0)} |`);
  console.log(`| Ink earned | ${n(base.ink)} | ${n(ads.ink)} |`);
  console.log(`| videos add to earnings | | ${((total(ads) / total(base) - 1) * 100).toFixed(1)}% coins, ${((ads.ink / Math.max(1, base.ink) - 1) * 100).toFixed(0)}% Ink |`);
  console.log('');
}
