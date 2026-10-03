import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run, EconError } = await import('../../src/econ/engine.js');
const { track } = await import('../../src/econ/track.js');
const { QUESTS } = await import('../../src/data/quests.js');
const { inkForQuestTier, INK_SEASON_QUEST, INK_GUILD_GOAL } = await import('../../src/ink.js');
const { TRACK, TRACK_REWARDS, POINTS_QUEST } = await import('../../src/data/seasons.js');
const { seasonAt, seasonQuestOf } = await import('../../src/season.js');
const { loadWords, wordForDay, WIKDLE_POINTS, streakBonus } = await import('../../src/wikdle.js');
const { pointsFor, coinsFor: duelCoins, DUEL_PER_DAY, DUEL_PERFECT_BONUS } = await import('../../src/duel.js');
const { coinsFor: revealCoins } = await import('../../src/reveal.js');
const { QUIZ_MONEY, QUIZ_PER_DAY } = await import('../../src/quizrules.js');
const { PAY } = await import('../../src/versus.js');
const { GUILD_GOAL_PAY, GUILD_MATCH_PAY } = await import('../../src/guildrules.js');
const { specId } = await import('../../src/booster.js');
const { STARTER_COINS } = await import('../../src/economy.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const DAY = new Date(NOW).toISOString().slice(0, 10);
const YESTERDAY = new Date(NOW - 86400000).toISOString().slice(0, 10);

let drawn = 0;
const fakeDraw = async (pack) => {
  drawn++;
  return Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
    key: `en:Quiz_${drawn}_${i}`, title: `Quiz ${drawn} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en',
    extract: 'A long enough extract about the subject of this card, written for the quiz writer to use.',
    views: 5000, popularity: 0.5
  }));
};
const QUESTIONS = [0, 1, 2, 3, 0].map((answer, i) => ({ question: `Q${i}`, choices: ['a', 'b', 'c', 'd'], answer }));
let quizCalls = 0;
const writeQuiz = async ({ count }) => { quizCalls++; return QUESTIONS.slice(0, count); };

const db = createEconDb();
const ctxFor = (id, extra = {}) => ({
  store: db.store(id), now: NOW, random: () => 0.42, draw: fakeDraw, writeQuiz, articleText: async () => 'text', ...extra
});
const call = (id, action, args, extra) => run(ctxFor(id, extra), action, args);
const refused = async (fn, code) => {
  try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; }
};
const fresh = async (id) => { await call(id, 'import'); return id; };
const wallet = async (id) => (await call(id, 'snapshot')).wallet;

const Q = await fresh('user-quest');
const quest = QUESTS.find((q) => q.reward.booster) ?? QUESTS[0];
db.quests.set(`${Q}|${DAY}|${quest.id}`, { progress: quest.target - 1, target: quest.target, claimed: false });
check('an unfinished quest pays nothing', await refused(() => call(Q, 'quest', { id: quest.id }), 'NOT_DONE'));
db.quests.get(`${Q}|${DAY}|${quest.id}`).progress = quest.target;
let r = await call(Q, 'quest', { id: quest.id });
check('a finished quest pays its coins and ink', r.wallet.coins === quest.reward.money && r.wallet.ink === inkForQuestTier(quest.tier));
check('and its booster when it has one', !quest.reward.booster || r.inventory[specId(quest.reward.booster)]?.count === 1);
check('and marks the quest claimed', db.quests.get(`${Q}|${DAY}|${quest.id}`).claimed === true);
check('and adds season points', r.season.gained === POINTS_QUEST);
check('only once', await refused(() => call(Q, 'quest', { id: quest.id }), 'ALREADY_CLAIMED'));
check('the claim is written into the economy state for the day', JSON.stringify(r.state.questDay) === JSON.stringify({ day: DAY, ids: [quest.id] }));
const { predict } = await import('../../src/econ/local.js');
const phone = { wallet: r.wallet, state: r.state, inventory: r.inventory, entries: {} };
let phoneSaid = null;
try { await predict(run, 'quest', { id: quest.id }, phone, { quest: { progress: quest.target, target: quest.target, claimed: false } }, NOW); } catch (e) { phoneSaid = e.code; }
check('a phone that forgot the claim still refuses to pay it again', phoneSaid === 'ALREADY_CLAIMED', String(phoneSaid));
db.quests.get(`${Q}|${DAY}|${quest.id}`).claimed = false;
delete db.users.get(Q).state.questDay;
check('even with the quest row and the state rolled back, the claim key refuses a second payment', await refused(() => call(Q, 'quest', { id: quest.id }), 'ALREADY_CLAIMED'));
check('so the wallet did not move', (await call(Q, 'snapshot')).wallet.coins === quest.reward.money);
db.quests.get(`${Q}|${DAY}|${quest.id}`).claimed = true;
check('a quest not dealt today cannot be claimed', await refused(() => call(Q, 'quest', { id: QUESTS.find((q) => q.id !== quest.id).id }), 'NOT_CLAIMABLE'));
check('a made-up quest is refused', await refused(() => call(Q, 'quest', { id: 'nope' }), 'UNKNOWN'));

const S = await fresh('user-season');
const { key } = seasonAt(NOW);
check('a rung not reached pays nothing', await refused(() => call(S, 'seasonRung', { index: 0 }), 'NOT_EARNED'));
await db.store(S).apply({ state: { seasons: { [key]: { points: TRACK[3], claimed: [], quests: {} } } } });
r = await call(S, 'seasonRung', { index: 0 });
check('a reached rung pays its reward', r.wallet.coins === TRACK_REWARDS[0].money && r.wallet.ink === TRACK_REWARDS[0].ink);
check('and is claimed once', await refused(() => call(S, 'seasonRung', { index: 0 }), 'ALREADY_CLAIMED'));
r = await call(S, 'seasonRung', { index: 3 });
check('the badge rung unlocks the season badge', r.state.seasonUnlocks.badges.length === 1);
r = await call(S, 'seasonRung', { index: 1 });
check('a booster rung gives the season booster', Object.keys(r.inventory).some((k) => k.includes('season-')));
check('a rung past the end is refused', await refused(() => call(S, 'seasonRung', { index: 99 }), 'UNKNOWN'));

const today = seasonQuestOf(NOW);
check('the season quest is not paid before it is done', await refused(() => call(S, 'seasonQuest'), 'NOT_DONE'));
const want = today.quest;
const event = { m: want.metric, d: { ...(want.where ?? {}), rarityId: want.where?.minRarity ?? 'common', amount: want.target, correct: 5 } };
const moved = track({}, Array.from({ length: want.target }, () => event), NOW);
check('server events move the season quest', moved.state.seasonDay.progress === want.target, JSON.stringify(moved.state.seasonDay));
check('and add season points by the same rules as the game', moved.season.gained > 0);
await db.store(S).apply({ state: { seasonDay: moved.state.seasonDay } });
const before = await wallet(S);
r = await call(S, 'seasonQuest');
check('the season quest pays once done', r.wallet.coins === before.coins + want.reward.money && r.wallet.ink === before.ink + INK_SEASON_QUEST);
check('and only once a day', await refused(() => call(S, 'seasonQuest'), 'ALREADY_CLAIMED'));

await loadWords('en');
const answer = wordForDay(DAY, 'en');
const W = await fresh('user-wikdle');
check('a guess that is not a word is refused', await refused(() => call(W, 'wikdle', { day: DAY, lang: 'en', guesses: ['zzzzz'] }), 'BAD_GAME'));
check('an unfinished game is not paid', await refused(() => call(W, 'wikdle', { day: DAY, lang: 'en', guesses: [answer === 'light' ? 'begin' : 'light'] }), 'NOT_DONE'));
check('a day that is not today is refused', await refused(() => call(W, 'wikdle', { day: '2020-01-01', lang: 'en', guesses: [answer] }), 'BAD_DAY'));
r = await call(W, 'wikdle', { day: DAY, lang: 'en', guesses: [answer], hints: 0 });
const first = Math.round(WIKDLE_POINTS[0] * 0.9 * (1 + streakBonus(1)));
check('a one-guess solve pays by the game rules', r.status === 'won' && r.paid === first, `${r.paid} vs ${first}`);
check('and gives the fast-solve booster', r.specs.length === 1 && r.specs[0].rarityId === 'rare');
check('each day pays once per language', await refused(() => call(W, 'wikdle', { day: DAY, lang: 'en', guesses: [answer] }), 'ALREADY_CLAIMED'));
check('guesses after the win are refused', await refused(() => call(W, 'wikdle', { day: YESTERDAY, lang: 'en', guesses: [wordForDay(YESTERDAY, 'en'), 'light'] }), 'BAD_GAME'));
r = await call(W, 'wikdle', { day: YESTERDAY, lang: 'en', guesses: [wordForDay(YESTERDAY, 'en')], hints: 3 });
check('hints lower the points', r.points === Math.max(320, WIKDLE_POINTS[0] - 3 * 120));
check('the server writes the Wikdle score itself', db.scores.filter((x) => x.user === W && x.game === 'wikdle').length === 2);

const D = await fresh('user-duel');
check('a duel score that the rules cannot make is refused', await refused(() => call(D, 'arcade', { game: 'duel', points: 999999, correct: 3 }), 'BAD_ROUND'));
r = await call(D, 'arcade', { game: 'duel', points: pointsFor(6), correct: 6 });
check('a real duel score pays by the rate', r.paid === duelCoins(pointsFor(6)));
r = await call(D, 'arcade', { game: 'duel', points: pointsFor(15) + DUEL_PERFECT_BONUS, correct: 15 });
check('a perfect duel gets its bonus', r.paid === duelCoins(pointsFor(15) + DUEL_PERFECT_BONUS));
for (let i = 2; i < DUEL_PER_DAY; i++) await call(D, 'arcade', { game: 'duel', points: 0, correct: 0 });
check('duels stop paying at the daily cap', await refused(() => call(D, 'arcade', { game: 'duel', points: pointsFor(1), correct: 1 }), 'DAILY_CAP'));
r = await call(D, 'arcade', { game: 'reveal', points: 8 * 200, correct: 8 });
check('a perfect reveal pays by the rate', r.paid === revealCoins(1600));
check('a reveal score above its answers is refused', await refused(() => call(D, 'arcade', { game: 'reveal', points: 1600, correct: 2 }), 'BAD_ROUND'));
check('duel and reveal keep the best of the day on the board', db.scores.find((x) => x.user === D && x.game === 'duel')?.points === pointsFor(15) + DUEL_PERFECT_BONUS
  && db.scores.find((x) => x.user === D && x.game === 'reveal')?.points === 1600);

const Z = await fresh('user-quiz');
r = await call(Z, 'quizStart', { themeId: 'animals' });
const card = r.card;
check('the quiz card comes from the server', card?.key?.startsWith('en:Quiz_'));
r = await call(Z, 'quizStart', { themeId: 'space' });
check('asking again keeps the same card instead of a new draw', r.card.key === card.key);
check('answers before the questions are refused', await refused(() => call(Z, 'quizAnswer', { answers: [0, 0, 0] }), 'NO_QUIZ'));
r = await call(Z, 'quizQuestions');
check('the questions come without their answers', r.questions.length >= 3 && r.questions.every((q) => q.answer === undefined));
const n = r.questions.length;
r = await call(Z, 'quizQuestions');
check('asking twice does not write a second quiz', quizCalls === 1);
r = await call(Z, 'quizAnswer', { answers: QUESTIONS.slice(0, n).map((q) => q.answer) });
check('the server grades the answers', r.correct === n);
check('and pays by the quiz rules', r.wallet.coins === (n === 5 ? QUIZ_MONEY.large : n === 4 ? QUIZ_MONEY.medium : 0));
check('and gives the card', r.cards[card.key]?.count === 1);
check('and the quiz score lands on the board', db.scores.find((x) => x.user === Z && x.game === 'quiz')?.points === n * 200);
check('the same quiz cannot be answered again', await refused(() => call(Z, 'quizAnswer', { answers: [0, 0, 0] }), 'NO_QUIZ'));
for (let i = 1; i < QUIZ_PER_DAY; i++) {
  await call(Z, 'quizStart', { themeId: 'animals' });
  await call(Z, 'quizQuestions');
  await call(Z, 'quizAnswer', { answers: [9, 9, 9, 9, 9].slice(0, (await call(Z, 'snapshot')).state.quiz.pending.questions.length) });
}
check('quizzes stop at the daily cap', await refused(() => call(Z, 'quizStart', { themeId: 'animals' }), 'DAILY_CAP'));

const V = await fresh('user-versus');
db.challenges.set('c1', { challenger: V, opponent: 'other', status: 'done', winner: 'challenger', claimed: [] });
db.challenges.set('c2', { challenger: 'other', opponent: V, status: 'open', winner: null, claimed: [] });
r = await call(V, 'versus', { id: 'c1' });
check('a won challenge pays the win', r.wallet.coins === PAY.win.coins && r.wallet.ink === PAY.win.ink);
check('once', await refused(() => call(V, 'versus', { id: 'c1' }), 'ALREADY_CLAIMED'));
check('an open challenge pays nothing', await refused(() => call(V, 'versus', { id: 'c2' }), 'NOT_DONE'));
check('someone else\'s challenge is not yours', await refused(() => call('user-quest', 'versus', { id: 'c1' }), 'NOT_CLAIMABLE'));

const G = await fresh('user-guild');
check('no guild, no goal', await refused(() => call(G, 'guildGoal'), 'NOT_IN_GUILD'));
db.guildGoal.set(G, { week: '2900', done: false, claimed: false });
check('an unfinished goal pays nothing', await refused(() => call(G, 'guildGoal'), 'NOT_DONE'));
db.guildGoal.get(G).done = true;
r = await call(G, 'guildGoal');
check('a finished goal pays coins, ink and a booster', r.wallet.coins === GUILD_GOAL_PAY && r.wallet.ink === INK_GUILD_GOAL && Object.keys(r.inventory).length === 1);
check('once a week', await refused(() => call(G, 'guildGoal'), 'ALREADY_CLAIMED'));
db.guildMatch.set(G, { week: '2899', won: true, claimed: false });
r = await call(G, 'guildMatch');
check('a won match pays', r.wallet.coins === GUILD_GOAL_PAY + GUILD_MATCH_PAY);

const K = await fresh('user-grants');
await db.store(K).apply({ coins: 50, add: [{ key: 'en:Special', title: 'S', rarityId: 'special', data: { special: 'creator' } }] });
db.grants.push(
  { id: 1, user: K, kind: 'coins', payload: { amount: 1000 } },
  { id: 2, user: K, kind: 'ink', payload: { amount: 40, mode: 'set' } },
  { id: 3, user: K, kind: 'booster', payload: { spec: { kind: 'open', themeId: null, rarityId: 'epic', cards: 5 }, count: 2 } },
  { id: 4, user: K, kind: 'card', payload: { article: { key: 'en:Gift', title: 'Gift', popularity: 0.5 }, rarityId: 'mythic', count: 2 } },
  { id: 5, user: K, kind: 'takeCard', payload: { key: 'en:Special' } },
  { id: 6, user: K, kind: 'owned', payload: { bucket: 'themes', ids: ['midnight'] } },
  { id: 7, user: K, kind: 'profile', payload: { patch: { 'playMs': 5 } } },
  { id: 8, user: K, kind: 'profileAdd', payload: { path: 'cardsSold', by: 3 } },
  { id: 9, user: 'someone', kind: 'coins', payload: { amount: 1 } }
);
r = await call(K, 'grants');
check('creator grants land on the server wallet', r.wallet.coins === 1050 && r.wallet.ink === 40);
check('with their boosters', r.inventory[specId({ kind: 'open', themeId: null, rarityId: 'epic', cards: 5 })]?.count === 2);
check('a given card arrives with its copies', r.cards['en:Gift']?.count === 2 && r.cards['en:Gift'].rarityId === 'mythic');
check('a take removes even a locked card', r.cards['en:Special'] === null);
check('cosmetics and economy counters are set on the server', r.state.owned.themes.includes('midnight') && r.state.cardsSold === 3);
check('grants that are not economy are left for the game', r.left.includes(7) && !r.landed.some((x) => x.id === 7));
r = await call(K, 'grants');
check('grants land once', r.landed.length === 0 && (await wallet(K)).coins === 1050);

const X = await fresh('user-grants-2');
const ONE = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 1 };
const TWO = { kind: 'open', themeId: null, rarityId: 'epic', cards: 2 };
await db.store(X).apply({ add: [{ key: 'en:Twice', title: 'Twice', rarityId: 'rare', copies: 3 }] });
db.grants.push(
  { id: 20, user: X, kind: 'booster', payload: { spec: ONE, count: 1 } },
  { id: 21, user: X, kind: 'booster', payload: { spec: TWO, count: 2 } },
  { id: 22, user: X, kind: 'xp', payload: { amount: 100000 } },
  { id: 23, user: X, kind: 'mystery', payload: {} },
  { id: 24, user: X, kind: 'booster', payload: { spec: { kind: 'theme', themeId: 'animals', cards: 40 } } },
  { id: 25, user: X, kind: 'takeCard', payload: { key: 'en:Twice', copies: 2 } },
  { id: 26, user: X, kind: 'takeCard', payload: { key: 'en:Nothing' } },
  { id: 27, user: X, kind: 'profile', payload: { patch: { 'progress.level': 7, 'progress.xp': 0 } } },
  { id: 28, user: X, kind: 'profile', payload: { patch: { boostersOpened: 33 } } }
);
r = await call(X, 'grants');
check('a 1 card granted booster keeps its size', r.inventory[specId(ONE)]?.count === 1 && r.inventory[specId(ONE)].spec.cards === 1);
check('and a 2 card one too', r.inventory[specId(TWO)]?.count === 2 && r.inventory[specId(TWO)].spec.cards === 2);
check('the level and boosters opened are set through the economy', r.state.progress.level === 7 && r.state.boostersOpened === 33);
check('xp levels up and leaves the rewards to claim', r.landed.some((x) => x.id === 22));
check('a take can leave some copies', r.cards['en:Twice']?.count === 1);
check('what cannot be claimed is marked failed', [23, 24, 26].every((id) => r.failed.includes(id)) && !r.left.includes(23));
check('and no longer waits in the queue', db.grants.filter((g) => g.user === X && !g.claimedAt).length === 0
  && db.grants.find((g) => g.id === 23).failedAt != null);
db.grants.push({ id: 29, user: X, kind: 'xp', payload: { amount: 50 } });
r = await call(X, 'grants');
check('newer grants are not blocked by a failed one', r.landed.length === 1 && r.landed[0].id === 29);
r = await call(X, 'grants');
check('xp from the creator raises the level', (await call(X, 'snapshot')).state.progress.level > 1);
db.grants.push({ id: 30, user: X, kind: 'takeBooster', payload: { spec: TWO, count: 5 } });
r = await call(X, 'grants');
check('taking back boosters stops at what is held', !r.inventory[specId(TWO)] && r.inventory[specId(ONE)]?.count === 1);

for (const [spec, n] of [[ONE, 1], [{ ...TWO }, 2]]) {
  const O = await fresh(`user-open-${n}`);
  db.grants.push({ id: 40 + n, user: O, kind: 'booster', payload: { spec, count: 1 } });
  await call(O, 'grants');
  const drawn = await call(O, 'prepare', { specId: specId(spec) });
  check(`a granted ${n} card booster draws ${n}`, drawn.cards.length === n, String(drawn.cards.length));
  const opened = await call(O, 'open', { nonce: drawn.nonce });
  check(`and opens with exactly ${n}`, opened.pulls.length === n && opened.results.length === n
    && Object.values(opened.cards).filter(Boolean).length === n && !opened.inventory[specId(spec)]);
}

const E = await fresh('user-wipe');
await call(E, 'starter');
await db.store(E).apply({
  coins: 9000, add: [{ key: 'en:X', title: 'X' }, { key: 'en:Code', title: 'C', rarityId: 'special', data: { special: 'code' } }],
  inventory: [{ spec_id: 'code|x', spec: { kind: 'code', codeId: 'x' }, delta: 1 }], claims: ['level:2', 'code:hello']
});
r = await call(E, 'wipe', { scope: 'cards' });
const kept = (await call(E, 'snapshot')).cards;
check('removing the cards keeps only the special ones', Object.keys(kept).join() === 'en:Code');
check('and the code boosters', Object.keys(r.inventory).join() === 'code|x');
check('and puts the wallet back to the starter amount', r.wallet.coins === STARTER_COINS);
check('the reply marks the wipe for the other devices', r.state.wiped?.scope === 'cards' && r.erased?.scope === 'cards');
check('and says when the next one is allowed', r.next > Date.now() && r.next <= Date.now() + 30 * 86400000);
check('once a month', await refused(() => call(E, 'wipe', { scope: 'cards' }), 'ALREADY_CLAIMED'));
r = await call(E, 'wipe', { scope: 'all' });
check('erasing everything empties the account', r.wallet.coins === 0 && Object.keys(r.inventory).length === 0 && r.state.imported === true);
r = await call(E, 'starter');
check('and the starter can be taken again', r.wallet.coins > 0);
check('but codes stay redeemed', db.users.get(E).claims.has('code:hello'));
check('and a second erase waits a month', await refused(() => call(E, 'wipe', { scope: 'all' }), 'ALREADY_CLAIMED'));

const A = await fresh('user-ach');
check('an achievement the server can measure is checked', await refused(() => call(A, 'achievement', { id: 'pack-1', facts: { boosters: 9999 } }), 'NOT_EARNED'));
await db.store(A).apply({ state: { boostersOpened: 1 } });
r = await call(A, 'achievement', { id: 'pack-1' });
check('and paid once earned', r.wallet.coins === 100);

done();
