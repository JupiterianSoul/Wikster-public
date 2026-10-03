import { live } from './live.js';

live.socialColumns = null;

export let socialTables = null;

export function socialSchemaReady() {
  return (live.socialColumns !== false);
}

export function socialTablesReady() {
  return (socialTables !== false);
}

export function forgetSchemaProbe() {
  live.socialColumns = null;
  if (live.appearanceColumn === false) live.appearanceColumn = null;
  if (live.syncKeys === false) live.syncKeys = null;
  socialTables = null;
}

export const SCHEMA_OUTDATED = 'WIKSTER_SCHEMA_OUTDATED';

export function isSchemaGap(error) {
  const code = String(error?.code ?? '');
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) return true;
  const raw = String(error?.message ?? '').toLowerCase();
  return raw.includes('does not exist')
    || raw.includes('schema cache')
    || raw.includes('could not find');
}

export const SOCIAL_COLS = 'avatar, presence, last_seen_at, visibility, showcase';
export const BADGE_COLS = 'badges';

export const LOOK_COLS = 'appearance';

export async function readProfiles(baseCols, build, { appearance = false } = {}) {
  if (appearance && live.appearanceColumn !== false && live.socialColumns !== false && live.badgeColumn !== false) {
    const { data, error } = await build(`${baseCols}, ${SOCIAL_COLS}, ${BADGE_COLS}, ${LOOK_COLS}`);
    if (!error) {
      live.socialColumns = true;
      live.badgeColumn = true;
      live.appearanceColumn = true;
      return data ?? [];
    }
    if (!isSchemaGap(error)) throw error;
    live.appearanceColumn = false;
  }
  if (live.socialColumns !== false) {
    if (live.badgeColumn !== false) {
      const { data, error } = await build(`${baseCols}, ${SOCIAL_COLS}, ${BADGE_COLS}`);
      if (!error) {
        live.socialColumns = true;
        live.badgeColumn = true;
        return data ?? [];
      }
      if (!isSchemaGap(error)) throw error;
      live.badgeColumn = false;
    }
    const { data, error } = await build(`${baseCols}, ${SOCIAL_COLS}`);
    if (!error) {
      live.socialColumns = true;
      return data ?? [];
    }
    if (!isSchemaGap(error)) throw error;
    live.socialColumns = false;
  }
  const { data, error } = await build(baseCols);
  if (error) throw error;
  return data ?? [];
}

export async function readSocialTable(run, empty) {
  if (socialTables === false) return empty;
  try {
    const value = await run();
    socialTables = true;
    return value;
  } catch (error) {
    if (!isSchemaGap(error)) throw error;
    socialTables = false;
    return empty;
  }
}

export async function writeSocial(run) {
  try {
    const value = await run();
    socialTables = true;
    return value;
  } catch (error) {
    if (isSchemaGap(error)) {
      socialTables = false;
      throw new Error(SCHEMA_OUTDATED);
    }
    throw error;
  }
}
