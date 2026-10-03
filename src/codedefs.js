import { getLanguage, tx } from './i18n.js';

export const RETIRED_CODES = ['lorna'];

export const SPECIAL_RARITY_ID = 'special';

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isDef = (d) => isObject(d) && typeof d.id === 'string' && d.id.length > 0;

let source = () => null;
const learned = new Map();

export const useCodeSource = (fn) => { source = typeof fn === 'function' ? fn : () => null; };

export function learnCodeDefs(defs) {
  if (!isObject(defs)) return;
  for (const [id, def] of Object.entries(defs)) if (isDef(def) && def.id === id) learned.set(id, def);
}

function mine() {
  try {
    const map = source();
    return isObject(map) ? map : {};
  } catch {
    return {};
  }
}

export function codeById(id) {
  const def = mine()[id];
  return isDef(def) ? def : learned.get(id) ?? null;
}

export function knownCodes() {
  const all = new Map(learned);
  for (const [id, def] of Object.entries(mine())) if (isDef(def)) all.set(id, def);
  return [...all.values()];
}

export const codeDefsOf = (st) => (isObject(st?.codeDefs) ? st.codeDefs : {});

export const timesRedeemed = (profile, id) => Number(profile?.codesRedeemed?.[id] ?? 0);

export const hasRedeemed = (profile, id) => timesRedeemed(profile, id) > 0;

export const redeemedDefs = (st) => Object.values(codeDefsOf(st)).filter((def) => isDef(def) && hasRedeemed(st, def.id));

export const codeThemeOwned = (st, themeId) => redeemedDefs(st).some((def) => def.theme === themeId);

export const codeFrameOwned = (st, frameId) => redeemedDefs(st).some((def) => def.frame === frameId);

export function missingCodeDefs(st) {
  const defs = codeDefsOf(st);
  return Object.keys(isObject(st?.codesRedeemed) ? st.codesRedeemed : {})
    .filter((id) => hasRedeemed(st, id) && !RETIRED_CODES.includes(id) && !isDef(defs[id]) && /^[a-z0-9-]{2,40}$/.test(id));
}

export function cleanCodeDef(raw) {
  if (!isDef(raw) || !/^[a-z0-9-]{2,40}$/.test(raw.id) || RETIRED_CODES.includes(raw.id)) return null;
  if (raw.cards !== undefined && !Array.isArray(raw.cards)) return null;
  return raw;
}

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function codeSpec(entry) {
  return { kind: 'code', codeId: entry.id, rarityId: null, cards: entry.solo ? 1 : (entry.cards?.length ?? 0) + 1, themeId: null };
}

export function codeLook(entry) {
  return {
    name: tx(entry?.name) || '',
    tagline: tx(entry?.tagline) || '',
    accent: entry?.accent ?? '#f472b6',
    accent2: entry?.accent2 ?? '#7c3aed',
    light: entry?.light ?? '#ffffff'
  };
}

export function skinOf(card) {
  if (!card?.special) return null;
  if (card.creator) return 'creator';
  if (typeof card.skin === 'string' && card.skin) return card.skin;
  return codeById(card.special)?.skin ?? null;
}

export function extraCard(entry) {
  const extra = entry?.extra;
  if (!isObject(extra) || typeof extra.key !== 'string') return null;
  return {
    key: extra.creator ? `${extra.key}:${entry.id}` : extra.key,
    sourceId: 'special',
    sourceName: 'Wikster',
    pageId: null,
    title: tx(extra.title),
    description: tx(extra.description),
    extract: tx(extra.extract),
    thumbnail: extra.photo ?? null,
    url: null,
    lang: getLanguage(),
    views: null,
    wordCount: null,
    popularity: 1,
    special: entry.id,
    ...(extra.creator ? { creator: true } : entry.skin ? { skin: entry.skin } : {})
  };
}

export function specialPhoto(key) {
  const text = String(key ?? '');
  if (!text.startsWith('special:')) return null;
  for (const def of knownCodes()) {
    const extra = def.extra;
    if (!isObject(extra) || typeof extra.photo !== 'string' || !extra.photo || typeof extra.key !== 'string') continue;
    if (extra.creator ? text.startsWith(`${extra.key}:`) : text === extra.key) return extra.photo;
  }
  return null;
}

export function withSpecialPhoto(card) {
  if (!card) return card;
  const photo = specialPhoto(card.key);
  if (photo && card.thumbnail !== photo) card.thumbnail = photo;
  return card;
}

export function specialPhotoStored(card) {
  const photo = specialPhoto(card?.key);
  return !photo || card?.thumbnail === photo;
}

export function codeTitles(entry, lang = getLanguage()) {
  return (entry?.cards ?? []).map((card) => ({
    title: card[lang] ?? card.en,
    fallback: card.en,
    name: card.name ? tx(card.name) : null,
    wiki: card.wiki ?? null,
    wikiUrls: card.wikiUrls ?? null,
    page: card.page ?? null,
    search: card.search ?? null,
    text: card.text ? tx(card.text) : null,
    art: card.art === 'matrix' ? matrixArt : card.art === 'opsec' ? opsecArt : null,
    image: card.image ?? null,
    pictureLang: card.pictureLang ?? null,
    redact: Boolean(card.redact),
    slot: card.slot ?? null
  }));
}

const norm = (value) => String(value ?? '').trim().toLowerCase();

