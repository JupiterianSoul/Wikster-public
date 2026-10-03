import { specColours, specIcon, specId, specName, toDrawPack } from '../booster.js';
import { priceFor } from '../pricing.js';
import { noNsfwMeta } from '../age.js';
import { cardAllowed } from '../wiki/safety.js';
import { rarityById, rarityOfCard, rarityRank } from '../data/rarities.js';
import { THEME_PACKS } from '../data/packs.js';
import { questById } from '../data/quests.js';
import { INK_GUILD_GOAL, INK_GUILD_MATCH, INK_SEASON_QUEST, inkForQuestTier } from '../ink.js';
import { POINTS_GUILD_GOAL, POINTS_QUEST, TRACK, TRACK_REWARDS, seasonById } from '../data/seasons.js';
import { seasonAt, seasonQuestOf, seasonSpec } from '../season.js';
import {
  FAST_SOLVE_ROWS, HINTS_MAX, LANGS, ROWS, COLUMNS, STREAK_BOOSTER_EVERY, isWord, loadWords, scoreGuess,
  streakBonus, wikdlePoints, wordForDay
} from '../wikdle.js';
import { DUEL_PERFECT_BONUS, DUEL_PER_DAY, DUEL_ROUND_LENGTH, coinsFor as duelCoins, pointsFor as duelPoints } from '../duel.js';
import { REVEAL_PER_DAY, REVEAL_POINTS, REVEAL_ROUND_LENGTH, coinsFor as revealCoins } from '../reveal.js';
import { QUIZ_PER_DAY, QUIZ_POINTS_PER_ANSWER, questionCountFor, quizRewards } from '../quizrules.js';
import { PAY as VERSUS_PAY } from '../versus.js';
import { GUILD_GOAL_BOOSTER, GUILD_GOAL_PAY, GUILD_MATCH_PAY } from '../guildrules.js';
import { t } from '../i18n.js';
import { WIPE_EVERY_DAYS, starterCoins } from '../economy.js';
import { entryToRow, pullEntry, rowToEntry } from './cards.js';
import { ECON_KEYS, clone, commit, dayBefore, fail, invOp, utcDay } from './core.js';
import { dayBeforeDay } from '../days.js';
import { addXp } from '../progression.js';
import { track } from './track.js';

export const VERSUS_PAID_PER_DAY = 10;
export { WIPE_EVERY_DAYS };
export const GRANT_CARDS_MAX = 12;

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);
const prevDay = dayBeforeDay;

function dayCounter(state, key, day) {
  const held = state[key];
  return held?.day === day ? clone(held) : { day };
}

function cardFrom(article, rarityId, spec, now, pack = {}) {
  const rarity = rarityById(rarityId);
  const pull = {
    article,
    rarityId: rarity.id,
    price: priceFor(Number(article.popularity) || 0, rarity),
    packName: pack.name ?? specName(spec),
    packIcon: pack.icon ?? specIcon(spec),
    packAccent: pack.accent !== undefined ? pack.accent : specColours(spec).accent
  };
  return pullEntry(pull, specId(spec), now);
}

