export const WIKIPEDIA_LICENCE = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };

export const MUSIC = [
  { file: 'Jazz background music loop', url: 'https://freesound.org/s/564001/' },
  { file: 'Emotional piano background music', url: 'https://freesound.org/s/564855/' },
  { file: 'Relaxing music', url: 'https://freesound.org/s/567112/' },
  { file: 'Glory Hotel', url: 'https://freesound.org/s/578598/' },
  { file: 'Background music', url: 'https://freesound.org/s/586838/' },
  { file: 'Background music (2)', url: 'https://freesound.org/s/609562/' },
  { file: 'Relaxing jazz music loop', url: 'https://freesound.org/s/723287/' }
];

export const SOFTWARE = [
  { name: 'supabase-js', licence: 'MIT', url: 'https://github.com/supabase/supabase-js' },
  { name: 'AndroidX WebKit and Core', licence: 'Apache 2.0', url: 'https://developer.android.com/jetpack/androidx' },
  { name: 'Vite', licence: 'MIT', url: 'https://vite.dev' }
];

const hostOf = (url) => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
};

export const isWikipedia = (url) => /(^|\.)wikipedia\.org$/.test(hostOf(url));

export function imagePage(thumbnail) {
  let url;
  try { url = new URL(String(thumbnail ?? '')); } catch { return null; }
  if (url.hostname !== 'upload.wikimedia.org') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'wikipedia') return null;
  const project = parts[1];
  const thumb = parts[2] === 'thumb';
  const file = thumb ? parts[5] : parts[4];
  if (!file) return null;
  const name = decodeURIComponent(file);
  const host = project === 'commons' ? 'commons.wikimedia.org' : `${project}.wikipedia.org`;
  return `https://${host}/wiki/File:${encodeURIComponent(name.replace(/ /g, '_'))}`;
}

export function cardCredit(card) {
  const url = card?.url ?? null;
  if (!url) return null;
  const wiki = isWikipedia(url);
  return {
    source: wiki ? 'Wikipedia' : (card.sourceName || hostOf(url) || null),
    article: url,
    licence: wiki ? WIKIPEDIA_LICENCE : null,
    image: imagePage(card.thumbnail)
  };
}
