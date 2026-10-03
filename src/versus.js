export const CLASH_CARDS = 5;
export const SORT_CARDS = 8;
export const KINDS = ['clash', 'sort'];

export const PAY = {
  win: { coins: 600, ink: 15, season: 40 },
  lose: { coins: 150, ink: 3, season: 10 },
  draw: { coins: 300, ink: 8, season: 20 }
};

const views = (c) => Number(c?.views) || 0;

export const eligible = (entries) => (entries ?? []).filter((e) => e && !e.special && views(e) > 0 && e.key);

export const snapshot = (c) => ({ key: c.key, title: c.title, views: views(c), rarityId: c.rarityId, thumbnail: c.thumbnail ?? null });

export function dealSort(entries, rng = Math.random) {
  const pool = eligible(entries).sort(() => rng() - 0.5);
  const seen = new Set();
  const hand = [];
  for (const c of pool) {
    if (seen.has(views(c))) continue;
    seen.add(views(c));
    hand.push(snapshot(c));
    if (hand.length === SORT_CARDS) break;
  }
  return hand.length === SORT_CARDS ? hand : null;
}

export const canClash = (entries) => eligible(entries).length >= CLASH_CARDS;
export const canSort = (entries) => new Set(eligible(entries).map(views)).size >= SORT_CARDS;

export const trueOrder = (cards) => [...cards].sort((a, b) => views(b) - views(a)).map((c) => c.key);

export function sortScore(cards, order) {
  const truth = trueOrder(cards);
  return (order ?? []).reduce((n, key, i) => n + (truth[i] === key ? 1 : 0), 0);
}

export function clashRounds(mine, theirs) {
  const a = [...mine].sort((x, y) => views(y) - views(x)).slice(0, CLASH_CARDS);
  const b = [...theirs].sort((x, y) => views(y) - views(x)).slice(0, CLASH_CARDS);
  return a.map((c, i) => {
    const o = b[i] ?? null;
    const winner = !o ? 'challenger' : views(c) > views(o) ? 'challenger' : views(o) > views(c) ? 'opponent' : 'draw';
    return { challenger: c, opponent: o, winner };
  });
}

export function settle(kind, payload, reply) {
  if (kind === 'clash') {
    const rounds = clashRounds(payload?.cards ?? [], reply?.cards ?? []);
    const c = rounds.filter((r) => r.winner === 'challenger').length;
    const o = rounds.filter((r) => r.winner === 'opponent').length;
    return { winner: c > o ? 'challenger' : o > c ? 'opponent' : 'draw', scores: { challenger: c, opponent: o } };
  }
  const cards = payload?.cards ?? [];
  const c = sortScore(cards, payload?.order);
  const o = sortScore(cards, reply?.order);
  const cm = Number(payload?.ms) || 0;
  const om = Number(reply?.ms) || 0;
  const winner = c > o ? 'challenger' : o > c ? 'opponent' : cm < om ? 'challenger' : om < cm ? 'opponent' : 'draw';
  return { winner, scores: { challenger: c, opponent: o }, ms: { challenger: cm, opponent: om } };
}

export function outcomeFor(challenge, userId) {
  const side = challenge.challenger === userId ? 'challenger' : challenge.opponent === userId ? 'opponent' : null;
  if (!side || challenge.status !== 'done' || !challenge.result) return { side, outcome: null };
  const w = challenge.result.winner;
  return { side, outcome: w === 'draw' ? 'draw' : w === side ? 'win' : 'lose' };
}