async function settleArcade(ctx, game, { points, correct }) {
  const loaded = await ctx.store.load();
  const day = utcDay(ctx.now);
  const cap = game === 'duel' ? DUEL_PER_DAY : REVEAL_PER_DAY;
  const games = dayCounter(loaded.state, 'games', day);
  const played = Number(games[game]) || 0;
  if (played >= cap) fail('DAILY_CAP');
  const p = int(points);
  const c = int(correct);
  if (game === 'duel') {
    if (!(c >= 0 && c <= DUEL_ROUND_LENGTH)) fail('BAD_ROUND');
    const expect = duelPoints(c) + (c === DUEL_ROUND_LENGTH ? DUEL_PERFECT_BONUS : 0);
    if (p !== expect) fail('BAD_ROUND');
  } else {
    if (!(c >= 0 && c <= REVEAL_ROUND_LENGTH)) fail('BAD_ROUND');
    const hi = c * REVEAL_POINTS[0];
    const lo = c * REVEAL_POINTS[REVEAL_POINTS.length - 1];
    if (!(p >= lo && p <= hi) || p % 20 !== 0) fail('BAD_ROUND');
  }
  const coins = game === 'duel' ? duelCoins(p) : revealCoins(p);
  games[game] = played + 1;
  const perfect = game === 'duel' ? c === DUEL_ROUND_LENGTH : c === REVEAL_ROUND_LENGTH && p === REVEAL_ROUND_LENGTH * REVEAL_POINTS[0];
  const events = [{ m: game, d: { points: p, correct: c, perfect } }];
  if (p > 0) events.push({ m: 'points', d: { amount: p, game } });
  const tracked = track(loaded.state, events, ctx.now);
  return commit(ctx, loaded, {
    coins,
    state: { games, ...tracked.state },
    claims: [`${game}:${day}:${played + 1}`],
    score: { game, points: p, day },
    kind: game, detail: { points: p, correct: c }
  }, { extra: { paid: coins, points: p, left: cap - played - 1, season: tracked.season } });
}

function applyPath(target, path, fn) {
  const parts = String(path ?? '').split('.').filter(Boolean);
  if (!parts.length) return false;
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== 'object' || !node[part]) node[part] = {};
    node = node[part];
  }
  const last = parts.at(-1);
  node[last] = fn(node[last]);
  return true;
}

