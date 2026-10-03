import { lookById, openingById } from './data/looks.js';

const LOOK_KEY = 'wikster.boosterLook.v1';
const OPENING_KEY = 'wikster.openingLook.v1';
const OLD_OPENING_KEY = 'wikster.opening.v1';

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

let look = null;
let opening = null;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  const l = read(LOOK_KEY);
  let o = read(OPENING_KEY);
  if (o == null) {
    const was = read(OLD_OPENING_KEY);
    if (typeof was === 'string') {
      o = was;
      write(OPENING_KEY, was);
      write(OLD_OPENING_KEY, null);
    }
  }
  look = lookById(l) ? l : null;
  opening = openingById(o) ? o : null;
}

export function wornLook() { load(); return look; }
export function wornOpening() { load(); return opening; }

export function wearLook(id) {
  load();
  look = lookById(id) ? id : null;
  write(LOOK_KEY, look);
}

export function wearOpening(id) {
  load();
  opening = openingById(id) ? id : null;
  write(OPENING_KEY, opening);
}

export const LOOK_KEYS = [LOOK_KEY, OPENING_KEY];
