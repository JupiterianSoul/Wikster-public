import { utcDay } from './days.js';
export const DUEL_ROUND_LENGTH = 15;
export const DUEL_PER_DAY = 3;
export const DUEL_BASE = 100;
export const DUEL_STEP = 10;
export const DUEL_PERFECT_BONUS = 500;
export const DUEL_COIN_RATE = 0.25;
export const DUEL_MIN_CARDS = 10;
export const DUEL_MAX_POINTS = pointsFor(DUEL_ROUND_LENGTH) + DUEL_PERFECT_BONUS;

const STATE_KEY = 'wikster.duel.v1';

export { utcDay };

export function pointsFor(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += DUEL_BASE + DUEL_STEP * i;
  return sum;
}

export const nextPoints = (streak) => DUEL_BASE + DUEL_STEP * streak;

export const coinsFor = (points) => Math.round(points * DUEL_COIN_RATE);

export function eligible(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    const views = Number(e?.views);
    if (!e?.key || !e.title || !Number.isFinite(views) || views <= 0 || e.special) return false;
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });
}

export const canPlay = (entries) => eligible(entries).length >= DUEL_MIN_CARDS;

export function challengerFor(left, pool, used, rng = Math.random) {
  const options = pool.filter((e) => e.key !== left.key && !used.has(e.key) && Number(e.views) !== Number(left.views));
  if (!options.length) return null;
  return options[Math.floor(rng() * options.length)];
}

export function startRound(entries, rng = Math.random) {
  const pool = eligible(entries);
  if (pool.length < DUEL_MIN_CARDS) return null;
  const left = pool[Math.floor(rng() * pool.length)];
  const used = new Set([left.key]);
  const right = challengerFor(left, pool, used, rng);
  if (!right) return null;
  used.add(right.key);
  return { pool, used, left, right, streak: 0, points: 0, over: false, perfect: false, last: null };
}

export function answer(round, call, rng = Math.random) {
  if (!round || round.over) return round;
  const higher = Number(round.right.views) > Number(round.left.views);
  const right = (call === 'higher') === higher;
  const last = { left: round.left, right: round.right, call, correct: right };
  if (!right) return { ...round, over: true, last };
  const streak = round.streak + 1;
  const points = round.points + nextPoints(round.streak);
  if (streak >= DUEL_ROUND_LENGTH) {
    return { ...round, streak, points: points + DUEL_PERFECT_BONUS, over: true, perfect: true, last };
  }
  const used = new Set(round.used);
  const challenger = challengerFor(round.right, round.pool, used, rng);
  if (!challenger) return { ...round, streak, points, over: true, last };
  used.add(challenger.key);
  return { ...round, used, left: round.right, right: challenger, streak, points, over: false, last };
}

export function loadDay(now = Date.now()) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null'); } catch {}
  const day = utcDay(now);
  if (!saved || saved.day !== day) return { day, rounds: 0, best: 0, points: 0 };
  return { day, rounds: Number(saved.rounds) || 0, best: Number(saved.best) || 0, points: Number(saved.points) || 0 };
}

export function saveDay(ledger) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(ledger)); } catch {}
}

export const roundsLeft = (now = Date.now()) => Math.max(0, DUEL_PER_DAY - loadDay(now).rounds);

export function recordRound(round, now = Date.now()) {
  const ledger = loadDay(now);
  ledger.rounds += 1;
  ledger.best = Math.max(ledger.best, round.points);
  ledger.points += round.points;
  saveDay(ledger);
  return ledger;
}
