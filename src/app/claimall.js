import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { loadInk } from '../ink.js';
import * as store from '../collection.js';
import { esc, ink, money, refreshWallet, state, toast } from './core.js';
import { spawnBurst } from './open.js';

const held = () => ({
  coins: Number(store.loadWallet()) || 0,
  ink: Number(loadInk()) || 0,
  boosters: Object.values(state.inventory ?? {}).reduce((sum, slot) => sum + (Number(slot?.count) || 0), 0)
});

export function gainsText(before, after) {
  const parts = [];
  const coins = after.coins - before.coins;
  const inkGot = after.ink - before.ink;
  const boosters = after.boosters - before.boosters;
  if (coins > 0) parts.push(`+${money(coins)}`);
  if (inkGot > 0) parts.push(`+${ink(inkGot)}`);
  if (boosters > 0) parts.push(esc(t(boosters === 1 ? 'claimAllBooster' : 'claimAllBoosters', { n: boosters })));
  return parts.join(' · ');
}

export function claimAllButton(count, run, { block = false, quiet = false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${quiet ? 'btn-ghost' : 'btn-primary'} btn-sm claim-all${block ? ' btn-block' : ''}`;
  btn.dataset.claimAll = String(count);
  btn.innerHTML = `${iconSvg('gift', { size: 15 })}<span></span>`;
  btn.querySelector('span').textContent = t('claimAll', { n: count });
  btn.hidden = count < 2;
  press(btn, { sound: null });
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.disabled = true;
    run(btn);
  });
  return btn;
}

export function claimAllBar(count, run, options = {}) {
  const bar = document.createElement('div');
  bar.className = 'claim-bar';
  bar.innerHTML = `<span class="claim-bar-mark" aria-hidden="true">${iconSvg('gift', { size: 18 })}</span><span class="claim-bar-copy"></span>`;
  bar.querySelector('.claim-bar-copy').textContent = t('claimAllReady');
  bar.append(claimAllButton(count, run, options));
  return bar;
}

export async function claimAll(jobs, { anchor = null, color = '#fbbf24' } = {}) {
  const before = held();
  let ok = 0;
  let failed = 0;
  let lastError = null;
  for (const job of jobs) {
    try {
      await job();
      ok++;
    } catch (error) {
      failed++;
      lastError = error;
    }
  }
  refreshWallet();
  const after = held();
  if (ok) {
    const gained = gainsText(before, after);
    toast(`${esc(t(ok === 1 ? 'claimAllDoneOne' : 'claimAllDone', { n: ok }))}${gained ? ` ${gained}` : ''}`, 'ok');
    synth.playPurchase();
    if (anchor?.isConnected) {
      const rect = anchor.getBoundingClientRect();
      spawnBurst({ shapes: ['star4', 'orb'], colors: [color, '#f8fafc', '#fbbf24'], count: 22, spread: 1.2, gravity: 0.3 },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, { scale: 0.9 });
    }
  } else if (failed) {
    synth.playDenied();
  }
  return { ok, failed, error: lastError, gained: { coins: after.coins - before.coins, ink: after.ink - before.ink, boosters: after.boosters - before.boosters } };
}
