import { THEME_PACKS } from './data/packs.js';
import { tune } from './live.js';
import { DAY_MS, utcDayIndex as utcDayNumber } from './days.js';

export const WEEK = 7;

export { utcDayIndex as utcDayNumber, msUntilNextUtcDay } from './days.js';

function seeded(seed) {
  let a = (seed >>> 0) + 0x9e3779b9;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

export const loyaltyPct = (weeks) => Math.min(50, 2 * (Number(weeks) || 0));
const withLoyalty = (coins, weeks) => Math.round((coins * tune('daily.coinsMult') * (1 + loyaltyPct(weeks) / 100)) / 10) * 10;

export function weekLadder(weeks = 0) {
  const rng = seeded((Number(weeks) || 0) * 7919 + 101);
  const theme = () => THEME_PACKS[Math.floor(rng() * THEME_PACKS.length)].id;
  const booster = (rarityId, cards) => ({ kind: 'theme', themeId: theme(), rarityId, cards });
  return [
    { day: 1, coins: withLoyalty(250, weeks) },
    { day: 2, coins: withLoyalty(350, weeks) },
    { day: 3, spec: booster(null, 3) },
    { day: 4, coins: withLoyalty(500, weeks) },
    { day: 5, coins: withLoyalty(700, weeks) },
    { day: 6, spec: booster('rare', 4) },
    { day: 7, coins: withLoyalty(1000, weeks), spec: booster('epic', 5) }
  ];
}

export const emptyDaily = () => ({ v: 2, day: 0, weeks: 0, lastDay: null, shownDay: null });

export function normalizeDaily(daily, now = Date.now()) {
  if (daily && daily.v === 2) return daily;
  const old = daily ?? {};
  const claimed = Number(old.claimed) || 0;
  const boards = Number(old.board) || 0;
  const localToday = Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / DAY_MS);
  const ago = Number.isFinite(old.lastDay) ? Math.max(0, localToday - old.lastDay) : null;
  return {
    v: 2,
    day: claimed % WEEK,
    weeks: Math.floor((boards * 30 + claimed) / WEEK),
    lastDay: ago == null ? null : utcDayNumber(now) - ago,
    shownDay: null
  };
}

export const streakAlive = (daily, now = Date.now()) =>
  daily?.lastDay != null && daily.lastDay >= utcDayNumber(now) - 1;

export const canClaim = (daily, now = Date.now()) => (daily?.lastDay ?? null) !== utcDayNumber(now);

export const nextIndex = (daily, now = Date.now()) =>
  (!daily?.lastDay || streakAlive(daily, now)) ? (Number(daily?.day) || 0) % WEEK : 0;

export function claim(daily, now = Date.now()) {
  if (!canClaim(daily, now)) return null;
  const alive = daily.lastDay != null && streakAlive(daily, now);
  daily.run = (alive ? Math.max(Number(daily.run) || 0, Number(daily.day) || 0) : 0) + 1;
  daily.best = Math.max(Number(daily.best) || 0, daily.run);
  daily.total = (Number(daily.total) || 0) + 1;
  if (daily.lastDay != null && !streakAlive(daily, now)) daily.day = 0;
  const index = (Number(daily.day) || 0) % WEEK;
  const gift = weekLadder(daily.weeks)[index];
  daily.day = index + 1;
  daily.lastDay = utcDayNumber(now);
  let weekDone = false;
  if (daily.day >= WEEK) {
    daily.day = 0;
    daily.weeks = (Number(daily.weeks) || 0) + 1;
    weekDone = true;
  }
  return { index, day: index + 1, gift, weekDone };
}