export const REWARD_ACTIONS = {
  async quest(ctx, { id }) {
    const loaded = await ctx.store.load();
    const day = utcDay(ctx.now);
    const quest = questById(String(id ?? '')) ?? fail('UNKNOWN');
    const taken = loaded.state.questDay?.day === day && Array.isArray(loaded.state.questDay.ids) ? loaded.state.questDay.ids : [];
    if (taken.includes(quest.id)) fail('ALREADY_CLAIMED');
    const facts = (await ctx.store.facts('quest', { day, id: quest.id })) ?? fail('NOT_CLAIMABLE');
    if (facts.claimed) fail('ALREADY_CLAIMED');
    if (!(facts.progress >= facts.target)) fail('NOT_DONE');
    const ink = inkForQuestTier(quest.tier);
    const tracked = track(loaded.state, [], ctx.now, POINTS_QUEST);
    return commit(ctx, loaded, {
      coins: quest.reward.money ?? 0,
      ink,
      inventory: quest.reward.booster ? [invOp(quest.reward.booster, 1)] : [],
      state: { ...tracked.state, questDay: { day, ids: [...taken, quest.id] } },
      marks: [{ kind: 'quest', day, id: quest.id }],
      claims: [`quest:${day}:${quest.id}`],
      kind: 'quest', detail: { id: quest.id }
    }, { extra: { reward: quest.reward, ink, tier: quest.tier, season: tracked.season } });
  },

  async seasonRung(ctx, { index }) {
    const loaded = await ctx.store.load();
    const i = int(index);
    const need = TRACK[i] ?? fail('UNKNOWN');
    const { key } = seasonAt(ctx.now);
    const seasons = clone(loaded.state.seasons ?? {});
    const entry = (seasons[key] ??= { points: 0, claimed: [], quests: {} });
    entry.claimed ??= [];
    entry.quests ??= {};
    if (!((Number(entry.points) || 0) >= need)) fail('NOT_EARNED');
    if (entry.claimed.includes(i)) fail('ALREADY_CLAIMED');
    entry.claimed.push(i);
    const season = seasonById(key.slice(key.indexOf('-') + 1));
    const reward = TRACK_REWARDS[i];
    const unlocks = clone(loaded.state.seasonUnlocks ?? { themes: [], badges: [] });
    unlocks.themes ??= [];
    unlocks.badges ??= [];
    if (reward.theme && season && !unlocks.themes.includes(season.id)) unlocks.themes.push(season.id);
    if (reward.badge && season && !unlocks.badges.includes(season.id)) unlocks.badges.push(season.id);
    const spec = reward.booster && season ? seasonSpec(season, reward.booster) : null;
    return commit(ctx, loaded, {
      coins: reward.money ?? 0,
      ink: reward.ink ?? 0,
      inventory: spec ? [invOp(spec, 1)] : [],
      state: { seasons, seasonUnlocks: unlocks },
      claims: [`rung:${key}:${i}`],
      kind: 'season', detail: { key, index: i }
    }, { extra: { reward, spec, seasonId: season?.id ?? null } });
  },

  async seasonQuest(ctx) {
    const loaded = await ctx.store.load();
    const { quest, day, key } = seasonQuestOf(ctx.now);
    const held = loaded.state.seasonDay;
    const progress = held?.day === day && held?.key === key ? Number(held.progress) || 0 : 0;
    if (progress < quest.target) fail('NOT_DONE');
    if (loaded.state.seasons?.[key]?.quests?.[day]) fail('ALREADY_CLAIMED');
    const tracked = track(loaded.state, [], ctx.now, POINTS_QUEST);
    const entry = (tracked.state.seasons[key] ??= { points: 0, claimed: [], quests: {} });
    entry.quests = { ...(entry.quests ?? {}), [day]: true };
    return commit(ctx, loaded, {
      coins: quest.reward.money ?? 0,
      ink: INK_SEASON_QUEST,
      state: tracked.state,
      claims: [`squest:${key}:${day}`],
      kind: 'season-quest', detail: { id: quest.id, day }
    }, { extra: { quest: { id: quest.id, reward: quest.reward }, ink: INK_SEASON_QUEST, season: tracked.season } });
  },

  async wikdle(ctx, { day, lang, guesses, hints = 0 }) {
    const today = utcDay(ctx.now);
    if (day !== today && day !== dayBefore(ctx.now)) fail('BAD_DAY');
    const id = LANGS.includes(lang) ? lang : fail('BAD_LANG');
    const h = int(hints);
    if (!(h >= 0 && h <= HINTS_MAX)) fail('BAD_GAME');
    if (!Array.isArray(guesses) || !guesses.length || guesses.length > ROWS) fail('BAD_GAME');
    await loadWords(id);
    const answer = wordForDay(day, id);
    const rows = [];
    let status = 'playing';
    for (const raw of guesses) {
      if (status !== 'playing') fail('BAD_GAME');
      const word = String(raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
      if (word.length !== COLUMNS || !isWord(word, id)) fail('BAD_GAME');
      const marks = scoreGuess(word, answer);
      rows.push({ guess: word, marks });
      if (marks.every((m) => m === 'hit')) status = 'won';
      else if (rows.length >= ROWS) status = 'lost';
    }
    if (status === 'playing') fail('NOT_DONE');
    const loaded = await ctx.store.load();
    const stats = clone(loaded.state.wikdleStats ?? { played: 0, won: 0, streak: 0, best: 0, lastWonDay: null });
    stats.played = (Number(stats.played) || 0) + 1;
    if (status === 'won') {
      stats.won = (Number(stats.won) || 0) + 1;
      if (stats.lastWonDay !== day) stats.streak = stats.lastWonDay === prevDay(day) ? (Number(stats.streak) || 0) + 1 : 1;
      stats.best = Math.max(Number(stats.best) || 0, stats.streak);
      stats.lastWonDay = day;
    } else if (stats.lastWonDay !== day) {
      stats.streak = 0;
    }
    const points = wikdlePoints({ status, rows, hints: new Array(h).fill('') });
    const coins = points > 0 ? Math.round(points * 0.9 * (1 + streakBonus(stats.streak))) : 0;
    const specs = [];
    if (points > 0 && rows.length <= FAST_SOLVE_ROWS) specs.push({ kind: 'open', themeId: null, rarityId: 'rare', cards: 1 });
    if (points > 0 && stats.streak > 0 && stats.streak % STREAK_BOOSTER_EVERY === 0) {
      specs.push({ kind: 'open', themeId: null, rarityId: 'uncommon', cards: 3 });
    }
    const events = [{ m: 'wikdle', d: { won: status === 'won', guesses: rows.length } }];
    if (points > 0) events.push({ m: 'points', d: { amount: points, game: 'wikdle' } });
    const tracked = track(loaded.state, events, ctx.now);
    return commit(ctx, loaded, {
      coins,
      inventory: specs.map((spec) => invOp(spec, 1)),
      state: { wikdleStats: stats, ...tracked.state },
      claims: [`wikdle:${id}:${day}`],
      score: { game: 'wikdle', points, day },
      kind: 'wikdle', detail: { day, lang: id, rows: rows.length, won: status === 'won' }
    }, { extra: { status, rows, points, paid: coins, specs, stats, season: tracked.season } });
  },

  async arcade(ctx, { game, points, correct }) {
    if (game !== 'duel' && game !== 'reveal') fail('UNKNOWN');
    return settleArcade(ctx, game, { points, correct });
  },

  async quizStart(ctx, { themeId }) {
    const theme = THEME_PACKS.find((p) => p.id === themeId) ?? fail('UNKNOWN');
    const loaded = await ctx.store.load();
    const day = utcDay(ctx.now);
    const quiz = dayCounter(loaded.state, 'quiz', day);
    if ((Number(quiz.plays) || 0) >= QUIZ_PER_DAY) fail('DAILY_CAP');
    const left = QUIZ_PER_DAY - (Number(quiz.plays) || 0);
    if (quiz.pending && !quiz.pending.questions) {
      const { card, rarityId, themeId: held } = quiz.pending;
      return { ...(await commit(ctx, loaded, {})), card, rarityId, themeId: held, count: questionCountFor(rarityId), left };
    }
    const spec = { kind: 'theme', themeId: theme.id, rarityId: null, cards: 1 };
    let article = null;
    const safe = ctx.store.account ? noNsfwMeta(await ctx.store.account().catch(() => null)) : false;
    const pack = { ...toDrawPack(spec), ...(safe ? { safe: true } : {}) };
    for (let i = 0; i < 3; i++) {
      const [drawn] = ((await ctx.draw(pack)) ?? []).filter((a) => cardAllowed(a, { safe }));
      if (!drawn) continue;
      article = drawn;
      const [have] = await ctx.store.cards([drawn.key]);
      if (!have) break;
    }
    if (!article) fail('DRAW_FAILED');
    const rarityId = article.special ? 'prismatic' : rarityOfCard(article).id;
    quiz.pending = { themeId: theme.id, card: article, rarityId, questions: null, at: ctx.now };
    const done = await commit(ctx, loaded, { state: { quiz } });
    return { ...done, card: article, rarityId, themeId: theme.id, count: questionCountFor(rarityId), left };
  },

  async quizQuestions(ctx) {
    const loaded = await ctx.store.load();
    const day = utcDay(ctx.now);
    const quiz = dayCounter(loaded.state, 'quiz', day);
    const pending = quiz.pending ?? fail('NO_QUIZ');
    if (pending.questions) return { questions: pending.questions.map(({ question, choices }) => ({ question, choices })) };
    if ((Number(quiz.plays) || 0) >= QUIZ_PER_DAY) fail('DAILY_CAP');
    const text = (await ctx.articleText?.(pending.card.title).catch(() => '')) || pending.card.extract || '';
    let questions;
    try {
      questions = await ctx.writeQuiz({
        title: pending.card.title,
        text: String(text).slice(0, 3500),
        rank: rarityRank(pending.rarityId),
        count: questionCountFor(pending.rarityId)
      });
    } catch {
      fail('QUIZ_FAILED');
    }
    const clean = (Array.isArray(questions) ? questions : [])
      .filter((q) => q && typeof q.question === 'string' && Array.isArray(q.choices) && q.choices.length === 4
        && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
      .slice(0, 5)
      .map((q) => ({ question: String(q.question), choices: q.choices.map(String), answer: q.answer }));
    if (clean.length < 3) fail('QUIZ_FAILED');
    quiz.plays = (Number(quiz.plays) || 0) + 1;
    quiz.pending = { ...pending, questions: clean };
    await commit(ctx, loaded, { state: { quiz } });
    return { questions: clean.map(({ question, choices }) => ({ question, choices })), left: QUIZ_PER_DAY - quiz.plays };
  },

  async quizAnswer(ctx, { answers }) {
    const loaded = await ctx.store.load();
    const day = utcDay(ctx.now);
    const quiz = dayCounter(loaded.state, 'quiz', day);
    const pending = quiz.pending ?? fail('NO_QUIZ');
    if (!pending.questions) fail('NO_QUIZ');
    if (!Array.isArray(answers) || answers.length !== pending.questions.length) fail('BAD_ANSWERS');
    const correct = pending.questions.filter((q, i) => int(answers[i]) === q.answer).length;
    const rewards = quizRewards(correct, pending.themeId);
    const spec = { kind: 'theme', themeId: pending.themeId, rarityId: null, cards: 1 };
    const entry = rewards.card ? cardFrom(pending.card, pending.rarityId, spec, ctx.now) : null;
    delete quiz.pending;
    const tracked = track(loaded.state, [{ m: 'quiz', d: { correct } }], ctx.now);
    const keys = entry ? [entry.key] : [];
    return commit(ctx, loaded, {
      coins: rewards.money,
      inventory: rewards.booster ? [invOp(rewards.booster, 1)] : [],
      add: entry ? [entryToRow(entry, 'quiz')] : [],
      state: { quiz, ...tracked.state },
      claims: [`quiz:${day}:${quiz.plays}`],
      score: { game: 'quiz', points: correct * QUIZ_POINTS_PER_ANSWER, day },
      kind: 'quiz', detail: { correct, themeId: pending.themeId }
    }, { keys, extra: { correct, truth: pending.questions.map((q) => q.answer), rewards, card: entry, season: tracked.season } });
  },

  async versus(ctx, { id }) {
    const loaded = await ctx.store.load();
    const facts = (await ctx.store.facts('challenge', { id: String(id ?? '') })) ?? fail('NOT_CLAIMABLE');
    if (facts.claimed) fail('ALREADY_CLAIMED');
    if (facts.status !== 'done' || !facts.outcome) fail('NOT_DONE');
    const day = utcDay(ctx.now);
    const paid = dayCounter(loaded.state, 'versusDay', day);
    const n = Number(paid.n) || 0;
    const pay = n < VERSUS_PAID_PER_DAY ? VERSUS_PAY[facts.outcome] ?? VERSUS_PAY.lose : { coins: 0, ink: 0 };
    paid.n = n + 1;
    const tracked = track(loaded.state, [{ m: 'versus', d: { won: facts.outcome === 'win' } }], ctx.now);
    return commit(ctx, loaded, {
      coins: pay.coins,
      ink: pay.ink,
      state: { versusDay: paid, ...tracked.state },
      marks: [{ kind: 'challenge', id: String(id) }],
      claims: [`versus:${id}`],
      kind: 'versus', detail: { id, outcome: facts.outcome }
    }, { extra: { outcome: facts.outcome, paid: pay.coins, ink: pay.ink, capped: n >= VERSUS_PAID_PER_DAY, season: tracked.season } });
  },

  async guildGoal(ctx) {
    const loaded = await ctx.store.load();
    const facts = (await ctx.store.facts('guildGoal')) ?? fail('NOT_IN_GUILD');
    if (facts.claimed) fail('ALREADY_CLAIMED');
    if (!facts.done) fail('NOT_DONE');
    const tracked = track(loaded.state, [], ctx.now, POINTS_GUILD_GOAL);
    return commit(ctx, loaded, {
      coins: GUILD_GOAL_PAY,
      ink: INK_GUILD_GOAL,
      inventory: [invOp(GUILD_GOAL_BOOSTER, 1)],
      state: tracked.state,
      marks: [{ kind: 'guildGoal', week: facts.week }],
      claims: [`guildgoal:${facts.week}`],
      kind: 'guild-goal', detail: { week: facts.week }
    }, { extra: { paid: GUILD_GOAL_PAY, ink: INK_GUILD_GOAL, spec: GUILD_GOAL_BOOSTER, season: tracked.season } });
  },

  async guildMatch(ctx) {
    const loaded = await ctx.store.load();
    const facts = (await ctx.store.facts('guildMatch')) ?? fail('NOT_IN_GUILD');
    if (facts.claimed) fail('ALREADY_CLAIMED');
    if (!facts.won) fail('NOT_DONE');
    return commit(ctx, loaded, {
      coins: GUILD_MATCH_PAY,
      ink: INK_GUILD_MATCH,
      marks: [{ kind: 'guildMatch', week: facts.week }],
      claims: [`guildmatch:${facts.week}`],
      kind: 'guild-match', detail: { week: facts.week }
    }, { extra: { paid: GUILD_MATCH_PAY, ink: INK_GUILD_MATCH } });
  },

  async grants(ctx) {
    const loaded = await ctx.store.load();
    const rows = (await ctx.store.facts('grants')) ?? [];
    if (!rows.length) return { ...(await commit(ctx, loaded, {})), landed: [], left: [], local: [], failed: [] };
    const taking = rows.filter((r) => r.kind === 'takeCard').map((r) => String(r.payload?.key ?? '')).filter(Boolean);
    const held = new Map((taking.length ? await ctx.store.cards(taking) : []).map((row) => [row.article_key ?? row.key, row]));
    const owned = new Set(ECON_KEYS.concat(['wikdleStats']));
    let coins = Number(loaded.wallet.coins) || 0;
    let ink = Number(loaded.wallet.ink) || 0;
    const state = {};
    const stateOf = (k) => (k in state ? state[k] : (state[k] = clone(loaded.state[k])));
    const inventory = [];
    const add = [];
    const remove = [];
    const marks = [];
    const landed = [];
    const left = [];
    const failed = [];
    const keys = [];
    const holding = (id) => (Number(loaded.inventory?.[id]?.count) || 0)
      + inventory.filter((op) => op.spec_id === id).reduce((sum, op) => sum + op.delta, 0);
    for (const row of rows) {
      const p = row.payload ?? {};
      let ok = true;
      let local = false;
      switch (row.kind) {
        case 'coins': {
          const amount = Math.round(Number(p.amount) || 0);
          coins = Math.max(0, p.mode === 'set' ? amount : coins + amount);
          break;
        }
        case 'ink': {
          const amount = Math.round(Number(p.amount) || 0);
          ink = Math.max(0, p.mode === 'set' ? amount : ink + amount);
          break;
        }
        case 'booster': {
          const size = Number(p.spec?.cards);
          if (!p.spec || typeof p.spec !== 'object' || !Number.isInteger(size) || size < 1 || size > GRANT_CARDS_MAX) { ok = false; break; }
          try { inventory.push(invOp(p.spec, Math.max(1, Math.round(Number(p.count) || 1)))); } catch { ok = false; }
          break;
        }
        case 'takeBooster': {
          if (!p.spec || typeof p.spec !== 'object') { ok = false; break; }
          let id;
          try { id = invOp(p.spec, 0).spec_id; } catch { ok = false; break; }
          const n = Math.min(holding(id), Math.max(1, Math.round(Number(p.count) || 1)));
          if (n > 0) inventory.push({ spec_id: id, spec: p.spec, delta: -n });
          break;
        }
        case 'card': {
          const article = p.article;
          if (!article?.key) { ok = false; break; }
          const count = Math.max(1, Math.round(Number(p.count) || 1));
          const rarity = rarityById(p.rarityId);
          const spec = { kind: 'open', themeId: null, rarityId: rarity.id, cards: count };
          const entry = cardFrom(article, rarity.id, spec, ctx.now, { name: t('giftPackName'), icon: 'gift', accent: null });
          add.push({ ...entryToRow(entry, 'grant'), copies: count });
          keys.push(entry.key);
          break;
        }
        case 'takeCard': {
          const row2 = held.get(String(p.key ?? ''));
          if (!row2 || remove.some((r) => r.key === p.key)) { ok = false; break; }
          const have = Number(row2.copies) || 1;
          const copies = Number(p.copies) > 0 ? Math.min(have, Math.round(Number(p.copies))) : have;
          remove.push({ key: row2.article_key ?? row2.key, copies, force: true });
          keys.push(String(p.key));
          break;
        }
        case 'owned':
        case 'revokeOwned': {
          const bucket = p.bucket;
          if (!['themes', 'frames', 'fx', 'looks', 'openings', 'supporter'].includes(bucket)) { ok = false; break; }
          const bag = stateOf('owned') ?? { themes: [], frames: [], fx: [] };
          state.owned = bag;
          const list = (bag[bucket] ??= []);
          if (row.kind === 'owned') {
            for (const x of (Array.isArray(p.ids) ? p.ids : [p.id]).filter(Boolean).map(String)) if (!list.includes(x)) list.push(x);
          } else {
            bag[bucket] = list.filter((x) => x !== p.id);
          }
          break;
        }
        case 'xp': {
          const amount = Math.round(Number(p.amount) || 0);
          if (!(amount > 0)) { ok = false; break; }
          const progress = stateOf('progress') ?? { level: 1, xp: 0 };
          state.progress = progress;
          const gained = addXp(progress, amount);
          if (gained.length) state.pendingLevels = [...(stateOf('pendingLevels') ?? []), ...gained];
          break;
        }
        case 'profile': {
          const patch = Object.entries(p.patch ?? {});
          if (!patch.length || !patch.every(([path]) => owned.has(String(path).split('.')[0]))) { ok = false; local = patch.length > 0; break; }
          for (const [path, value] of patch) {
            const root = String(path).split('.')[0];
            const holder = { [root]: stateOf(root) ?? {} };
            applyPath(holder, path, () => clone(value));
            state[root] = holder[root];
          }
          break;
        }
        case 'profileAdd': {
          const root = String(p.path ?? '').split('.')[0];
          if (!owned.has(root)) { ok = false; local = Boolean(root); break; }
          const holder = { [root]: stateOf(root) ?? {} };
          applyPath(holder, p.path, (v) => Math.max(0, (Number(v) || 0) + (Number(p.by) || 0)));
          state[root] = holder[root];
          break;
        }
        default:
          ok = false;
      }
      if (ok) {
        marks.push({ kind: 'grant', id: row.id });
        landed.push(row);
      } else if (local) {
        left.push(row.id);
      } else {
        marks.push({ kind: 'grantFail', id: row.id });
        failed.push(row.id);
      }
    }
    const local = rows.filter((r) => left.includes(r.id));
    if (!marks.length) return { ...(await commit(ctx, loaded, {})), landed: [], left, local, failed };
    for (const k of Object.keys(state)) if (state[k] === undefined) delete state[k];
    return commit(ctx, loaded, {
      coins: coins - (Number(loaded.wallet.coins) || 0),
      ink: ink - (Number(loaded.wallet.ink) || 0),
      inventory, add, remove,
      ...(Object.keys(state).length ? { state } : {}),
      marks,
      ...(landed.length ? { kind: 'grant', reason: 'from the creator', detail: { ids: landed.map((r) => r.id) } } : {})
    }, { keys, extra: { landed, left, local, failed } });
  },

  async wipe(ctx, { scope }) {
    if (scope !== 'cards' && scope !== 'all') fail('BAD_SCOPE');
    const period = Math.floor(ctx.now / (WIPE_EVERY_DAYS * 86400000));
    const erased = await ctx.store.wipe(scope, `${scope === 'all' ? 'wipe' : 'wipecards'}:${period}`, scope === 'cards' ? starterCoins() : 0);
    const loaded = await ctx.store.load();
    const rows = await ctx.store.cards(null);
    return {
      erased: erased ?? null,
      next: (period + 1) * WIPE_EVERY_DAYS * 86400000,
      wallet: loaded.wallet,
      state: loaded.state,
      inventory: loaded.inventory,
      cards: Object.fromEntries(rows.map((row) => { const e = rowToEntry(row); return [e.key, e]; })),
      custom: (loaded.custom ?? []).map((row) => row.def ?? row),
      replace: true
    };
  }
};
