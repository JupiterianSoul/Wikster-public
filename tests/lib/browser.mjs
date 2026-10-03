import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findLocalChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return null;
  const builds = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const build of builds) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
      const path = join(root, build, rel);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

export const launchOptions = () => {
  const path = process.env.CHROME_PATH || (process.env.CI ? null : findLocalChromium());
  return path ? { executablePath: path } : {};
};
