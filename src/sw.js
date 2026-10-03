const STAMP = '__STAMP__';
const PRECACHE = __PRECACHE__;
const SHELL = `wikster-shell-${STAMP}`;
const PICTURES = 'wikster-pictures-v2';
const OLD_PICTURES = ['wikster-pictures'];
const PICTURE_LIMIT = 1500;
const KEEP_SHELLS = 2;
const NAV_TIMEOUT_MS = 3000;
const SHARED_PICTURES = /(^|\.)wikimedia\.org$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const age = (k) => Number(k.split('-').pop()) || 0;
        const shells = keys.filter((k) => k.startsWith('wikster-shell-') && k !== SHELL).sort((a, b) => age(b) - age(a));
        return Promise.all([...shells.slice(KEEP_SHELLS), ...keys.filter((k) => OLD_PICTURES.includes(k))].map((k) => caches.delete(k)));
      })
      .then(() => self.registration.navigationPreload?.enable().catch(() => {}))
      .then(() => self.clients.claim())
  );
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

const shellPage = () => caches.open(SHELL).then((cache) => cache.match('./index.html', { ignoreSearch: true }));

const isControl = (url) => url.origin === self.location.origin && /\/control(\/|$)/.test(url.pathname);

const isShell = (url) => url.origin === self.location.origin && !isControl(url)
  && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));

async function navigation(request, preload) {
  const network = () => (preload ? preload.then((early) => early ?? fetch(request)) : fetch(request));
  if (!isShell(new URL(request.url))) return network();
  try {
    const fresh = await withTimeout(network(), NAV_TIMEOUT_MS);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL);
      cache.put('./index.html', fresh.clone());
    }
    return fresh;
  } catch {
    return (await shellPage()) ?? Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  const key = new URL(request.url);
  key.search = '';
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh.ok) cache.put(key.href, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(key.href)) ?? Response.error();
  }
}

async function shellFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) (await caches.open(SHELL)).put(request, fresh.clone());
  return fresh;
}

async function picture(request) {
  const cache = await caches.open(PICTURES);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const shared = request.mode === 'no-cors' && SHARED_PICTURES.test(new URL(request.url).hostname);
    const fresh = shared
      ? await fetch(request.url, { mode: 'cors', credentials: 'omit' }).catch(() => fetch(request))
      : await fetch(request);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(request, fresh.clone()).then(() => trimPictures(cache)).catch(() => {});
    }
    return fresh;
  } catch {
    return Response.error();
  }
}

let trimming = false;
async function trimPictures(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - PICTURE_LIMIT))) await cache.delete(key);
  } finally {
    trimming = false;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isControl(url)) return;
  if (request.mode === 'navigate') { event.respondWith(navigation(request, event.preloadResponse)); return; }
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) { event.respondWith(networkFirst(request)); return; }
    if (url.pathname.includes('/assets/') && !url.pathname.endsWith('.mp3')) { event.respondWith(shellFirst(request)); return; }
    if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname.includes('/icons/') || url.pathname.includes('/special/')) { event.respondWith(shellFirst(request)); return; }
    return;
  }
  if (request.destination === 'image' && /^https?:$/.test(url.protocol)) { event.respondWith(picture(request)); }
});
