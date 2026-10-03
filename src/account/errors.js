import { SCHEMA_OUTDATED } from './schema.js';

export function readableError(error) {
  const raw = String(error?.message ?? error ?? '').toLowerCase();
  if (!raw) return 'authUnknown';

  if (raw.includes(SCHEMA_OUTDATED.toLowerCase())) return 'authSchemaOld';

  if (raw.includes('slow_down')) return 'slowDown';
  if (raw.includes('steam_taken')) return 'steamTaken';
  if (raw.includes('steam')) return 'gateSteamFailed';
  if (raw.includes('filtered')) return 'filterRefused';
  if (raw.includes('name_refused')) return 'filterName';
  if (raw.includes('row-level security') && (raw.includes('"messages"') || raw.includes('"friendships"'))) return 'blockedCannot';

  if (raw.includes('invalid login')) return 'authBadLogin';
  if (raw.includes('already registered') || raw.includes('already been registered')) return 'authEmailTaken';
  if (raw.includes('duplicate key') && raw.includes('username')) return 'authNameTaken';
  if (raw.includes('rate limit') || raw.includes('too many')
      || raw.includes('security purposes') || raw.includes('only request this after')) return 'authTooMany';
  if (raw.includes('auth session missing') || raw.includes('session_not_found')) return 'resetSessionGone';
  if (raw.includes('different from the old password')) return 'resetSamePassword';
  if (raw.includes('easy to guess') || raw.includes('pwned')) return 'authPasswordGuessable';
  if (raw.includes('password should contain')) return 'authPasswordRules';

  if (raw.includes('signups not allowed') || raw.includes('signups are disabled')
      || raw.includes('logins are disabled') || raw.includes('provider is disabled')
      || raw.includes('not enabled')) return 'authSignupsOff';

  if (raw.includes('password')) return 'authWeakPassword';
  if (raw.includes('unable to validate email') || raw.includes('email address is invalid')
      || (raw.includes('email') && raw.includes('invalid'))) return 'authBadEmail';

  if (raw.includes('failed to fetch') || raw.includes('network')) return 'authOffline';
  if (raw.includes('does not exist') || raw.includes('schema cache')
      || raw.includes('could not find')) return 'authNoSchema';

  return null;
}
