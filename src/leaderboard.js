import { supabase } from './account.js';
import { msToSeasonEnd } from './season.js';
import { emit } from './ui/bus.js';
import { msUntilNextUtcDay, msUntilNextUtcWeek, utcDay } from './days.js';

export const WINDOWS = ['daily', 'weekly', 'season', 'alltime'];
export const PAGE_SIZE = 20;
const TIMEOUT_MS = 10000;

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS))
]);

export async function fetchPage(window = 'daily', page = 0) {
  if (!supabase) throw new Error('CLOSED');
  if (!WINDOWS.includes(window)) throw new Error('BAD_WINDOW');
  const { data, error } = await withTimeout(supabase.rpc('leaderboard_page', { p_window: window, p_page: page }));
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? '') ? 'SCHEMA' : error.message);
  const rows = (data ?? []).map((r) => ({
    rank: Number(r.rank), userId: r.user_id, username: r.username ?? '?', score: Number(r.score) || 0
  }));
  return { rows, page, more: rows.length === PAGE_SIZE };
}

export async function fetchMyRank(window = 'daily') {
  if (!supabase) throw new Error('CLOSED');
  const { data, error } = await withTimeout(supabase.rpc('my_rank', { p_window: window }));
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? '') ? 'SCHEMA' : error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.rank == null) return null;
  return { rank: Number(row.rank), score: Number(row.score) || 0, total: Number(row.total) || 0 };
}

export const GAME_MAX = { wikdle: 1400, duel: 3100, reveal: 1600, quiz: 1000 };

export { utcDay };

const QUEUE_KEY = 'wikster.scores.queue.v1';
const readQueue = () => { try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
const writeQueue = (q) => { try { if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); else localStorage.removeItem(QUEUE_KEY); } catch {} };
const REFUSED = /out of range|not scored|sign in/i;
let flushing = null;

async function send(entry) {
  const { error } = await withTimeout(supabase.rpc('submit_score', { p_game: entry.game, p_points: entry.points, p_day: entry.day }));
  if (error) throw new Error(error.message);
}

export async function flushScores() {
  if (!supabase) return 0;
  if (flushing) return flushing;
  flushing = (async () => {
    let landed = 0;
    let queue = readQueue();
    while (queue.length) {
      const entry = queue[0];
      try {
        await send(entry);
        landed += 1;
      } catch (error) {
        if (!REFUSED.test(String(error?.message ?? ''))) break;
      }
      queue = queue.slice(1);
      writeQueue(queue);
    }
    if (landed) emit('score', { landed });
    return landed;
  })();
  try { return await flushing; } finally { flushing = null; }
}

export async function submitScore(game, points, day = utcDay()) {
  const max = GAME_MAX[game];
  if (!max) throw new Error('this game is not scored by the client');
  const clean = Math.max(0, Math.min(max, Math.round(Number(points) || 0)));
  if (clean <= 0) return;
  writeQueue([...readQueue(), { game, points: clean, day, at: Date.now() }]);
  if (!supabase) throw new Error('CLOSED');
  await flushScores();
  if (readQueue().some((e) => e.game === game && e.day === day && e.points === clean)) throw new Error('QUEUED');
}

export const pendingScores = () => readQueue().length;

export const submitWikdle = (points, day) => submitScore('wikdle', points, day);

export function msToReset(window, now = Date.now()) {
  if (window === 'alltime') return null;
  if (window === 'season') return msToSeasonEnd(now);
  return window === 'weekly' ? msUntilNextUtcWeek(now) : msUntilNextUtcDay(now);
}
