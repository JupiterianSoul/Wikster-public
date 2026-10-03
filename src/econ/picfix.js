import { isTextArt, PICTURE_VERSION } from '../wiki/art.js';
import { commit } from './core.js';

export const PICFIX_MAX = 24;
export const PICFIX_MS = 5000;
export const PICFIX_EVERY_MS = 6 * 3600 * 1000;
export const PICFIX_SOON_MS = 10 * 60 * 1000;

const tried = new Map();

export const forgetPictureTries = () => tried.clear();

export function pictureApi(sourceId) {
  const id = String(sourceId ?? '');
  const wikipedia = /^wikipedia:([a-z-]{2,12})$/.exec(id);
  if (wikipedia) return `https://${wikipedia[1]}.wikipedia.org/w/api.php`;
  const wiki = /^wiki:([a-z0-9.-]+(?::\d+)?)(\/[^?#]*)?$/i.exec(id);
  if (wiki) return `https://${wiki[1]}${(wiki[2] ?? '').replace(/\/$/, '')}/api.php`;
  return null;
}

export function needsPicture(row) {
  const key = String(row?.article_key ?? row?.key ?? '');
  const data = row?.data ?? {};
  if (!key || key.startsWith('special:') || data.special || data.creator) return false;
  if (!isTextArt(data.thumbnail) && data.thumbnail) return false;
  if (Number(data.pictureCheck) === PICTURE_VERSION) return false;
  return Boolean(pictureApi(data.sourceId) && row.title);
}

function within(work, ms) {
  let timer;
  return Promise.race([
    work,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })
  ]).finally(() => clearTimeout(timer));
}

async function plateRows(ctx) {
  if (typeof ctx.store.plateCards === 'function') return (await ctx.store.plateCards()) ?? [];
  return (await ctx.store.cards(null)) ?? [];
}

export async function fixCardPictures(ctx, loaded) {
  if (typeof ctx.findPictures !== 'function' || !loaded) return null;
  const last = tried.get(ctx.user);
  if (last && ctx.now - last < PICFIX_EVERY_MS) return null;
  if (tried.size > 5000) tried.clear();
  tried.set(ctx.user, ctx.now);
  const rows = (await plateRows(ctx)).filter(needsPicture);
  if (!rows.length) return null;
  const doing = rows.slice(0, PICFIX_MAX);
  const groups = new Map();
  for (const row of doing) {
    const api = pictureApi(row.data.sourceId);
    if (!groups.has(api)) groups.set(api, []);
    groups.get(api).push(row);
  }
  const until = Date.now() + PICFIX_MS;
  const patch = [];
  const keys = [];
  let unfinished = rows.length > doing.length;
  for (const [api, list] of groups) {
    const left = until - Date.now();
    if (left < 500) { unfinished = true; break; }
    const found = await within(Promise.resolve(ctx.findPictures(list.map((row) => ({ title: row.title })), {
      apiUrl: api, hint: list[0].data.description || null, look: { subject: list[0].data.description ?? '' }, deadline: until
    })).catch(() => null), left);
    if (!found) { unfinished = true; continue; }
    for (const row of list) {
      const key = row.article_key ?? row.key;
      const got = found.get(row.title);
      const real = got && got.picture?.source !== 'text' && got.thumbnail && !isTextArt(got.thumbnail);
      const data = { pictureCheck: PICTURE_VERSION };
      if (real) {
        data.thumbnail = got.thumbnail;
        data.picture = got.picture && (got.picture.source !== 'page' || got.picture.pixel) ? got.picture : null;
      }
      patch.push({ key, data });
      keys.push(key);
    }
  }
  if (unfinished) tried.set(ctx.user, ctx.now - PICFIX_EVERY_MS + PICFIX_SOON_MS);
  if (!patch.length) return null;
  await commit(ctx, loaded, { patch }, { keys });
  return { fixed: patch.filter((p) => p.data.thumbnail).map((p) => p.key), checked: patch.length };
}
