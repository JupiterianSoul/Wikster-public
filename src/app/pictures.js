const KEEP = 240;
const CACHE = 'wikster-pictures';
const kept = new Map();

const usable = (url) => typeof url === 'string' && /^https?:/.test(url);
const CORS_HOSTS = /(^|\.)(wikimedia\.org|wikipedia\.org|nocookie\.net)$/;
const noCors = new Set();
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
const corsFor = (url) => {
  const host = hostOf(url);
  return CORS_HOSTS.test(host) && !noCors.has(host);
};
const controlled = () => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
const cacheApi = () => typeof caches !== 'undefined' && !controlled() && typeof location !== 'undefined' && location.hostname === 'appassets.androidplatform.net';

function trim() {
  while (kept.size > KEEP) {
    const [url, hit] = kept.entries().next().value;
    if (hit.blob) URL.revokeObjectURL(hit.blob);
    kept.delete(url);
    if (!hit.started) {
      hit.started = true;
      const at = waiting.indexOf(hit);
      if (at >= 0) waiting.splice(at, 1);
      hit.settle?.(false);
    }
  }
}

function decoded(img) {
  if (typeof img.decode !== 'function') return Promise.resolve(true);
  return img.decode().then(() => true, () => img.complete && img.naturalWidth > 0);
}

function load(hit, url) {
  const img = hit.img;
  return new Promise((resolve) => {
    img.onload = () => { decoded(img).then(resolve); };
    img.onerror = () => {
      if (hit.cors) {
        hit.cors = false;
        noCors.add(hostOf(url));
        img.removeAttribute('crossorigin');
        img.src = url;
        return;
      }
      resolve(false);
    };
    img.src = hit.blob ?? url;
  });
}

async function fromCache(hit, url) {
  try {
    const cache = await caches.open(CACHE);
    let res = await cache.match(url);
    if (!res) {
      const fresh = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!fresh.ok) return load(hit, url);
      cache.put(url, fresh.clone()).catch(() => {});
      res = fresh;
    }
    hit.blob = URL.createObjectURL(await res.blob());
  } catch {
    hit.blob = null;
  }
  return load(hit, url);
}

const LANES = 6;
const waiting = [];
let active = 0;

function pump() {
  while (active < LANES && waiting.length) {
    const hit = waiting.shift();
    if (hit.started) continue;
    hit.started = true;
    active++;
    const url = hit.url;
    (hit.cors && cacheApi() ? fromCache(hit, url) : load(hit, url))
      .then((ok) => { hit.done = ok; hit.settle(ok); }, () => hit.settle(false))
      .finally(() => { active--; pump(); });
  }
}

export function keepPicture(url, { soon = false } = {}) {
  if (!usable(url)) return Promise.resolve(false);
  const held = kept.get(url);
  if (held) {
    kept.delete(url);
    kept.set(url, held);
    if (soon && !held.started) {
      const at = waiting.indexOf(held);
      if (at > 0) { waiting.splice(at, 1); waiting.unshift(held); }
    }
    return held.ready;
  }
  const img = new Image();
  img.decoding = 'async';
  const cors = corsFor(url);
  if (cors) img.crossOrigin = 'anonymous';
  const hit = { img, url, cors, blob: null, ready: null, done: false, started: false, settle: null };
  hit.ready = new Promise((resolve) => { hit.settle = resolve; });
  kept.set(url, hit);
  if (soon) waiting.unshift(hit);
  else waiting.push(hit);
  trim();
  pump();
  return hit.ready;
}

export function keepPictures(urls, options = {}) {
  const list = [...new Set((urls ?? []).filter(usable))];
  const asked = new Map();
  for (const url of options.soon ? [...list].reverse() : list) asked.set(url, keepPicture(url, options));
  return Promise.all(list.map((url) => asked.get(url)));
}

export function picturesReady(urls, ms) {
  const all = keepPictures(urls, { soon: true }).then((list) => list.every(Boolean));
  return ms == null ? all : Promise.race([all, new Promise((resolve) => setTimeout(() => resolve(false), ms))]);
}

export const pictureKept = (url) => Boolean(kept.get(url)?.done);

export function pictureSrc(url) {
  const hit = kept.get(url);
  return hit?.blob ?? url;
}

export function pictureCors(url) {
  if (!usable(url)) return null;
  const hit = kept.get(url);
  if (hit?.blob) return null;
  if (hit) return hit.cors ? 'anonymous' : null;
  return corsFor(url) ? 'anonymous' : null;
}

export function showPicture(img, url, onFail) {
  const cors = pictureCors(url);
  if (cors) img.crossOrigin = cors;
  img.addEventListener('error', () => {
    if (img.crossOrigin) {
      img.removeAttribute('crossorigin');
      img.src = url;
      return;
    }
    onFail?.();
  });
  img.src = pictureSrc(url);
}
