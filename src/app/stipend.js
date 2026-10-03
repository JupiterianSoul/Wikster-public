import { t } from '../i18n.js';
import { formatCountdown } from '../shop.js';
import { nextFreeAt, nextRefreshAt, stipendHourOf, windowIndexAt } from '../economy.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { el, money, refreshWallet, state, toast } from './core.js';
import { econ, serverEconomy, takeLaunchStep } from './econ.js';

let shop = null;
let shopLoading = null;

export function loadShop() {
  shopLoading ??= import('./shop.js')
    .then((m) => { shop = m; return m; })
    .catch((error) => { shopLoading = null; throw error; });
  return shopLoading;
}

export const shopIsBuilt = () => Boolean(shop?.shopIsBuilt());
export const renderShop = () => loadShop().then((m) => m.renderShop(), () => false);
export const showShop = () => loadShop().then((m) => m.showShop(), () => false);

export function freeNoteText() {
  return (`${t('freeShelfNote')} ${t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) })}`);
}

export function tickRestock() {
  const remaining = nextRefreshAt() - Date.now();
  el.restock.textContent = formatCountdown(remaining);
  const note = el.shopMarket.querySelector('[data-free-note]');
  if (note) note.textContent = freeNoteText();
  if (remaining <= 0) { payStipend(); renderShop(); }
}

export async function payStipend() {
  const launched = serverEconomy() ? takeLaunchStep('stipend') : null;
  const held = stipendHourOf(state.profile);
  if (!launched && serverEconomy() && held != null && windowIndexAt() <= held) return 0;
  const paid = launched ? Number(launched.paid) || 0
    : serverEconomy()
      ? Number((await econ('stipend').catch(() => null))?.paid) || 0
      : store.claimStipend(state.profile, store.loadWallet());
  if (paid > 0) {
    refreshWallet();
    synth.playFanfare();
    toast(t('stipendPaid', { amount: money(paid) }), 'ok');
  }
}
