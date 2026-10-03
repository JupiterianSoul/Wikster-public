export const MIN_AGE = 13;

export const ADULT_AGE = 18;

const LOCK_KEY = 'wikster.agelock.v1';

export const ageConfirmed = (user) => user?.user_metadata?.age_13_plus === true;

export const ageMeta = (age = null) => ({
  age_13_plus: true,
  age_confirmed_at: new Date().toISOString(),
  ...(Number(age) >= ADULT_AGE ? { age_18_plus: true } : {})
});

export const adultMeta = (meta) => meta?.age_18_plus === true;

export const adultConfirmed = (user) => adultMeta(user?.user_metadata);

export const noNsfwMeta = (meta) => meta?.no_nsfw === true;

export const matureOptedIn = (meta) => adultMeta(meta) && meta?.mature_wikis === true && !noNsfwMeta(meta);

export function matureMeta(on, age = null) {
  if (!on) return { mature_wikis: false };
  const adult = Number(age) >= ADULT_AGE ? { age_18_plus: true, age_18_confirmed_at: new Date().toISOString() } : {};
  return { mature_wikis: true, ...adult };
}

export function deviceLocked() {
  try { return localStorage.getItem(LOCK_KEY) === '1'; } catch { return false; }
}

export function lockDevice() {
  try { localStorage.setItem(LOCK_KEY, '1'); } catch {}
}
