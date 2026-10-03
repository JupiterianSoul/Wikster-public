const words = {};

export const LANGS = ['en', 'fr'];
export const langFor = (language) => (LANGS.includes(language) ? language : 'en');

export async function loadWords(lang = 'en') {
  const id = langFor(lang);
  words[id] ??= await (id === 'fr' ? import('./data/wikdle-words-fr.js') : import('./data/wikdle-words.js'));
  return words[id];
}

const lists = (lang = 'en') => {
  const found = words[langFor(lang)];
  if (!found) throw new Error('WIKDLE_WORDS_NOT_LOADED');
  return found;
};
import { t } from './i18n.js';
import { dayBeforeDay, msUntilNextUtcDay, utcDay } from './days.js';

export const ROWS = 6;
export const COLUMNS = 5;
const STATE_KEY = 'wikster.wikdle.v1';

export { utcDay };

export const msToNextDay = (now = Date.now()) => msUntilNextUtcDay(now);

export function wordForDay(day = utcDay(), lang = 'en') {
  const id = langFor(lang);
  let h = 2166136261;
  for (const ch of id === 'en' ? `wikdle:${day}` : `wikdle:${id}:${day}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const { ANSWERS } = lists(id);
  const n = ANSWERS.length;
  const stride = 7919 % n || 1;
  const index = (Math.floor(h / 97) * stride + (h % n)) % n;
  return ANSWERS[index];
}

export const isWord = (guess, lang = 'en') => lists(lang).DICTIONARY.has(String(guess ?? '').toLowerCase());

export function scoreGuess(guess, answer) {
  const g = String(guess).toLowerCase().split('');
  const a = String(answer).toLowerCase().split('');
  const marks = new Array(COLUMNS).fill('miss');
  const left = {};
  for (let i = 0; i < COLUMNS; i++) {
    if (g[i] === a[i]) marks[i] = 'hit';
    else left[a[i]] = (left[a[i]] ?? 0) + 1;
  }
  for (let i = 0; i < COLUMNS; i++) {
    if (marks[i] === 'hit') continue;
    if (left[g[i]] > 0) { marks[i] = 'near'; left[g[i]]--; }
  }
  return marks;
}

export function keyMarks(rows) {
  const rank = { miss: 1, near: 2, hit: 3 };
  const best = {};
  for (const row of rows) {
    row.guess.split('').forEach((ch, i) => {
      const mark = row.marks[i];
      if ((rank[mark] ?? 0) > (rank[best[ch]] ?? 0)) best[ch] = mark;
    });
  }
  return best;
}

const blank = (day, lang = 'en') => ({ day, lang: langFor(lang), rows: [], status: 'playing', startedAt: Date.now(), finishedAt: null });

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(all)); } catch {}
}

const gameKey = (day, lang = 'en') => (langFor(lang) === 'en' ? day : `${langFor(lang)}:${day}`);

export function loadGame(day = utcDay(), lang = 'en') {
  const all = readAll();
  const game = all.games?.[gameKey(day, lang)];
  if (game && Array.isArray(game.rows)) return { lang: langFor(lang), ...game };
  return blank(day, lang);
}

function saveGame(game) {
  const all = readAll();
  all.games = all.games ?? {};
  all.games[gameKey(game.day, game.lang)] = game;
  const days = Object.keys(all.games).sort((a, b) => a.slice(-10).localeCompare(b.slice(-10)));
  while (days.length > 14) delete all.games[days.shift()];
  writeAll(all);
}

export function loadStats() {
  const all = readAll();
  const s = all.stats ?? {};
  return {
    played: s.played ?? 0, won: s.won ?? 0, streak: s.streak ?? 0, best: s.best ?? 0,
    lastWonDay: s.lastWonDay ?? null,
    guesses: Array.isArray(s.guesses) && s.guesses.length === ROWS ? s.guesses : new Array(ROWS).fill(0)
  };
}

function saveStats(stats) {
  const all = readAll();
  all.stats = stats;
  writeAll(all);
}

const dayBefore = dayBeforeDay;

export function playGuess(game, guess) {
  if (game.status !== 'playing') return { error: 'over' };
  const word = String(guess ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (word.length !== COLUMNS) return { error: 'short' };
  if (!isWord(word, game.lang)) return { error: 'unknown' };
  const answer = wordForDay(game.day, game.lang);
  const marks = scoreGuess(word, answer);
  const rows = [...game.rows, { guess: word, marks }];
  const won = marks.every((m) => m === 'hit');
  const status = won ? 'won' : rows.length >= ROWS ? 'lost' : 'playing';
  const next = { ...game, rows, status, finishedAt: status === 'playing' ? null : Date.now() };
  saveGame(next);
  if (status !== 'playing') {
    const stats = loadStats();
    stats.played += 1;
    if (won) {
      stats.won += 1;
      stats.guesses[rows.length - 1] += 1;
      stats.streak = stats.lastWonDay === dayBefore(game.day) ? stats.streak + 1 : 1;
      stats.best = Math.max(stats.best, stats.streak);
      stats.lastWonDay = game.day;
    } else {
      stats.streak = 0;
    }
    saveStats(stats);
  }
  return next;
}

export const HINT_COST = 120;
export const HINTS_MAX = 3;

const fold = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const mask = (text, word) => String(text ?? '').replace(/\p{L}+/gu, (token) => {
  const flat = fold(token);
  if (!flat.startsWith(word) || flat.length > word.length + 3) return token;
  return '▮'.repeat(word.length) + token.slice(word.length);
});

const sentences = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()
  .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(])/)
  .map((line) => line.trim())
  .filter((line) => line.length >= 12 && line.length <= 240);

const EMPTY_MEANING = /(may|can) (also )?refer to|refers? to:|same term|disambiguat|homonym|Wikimedia|list of |liste de |^(surname|given name|family name|nom de famille|prénom)/i;
const useful = (line, word) => {
  if (!line || EMPTY_MEANING.test(line)) return null;
  const hidden = mask(line, word);
  if (hidden.replace(/▮/g, '').replace(/[^\p{L}]/gu, '').length < 6) return null;
  return hidden.charAt(0).toUpperCase() + hidden.slice(1);
};

const wikiHost = (lang) => `https://${langFor(lang)}.wikipedia.org`;

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

async function findArticle(word, lang) {
  const summary = await getJson(`${wikiHost(lang)}/api/rest_v1/page/summary/${encodeURIComponent(word)}`).catch(() => null);
  if (summary && (!summary.type || summary.type === 'standard') && !EMPTY_MEANING.test(String(summary.description ?? '')) && !EMPTY_MEANING.test(sentences(summary.extract)[0] ?? '')) return summary;
  const search = await getJson(`${wikiHost(lang)}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`intitle:${word}`)}&srlimit=10&format=json&origin=*`).catch(() => null);
  for (const hit of search?.query?.search ?? []) {
    const title = String(hit.title ?? '');
    const flat = fold(title);
    if (!(flat === word || flat.startsWith(`${word} (`) || flat.startsWith(`${word} `))) continue;
    if (/disambig|homonym/i.test(title)) continue;
    const page = await getJson(`${wikiHost(lang)}/api/rest_v1/page/summary/${encodeURIComponent(title)}`).catch(() => null);
    if (page && (!page.type || page.type === 'standard')) return page;
  }
  return null;
}

const facts = new Map();

async function articleFacts(word, lang) {
  const key = `${langFor(lang)}:${word}`;
  if (facts.has(key)) return facts.get(key);
  let lines = [];
  try {
    const page = await findArticle(word, lang);
    if (page) {
      const about = useful(String(page.description ?? '').trim(), word);
      if (about) lines.push({ kind: 'about', text: about });
      for (const line of sentences(page.extract).slice(0, 4)) {
        const clue = useful(line, word);
        if (clue) lines.push({ kind: 'sentence', text: clue });
        if (lines.length >= 3) break;
      }
    }
  } catch {
    lines = [];
  }
  if (lines.length) facts.set(key, lines);
  return lines;
}

function letterHint(word, taken, greens = []) {
  const order = [2, 4, 0, 3, 1];
  const known = new Set(greens);
  const free = order.filter((i) => !known.has(i) && !taken.has(i));
  const at = (free.length ? free : order.filter((i) => !taken.has(i)))[0];
  if (at == null) return null;
  taken.add(at);
  return { at, kind: 'letter', text: t('wikdleHintLetter', { n: at + 1, of: COLUMNS, letter: String(word[at]).toUpperCase() }) };
}

const hintedPositions = (hints) => new Set((hints ?? [])
  .map((h) => (typeof h === 'string' ? null : h?.at))
  .filter((at) => Number.isInteger(at)));

export async function fetchHint(word, n, { greens = [], hints = [], lang = 'en' } = {}) {
  const taken = hintedPositions(hints);
  const said = new Set((hints ?? []).map(hintText));
  const fromArticle = n < 2 ? (await articleFacts(word, lang)).find((line) => !said.has(line.text)) : null;
  if (fromArticle) return fromArticle;
  return letterHint(word, taken, greens) ?? (await articleFacts(word, lang)).find((line) => !said.has(line.text)) ?? null;
}

export function takeHint(game, hint) {
  const hints = [...(game.hints ?? []), typeof hint === 'string' ? { text: hint } : hint];
  const next = { ...game, hints };
  saveGame(next);
  return next;
}

export const hintText = (hint) => (typeof hint === 'string' ? hint : String(hint?.text ?? ''));

export const articleUrl = (word, lang = 'en') => `https://${langFor(lang)}.wikipedia.org/wiki/${encodeURIComponent(word)}`;

export const WIKDLE_POINTS = [1400, 1150, 950, 800, 650, 500];
export const basePoints = (game) => (game.status === 'won' ? WIKDLE_POINTS[game.rows.length - 1] ?? 500 : 0);
export const wikdlePoints = (game) =>
  game.status === 'won' ? Math.max(320, basePoints(game) - (game.hints?.length ?? 0) * HINT_COST) : 0;

export const STREAK_BONUS_STEP = 0.05;
export const STREAK_BONUS_MAX = 0.5;
export const streakBonus = (streak) => Math.min(STREAK_BONUS_MAX, Math.max(0, (Number(streak) || 0) - 1) * STREAK_BONUS_STEP);

export const FAST_SOLVE_ROWS = 2;
export const STREAK_BOOSTER_EVERY = 7;

export function shareText(game) {
  const square = { hit: '\u{1F7E9}', near: '\u{1F7E8}', miss: '⬛' };
  const head = `Wikster Wikdle ${game.day} ${game.status === 'won' ? game.rows.length : 'X'}/${ROWS}`;
  return [head, ...game.rows.map((row) => row.marks.map((m) => square[m]).join(''))].join('\n');
}