const cardAliases = (card) => [card.en, card.fr, card.page, card.name?.en, card.name?.fr]
  .filter(Boolean).map(norm);

export function codeCardFor(codeId, entry, lang = getLanguage()) {
  const code = codeById(codeId);
  if (!code) return null;
  const marks = [entry?.title, entry?.article].filter(Boolean).map(norm);
  if (!marks.length) return null;
  const byName = (code.cards ?? []).findIndex((card) => card.name && [card.name.en, card.name.fr].map(norm).includes(norm(entry?.title)));
  const index = byName >= 0 ? byName
    : (code.cards ?? []).findIndex((card) => cardAliases(card).some((alias) => marks.includes(alias)));
  if (index < 0) return null;
  return codeTitles(code, lang)[index] ?? null;
}

export function redactText(text) {
  let n = 0;
  return String(text ?? '').replace(/[\p{L}\p{N}][\p{L}\p{N}'’-]{4,}/gu, (word) => (n++ % 3 === 1 ? '█'.repeat(Math.min(word.length, 9)) : word));
}

export function opsecArt() {
  const green = '#4ade80';
  const dim = '#86efac';
  const mono = 'ui-monospace, Menlo, Consolas, monospace';
  const lines = [
    ['$ whoami', green, 120],
    ['$ uname -r', green, 150],
    ['$ cat /etc/os-release', green, 0],
    ['NAME="Arch Linux"', '#f5f5f5', 0],
    ['BUILD_ID=rolling', '#f5f5f5', 0],
    ['LOCATION=', '#f5f5f5', 170],
    ['$ pacman -Syu', green, 0],
    [':: there is nothing to do', dim, 0],
    ['$ echo $OPSEC', green, 0],
    ['I use Arch, btw.', '#f5f5f5', 0]
  ];
  const rows = lines.map(([text, colour, bar], i) => {
    const y = 92 + i * 27;
    const width = text.length * 9.6;
    return `<text x="232" y="${y}" fill="${colour}" font-family="${mono}" font-size="16">${text}</text>`
      + (bar ? `<rect x="${238 + width}" y="${y - 14}" width="${bar}" height="18" fill="#d4d4d4"/>` : '');
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" width="640" height="420">`
    + `<rect width="640" height="420" fill="#050607"/>`
    + `<rect x="14" y="14" width="612" height="392" rx="10" fill="#0b0d0e" stroke="#2a2f33" stroke-width="2"/>`
    + `<rect x="14" y="14" width="612" height="34" rx="10" fill="#1a1d20"/><rect x="14" y="38" width="612" height="10" fill="#1a1d20"/>`
    + `<circle cx="38" cy="31" r="6" fill="#ff5f57"/><circle cx="58" cy="31" r="6" fill="#febc2e"/><circle cx="78" cy="31" r="6" fill="#28c840"/>`
    + `<text x="320" y="36" text-anchor="middle" fill="#9ca3af" font-family="${mono}" font-size="14">root@archlinux: ~</text>`
    + `<g transform="translate(118 222)"><path d="M0 -78C-9 -56 -16 -38 -28 -12C-40 14 -55 44 -74 76C-52 61 -32 51 -12 46C-15 36 -17 26 -14 16C-7 1 7 1 14 16C17 26 15 36 12 46C32 51 52 61 74 76C56 44 41 14 29 -12C17 -38 9 -56 0 -78Z" fill="#1793d1"/>`
    + `<path d="M0 -78C-6 -62 -11 -50 -17 -36C-4 -42 10 -40 22 -28C14 -46 7 -62 0 -78Z" fill="#5bb8e6" opacity="0.7"/></g>`
    + rows
    + `<rect x="${232 + 16 * 9.6 + 6}" y="${92 + 9 * 27 - 14}" width="10" height="18" fill="${green}"/>`
    + `<g transform="rotate(-12 500 360)" opacity="0.85"><rect x="410" y="336" width="180" height="46" rx="4" fill="none" stroke="#e11d48" stroke-width="4"/>`
    + `<text x="500" y="368" text-anchor="middle" fill="#e11d48" font-family="${mono}" font-size="22" font-weight="700" letter-spacing="3">CLASSIFIED</text></g>`
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function matrixArt() {
  if (typeof document === 'undefined') return null;
  try {
    const W = 480, H = 640;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#010b04';
    ctx.fillRect(0, 0, W, H);
    const colW = 22, cell = 24;
    const glyphs = '01アイウエオカキクケコサシスセソタチツテト<>+*';
    ctx.font = '18px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    let seed = 1337;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < Math.ceil(W / colW); i++) {
      const length = 8 + Math.floor(rnd() * 12);
      const head = Math.floor(rnd() * (H / cell + length));
      for (let seg = 0; seg < length; seg++) {
        const y = (head - seg) * cell;
        if (y < -cell || y > H + cell) continue;
        const fade = 1 - seg / length;
        ctx.fillStyle = seg === 0 ? 'rgba(200, 255, 215, 0.95)' : `rgba(0, 255, 65, ${(0.18 + 0.6 * fade * fade).toFixed(3)})`;
        ctx.fillText(glyphs[Math.floor(rnd() * glyphs.length)], i * colW + colW / 2, y);
      }
    }
    const glow = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, H * 0.6);
    glow.addColorStop(0, 'rgba(0, 255, 65, 0.16)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
