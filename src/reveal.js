import { utcDay } from './days.js';
export const REVEAL_ROUND_LENGTH = 8;
export const REVEAL_PER_DAY = 3;
export const REVEAL_POINTS = [200, 120, 60];
export const REVEAL_BLUR = [14, 7, 2];
export const REVEAL_STEP_MS = 6000;
export const REVEAL_COIN_RATE = 0.3;
export const REVEAL_CHOICES = 4;
export const REVEAL_MIN_CARDS = 12;
export const REVEAL_MAX_POINTS = REVEAL_ROUND_LENGTH * REVEAL_POINTS[0];

const STATE_KEY = 'wikster.reveal.v1';

export { utcDay };

export const coinsFor = (points) => Math.round(points * REVEAL_COIN_RATE);

const never = (_card) => false;

export function eligible(entries, isSensitive = never) {
  const seen = new Set();
  return entries.filter((e) => {
    if (!e?.key || !e.title || !e.thumbnail || e.special) return false;
    if (seen.has(e.key) || isSensitive(e)) return false;
    seen.add(e.key);
    return true;
  });
}

export const canPlay = (entries, isSensitive = never) => eligible(entries, isSensitive).length >= REVEAL_MIN_CARDS;

const shuffle = (list, rng) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function choicesFor(card, pool, rng = Math.random) {
  const others = pool.filter((e) => e.key !== card.key && e.title !== card.title);
  const sameAlbum = others.filter((e) => e.packId && e.packId === card.packId);
  const from = sameAlbum.length >= REVEAL_CHOICES - 1 ? sameAlbum : others;
  const decoys = shuffle(from, rng).slice(0, REVEAL_CHOICES - 1);
  return shuffle([card, ...decoys], rng).map((e) => ({ key: e.key, title: e.title }));
}

export function startRound(entries, { isSensitive = never, rng = Math.random } = {}) {
  const pool = eligible(entries, isSensitive);
  if (pool.length < REVEAL_MIN_CARDS) return null;
  const cards = shuffle(pool, rng).slice(0, REVEAL_ROUND_LENGTH);
  return {
    items: cards.map((card) => ({ card, choices: choicesFor(card, pool, rng), step: 0, picked: null, points: 0 })),
    index: 0, points: 0, over: false, right: 0
  };
}

export function lift(round) {
  const item = round.items[round.index];
  if (!item || item.picked !== null) return round;
  if (item.step >= REVEAL_BLUR.length - 1) return round;
  const items = round.items.map((it, i) => (i === round.index ? { ...it, step: it.step + 1 } : it));
  return { ...round, items };
}

export function pick(round, key) {
  const item = round.items[round.index];
  if (!item || item.picked !== null || round.over) return round;
  const correct = key === item.card.key;
  const points = correct ? REVEAL_POINTS[item.step] : 0;
  const items = round.items.map((it, i) => (i === round.index ? { ...it, picked: key, points, correct } : it));
  return { ...round, items, points: round.points + points, right: round.right + (correct ? 1 : 0) };
}

export function advance(round) {
  const item = round.items[round.index];
  if (!item || item.picked === null) return round;
  if (round.index + 1 >= round.items.length) return { ...round, over: true };
  return { ...round, index: round.index + 1 };
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

export const roundsLeft = (now = Date.now()) => Math.max(0, REVEAL_PER_DAY - loadDay(now).rounds);

export function recordRound(round, now = Date.now()) {
  const ledger = loadDay(now);
  ledger.rounds += 1;
  ledger.best = Math.max(ledger.best, round.points);
  ledger.points += round.points;
  saveDay(ledger);
  return ledger;
}
