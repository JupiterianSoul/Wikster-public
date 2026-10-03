import { codeById, codeCardFor, codeLook, missingCodeDefs, specialPhoto, specialPhotoStored } from '../codedefs.js';
import { entryToRow, rowToEntry } from './cards.js';
import { commit } from './core.js';

export const CARD_FIX = 1;
export const FIX_MAX = 8;
export const FIX_MS = 6000;
export const FIX_RETRY_MS = 15 * 60 * 1000;

const PLACEHOLDER = /^special:([^:]+):wikipedia:([a-z-]{2,12}):(.+)$/;
const tried = new Map();

export const forgetFixTries = () => tried.clear();

export function brokenSpecial(row) {
  const key = String(row?.article_key ?? row?.key ?? '');
  if (!key.startsWith('special:')) return null;
  const data = row.data ?? {};
  if (specialPhoto(key)) return specialPhotoStored({ key, thumbnail: data.thumbnail ?? row.thumbnail }) ? null : { kind: 'photo', key };
  const m = PLACEHOLDER.exec(key);
  if (!m || data.creator || !codeById(m[1])) return null;
  if (/^\d+$/.test(m[3].split('#')[0])) return null;
  return { kind: 'title', key, codeId: m[1], lang: m[2] };
}

function within(work, ms) {
  let timer;
  return Promise.race([
    work,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('FIX_TIMEOUT')), ms); })
  ]).finally(() => clearTimeout(timer));
}

function freshEntry(entry, card) {
  const next = {
    ...entry,
    key: card.key,
    title: card.title,
    description: card.description ?? '',
    extract: card.extract,
    thumbnail: card.thumbnail,
    url: card.url ?? entry.url ?? null,
    sourceId: card.sourceId,
    sourceName: card.sourceName,
    views: Number.isFinite(card.views) ? card.views : entry.views ?? null,
    popularity: Number.isFinite(card.popularity) ? card.popularity : entry.popularity,
    lang: card.lang ?? entry.lang,
    article: card.article ?? null
  };
  if (card.picture) next.picture = card.picture;
  else delete next.picture;
  return next;
}

async function specialRows(ctx) {
  if (typeof ctx.store.specialCards === 'function') return (await ctx.store.specialCards()) ?? [];
  const all = await ctx.store.cards(null);
  return (all ?? []).filter((row) => String(row.article_key ?? row.key ?? '').startsWith('special:'));
}

export async function fixSpecialCards(ctx, loaded) {
  if (Number(loaded?.state?.cardFix) >= CARD_FIX || typeof ctx.titleCards !== 'function') return null;
  if (missingCodeDefs(loaded?.state).length) return null;
  const last = tried.get(ctx.user);
  if (last && ctx.now - last < FIX_RETRY_MS) return null;
  if (tried.size > 5000) tried.clear();
  const rows = await specialRows(ctx);
  const broken = [];
  for (const row of rows) {
    const fix = brokenSpecial(row);
    if (fix) broken.push({ row, fix });
  }
  const titled = broken.filter((x) => x.fix.kind === 'title');
  const doing = [...broken.filter((x) => x.fix.kind === 'photo'), ...titled.slice(0, FIX_MAX)];
  const remove = [];
  const add = [];
  const patch = [];
  const keys = [];
  const renamed = {};
  const fixed = {};
  let failed = false;
  for (const { row, fix } of doing) {
    if (fix.kind !== 'photo') continue;
    const entry = { ...rowToEntry(row), thumbnail: specialPhoto(fix.key) };
    patch.push({ key: fix.key, data: { thumbnail: entry.thumbnail } });
    keys.push(fix.key);
    fixed[fix.key] = entry;
  }
  const groups = new Map();
  for (const item of doing) {
    if (item.fix.kind !== 'title') continue;
    const id = `${item.fix.codeId}|${item.fix.lang}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  const owned = new Set(rows.map((row) => String(row.article_key ?? row.key)));
  for (const list of groups.values()) {
    const { codeId, lang } = list[0].fix;
    const code = codeById(codeId);
    const entries = list.map(({ row }) => rowToEntry(row));
    const asked = entries.map((entry, i) => ({ i, want: codeCardFor(codeId, entry, lang) })).filter((x) => x.want);
    if (!asked.length) continue;
    let cards;
    try {
      cards = await within(ctx.titleCards(asked.map((x) => x.want), { special: codeId, fallbackArt: codeLook(code).accent, lang }), FIX_MS);
    } catch {
      failed = true;
      continue;
    }
    asked.forEach(({ i }, n) => {
      const card = cards?.[n];
      const entry = entries[i];
      if (!card?.key || card.pageId == null) return;
      const next = freshEntry(entry, card);
      if (next.key === entry.key) {
        const row = entryToRow(next);
        patch.push({ key: entry.key, title: row.title, data: row.data });
        keys.push(entry.key);
        fixed[entry.key] = next;
        return;
      }
      if (owned.has(next.key) || fixed[next.key]) return;
      remove.push({ key: entry.key, copies: entry.count, force: true });
      add.push({ ...entryToRow(next, 'pull'), copies: entry.count });
      if (entry.favorite) patch.push({ key: next.key, favorite: true });
      keys.push(entry.key, next.key);
      renamed[entry.key] = next.key;
      fixed[next.key] = next;
    });
  }
  const done = !failed && titled.length <= FIX_MAX;
  if (failed) tried.set(ctx.user, ctx.now);
  if (!patch.length && !add.length && !done) return null;
  await commit(ctx, loaded, { remove, add, patch, ...(done ? { state: { cardFix: CARD_FIX } } : {}) }, { keys });
  if (Object.keys(fixed).length && typeof ctx.store.cardsMoved === 'function') {
    try { await ctx.store.cardsMoved(renamed, fixed); } catch {}
  }
  return { renamed, fixed: Object.keys(fixed).length };
}
