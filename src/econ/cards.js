const CORE = new Set(['key', 'title', 'rarityId', 'price', 'count', 'lang', 'packId', 'favorite', 'prints']);

const printsField = (v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length ? { ...v } : null);

export function entryToRow(entry, origin = 'pull') {
  const data = {};
  for (const [k, v] of Object.entries(entry ?? {})) {
    if (!CORE.has(k) && v !== undefined) data[k] = v;
  }
  return {
    key: entry.key,
    title: entry.title ?? entry.key,
    rarityId: entry.rarityId ?? 'common',
    price: Math.max(0, Math.round(Number(entry.price) || 0)),
    copies: Math.max(1, Math.round(Number(entry.count) || 1)),
    lang: entry.lang ?? 'en',
    packId: entry.packId ?? null,
    origin,
    data,
    ...(printsField(entry.prints) ? { prints: printsField(entry.prints) } : {})
  };
}

export function rowToEntry(row) {
  if (!row) return null;
  return {
    ...(row.data ?? {}),
    key: row.article_key ?? row.key,
    title: row.title,
    rarityId: row.rarity_id ?? row.rarityId,
    price: Number(row.price) || 0,
    count: Number(row.copies ?? row.count) || 1,
    lang: row.lang ?? 'en',
    packId: row.pack_id ?? row.packId ?? null,
    favorite: Boolean(row.favorite),
    ...(printsField(row.prints) ? { prints: printsField(row.prints) } : {})
  };
}

export function pullEntry(pull, packId, at) {
  const { article } = pull;
  return {
    key: article.key,
    title: article.title,
    description: article.description,
    extract: article.extract,
    thumbnail: article.thumbnail,
    url: article.url,
    lang: article.lang,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    views: article.views,
    popularity: article.popularity,
    rarityId: pull.rarityId,
    price: pull.price,
    packId,
    packName: pull.packName,
    packIcon: pull.packIcon,
    packAccent: pull.packAccent,
    count: 1,
    favorite: false,
    firstPulledAt: at,
    lastPulledAt: at,
    ...(article.special ? { special: article.special, article: article.article ?? null, creator: Boolean(article.creator), ...(article.skin ? { skin: article.skin } : {}) } : {}),
    ...(article.mature ? { mature: true } : {}),
    ...(article.picture ? { picture: article.picture } : {})
  };
}
