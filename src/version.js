const STAMP = typeof __WIKSTER_BUILD__ !== 'undefined' ? __WIKSTER_BUILD__ : null;

export const BUILD = STAMP ?? { sha: 'dev', at: 0 };

export const SITE_URL = 'https://wikster.pages.dev/';

const LATEST_URL = `${SITE_URL}version.json`;

export const isApk = () => typeof window !== 'undefined' && Boolean(window.WiksterIcon);

export const isDesktopApp = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

export const isBundledCopy = () => typeof location !== 'undefined' && location.host === 'appassets.androidplatform.net';

export function goToLatest() {
  if (isBundledCopy()) location.replace(SITE_URL);
  else location.reload();
}

export const isNewerBuild = (candidate, than = BUILD) =>
  Boolean(candidate?.sha) && candidate.sha !== than?.sha && Number(candidate.at ?? 0) > Number(than?.at ?? 0);

export async function checkForUpdate() {
  if (!BUILD.at || isDesktopApp()) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${LATEST_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const latest = await res.json();
    return isNewerBuild(latest) ? latest : null;
  } catch {
    return null;
  }
}
