import { t } from '../i18n.js';
import { rewardForLevel } from '../progression.js';
import { addInk, inkForLevel } from '../ink.js';
import * as store from '../collection.js';
import { econ, serverEconomy } from './econ.js';
import { refreshWallet, state, toast } from './core.js';
import { live } from './live.js';
import { ensureReady, gainBooster } from './open.js';
import { renderPacks } from './packs.js';
import { renderProfile } from './profile.js';
import { refreshLevelBadge } from './regalia.js';
import { claimAll, claimAllButton } from './claimall.js';

export function levelClaimAll() {
  const n = new Set(state.profile.pendingLevels ?? []).size;
  return n >= 2 ? claimAllButton(n, (btn) => claimAllLevels(btn), { block: true, quiet: true }) : null;
}

export async function claimAllLevels(anchor = null) {
  const levels = [...new Set(state.profile.pendingLevels ?? [])].sort((a, b) => a - b);
  if (!levels.length) return { ok: 0, failed: 0 };
  const jobs = levels.map((level) => async () => {
    const reward = rewardForLevel(level);
    if (serverEconomy()) {
      await econ('level', { level }, { gather: true });
      if (reward.spec) ensureReady(reward.spec);
      return;
    }
    if (reward.coins) store.saveWallet(store.loadWallet() + reward.coins);
    if (reward.spec) gainBooster(reward.spec, 1);
    addInk(inkForLevel(level));
    state.profile.pendingLevels = state.profile.pendingLevels.filter((l) => l !== level);
    store.saveProfile(state.profile);
  });
  const done = await claimAll(jobs, { anchor });
  if (done.failed && serverEconomy()) await econ('sync', {}, { quiet: true }).catch(() => {});
  if (!done.ok && done.failed) toast(t('econFailed'), 'error');
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  live.sheet?.hide({ silent: true, force: true });
  if (state.tab === 'profile') renderProfile();
  return done;
}
