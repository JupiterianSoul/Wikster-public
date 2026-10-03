import { regional, supabase } from '../account.js';
import { t, tx } from '../i18n.js';
import { SUPPORTER_TIERS, STEAM_SUPPORTER, AD_DAILY_CAP } from '../data/supporter.js';
import { buckSvg, iconSvg, inkSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { el, esc, state, toast } from './core.js';

const billing = () => (typeof window !== 'undefined' ? window.WiksterBilling : null);
const adsBridge = () => (typeof window !== 'undefined' ? window.WiksterAds : null);
const steamBridge = () => (typeof window !== 'undefined' ? window.wiksterSteam : null);

let prices = {};
let wired = false;
let adsLeft = null;
let repaint = () => {};

const userId = () => state.account?.session?.user?.id ?? null;
const owned = (tier) => (state.profile.owned?.supporter ?? []).includes(tier);

export function supportPath() {
  try { if (billing()?.ready?.()) return 'google'; } catch {}
  if (steamBridge()?.ready?.()) return 'steam';
  return null;
}

async function accountHash(id) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wikster:${id}`)));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
}

async function callBilling(body) {
  if (!supabase) return { error: 'OFFLINE' };
  try {
    const { data, error } = await supabase.functions.invoke(regional('billing'), { body });
    if (error) {
      let detail = null;
      try { detail = await error.context?.json?.(); } catch {}
      return { error: detail?.error ?? 'FAILED' };
    }
    return data ?? {};
  } catch {
    return { error: 'FAILED' };
  }
}

async function landGifts() {
  const { collectGifts } = await import('./gifts.js');
  for (let i = 0; i < 4; i++) {
    const n = await collectGifts().catch(() => 0);
    if (n) return n;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return 0;
}

async function settle(raw) {
  let got = {};
  try { got = JSON.parse(raw); } catch {}
  if (got.error) {
    if (got.error !== 'cancelled') toast(esc(t('supportFailed')), 'error');
    return;
  }
  if (!got.token || got.state !== 'purchased') {
    if (got.state === 'pending') toast(esc(t('supportPending')));
    return;
  }
  for (const productId of got.products ?? []) {
    const res = await callBilling({ action: 'google', productId, purchaseToken: got.token });
    if (res.status === 'granted' || res.status === 'already') {
      if (!got.acknowledged) { try { billing()?.acknowledge?.(got.token); } catch {} }
      if (res.status === 'granted') {
        synth.playPurchase?.();
        toast(esc(t('supportThanks')));
        await landGifts();
      }
    } else if (res.error === 'OTHER_ACCOUNT') {
      toast(esc(t('supportOtherAccount')), 'error');
    } else if (res.status !== 'pending') {
      toast(esc(t('supportFailed')), 'error');
    }
  }
  repaint();
}

function wire() {
  if (wired) return;
  wired = true;
  window.wiksterStoreReady = (json) => {
    try { prices = JSON.parse(json) ?? {}; } catch { prices = {}; }
    repaint();
  };
  window.wiksterPurchase = (json) => { settle(json).catch(() => {}); };
  window.wiksterAdDone = (json) => { adFinished(json).catch(() => {}); };
  if (steamBridge()?.ready?.()) addEventListener('focus', () => { if (userId()) steamSupporter().catch(() => {}); });
  try { prices = JSON.parse(billing()?.prices?.() ?? '{}') ?? {}; } catch {}
}

export function restorePurchases() {
  wire();
  try { billing()?.restore?.(); } catch {}
  if (steamBridge()?.ready?.()) steamSupporter().catch(() => {});
}

async function steamSupporter() {
  if (owned('contributor')) return;
  const app = Number(import.meta.env?.VITE_STEAM_SUPPORTER_APP ?? 0);
  if (app && !(await steamBridge()?.owns?.(app).catch(() => false))) return;
  const res = await callBilling({ action: 'steam' });
  if (res.status === 'granted') { toast(esc(t('supportThanks'))); await landGifts(); repaint(); }
}

async function buy(tier) {
  const id = userId();
  if (!id) { toast(esc(t('supportSignIn')), 'error'); return; }
  synth.playTap();
  if (supportPath() === 'steam') { steamBridge()?.openStore?.(); return; }
  try { billing()?.buy?.(tier.product, await accountHash(id)); } catch { toast(esc(t('supportFailed')), 'error'); }
}

function tierCard(tier) {
  const card = document.createElement('div');
  const have = tier.badges.every((b) => owned(b)) && (tier.id !== 'curator' || owned('curator'));
  card.className = `support-card atelier-tile${have ? ' is-owned' : ''}`;
  card.dataset.tier = tier.id;
  card.innerHTML = `<span class="support-mark">${iconSvg(tier.id === 'curator' ? 'books' : tier.id === 'editor' ? 'book' : 'ink', { size: 22 })}</span>
    <h4></h4><p></p><button type="button" class="btn btn-sm"></button>`;
  card.querySelector('h4').textContent = tx(tier.name);
  card.querySelector('p').textContent = tx(tier.pitch);
  const btn = card.querySelector('button');
  if (have) {
    btn.textContent = t('supportOwned');
    btn.disabled = true;
    btn.classList.add('btn-ghost');
  } else {
    const price = prices[tier.product] ?? (supportPath() === 'steam' ? `$${tier.usd}` : '');
    btn.textContent = price ? t('supportBuy', { price }) : t('supportBuyPlain');
    btn.classList.add('btn-primary');
    press(btn, { sound: null });
    btn.addEventListener('click', () => buy(tier));
  }
  return card;
}

export function paintSupport() {
  wire();
  repaint = paintSupport;
  const path = supportPath();
  const show = Boolean(path);
  el.atelierSupportHead.hidden = !show;
  el.atelierSupportNote.hidden = !show;
  el.atelierSupport.hidden = !show;
  if (!show) { el.atelierSupport.replaceChildren(); return; }
  el.atelierSupportLabel.textContent = t('backerTitle');
  el.atelierSupportNote.textContent = t('backerNote');
  const tiers = path === 'steam' ? [STEAM_SUPPORTER] : SUPPORTER_TIERS;
  el.atelierSupport.replaceChildren(...tiers.map(tierCard));
}

export const adsReady = () => {
  try { return Boolean(adsBridge()?.ready?.()); } catch { return false; }
};

export const adPrivacyRequired = () => {
  try { return Boolean(adsBridge()?.privacyRequired?.()); } catch { return false; }
};

export function adPrivacyOptions() {
  try { adsBridge()?.privacyOptions?.(); } catch {}
}

async function refreshAdsLeft() {
  if (!supabase || !userId()) return;
  try {
    const { data } = await supabase.rpc('ads_left_today', { p_cap: AD_DAILY_CAP });
    if (Number.isFinite(data)) adsLeft = data;
  } catch {}
}

let watching = false;

function watch(kind) {
  const id = userId();
  if (!id || watching) return;
  watching = true;
  synth.playTap();
  paintAds();
  try { adsBridge()?.show?.(kind, id); } catch { watching = false; paintAds(); }
}

async function adFinished(json) {
  watching = false;
  let got = {};
  try { got = JSON.parse(json); } catch {}
  if (!got.earned) {
    if (got.error) toast(esc(t('adsNone')), 'error');
    paintAds();
    return;
  }
  toast(esc(t('adsThanks')));
  const landed = await landGifts();
  if (!landed) toast(esc(t('adsLater')));
  await refreshAdsLeft();
  paintAds();
}

export function paintAds() {
  wire();
  const box = el.shopAds;
  if (!box) return;
  const on = adsReady() && Boolean(userId());
  box.hidden = !on;
  if (!on) { box.replaceChildren(); return; }
  if (adsLeft == null) refreshAdsLeft().then(() => { if (adsLeft != null) paintAds(); });
  const left = adsLeft ?? AD_DAILY_CAP;
  box.innerHTML = `<div class="shop-ads-head"><span class="label"></span><span class="shop-ads-left tabular"></span></div>
    <p class="shop-ads-note"></p><div class="shop-ads-row"></div>`;
  box.querySelector('.label').textContent = t('adsTitle');
  box.querySelector('.shop-ads-left').textContent = t('adsLeft', { n: left, max: AD_DAILY_CAP });
  box.querySelector('.shop-ads-note').textContent = t('adsNote');
  const row = box.querySelector('.shop-ads-row');
  const marks = { coins: buckSvg({ size: 15 }), ink: inkSvg({ size: 15 }), booster: iconSvg('packs', { size: 15 }) };
  for (const kind of ['coins', 'ink', 'booster']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-ghost shop-ad';
    b.disabled = watching || left <= 0;
    b.innerHTML = `${marks[kind]}<span></span>`;
    b.querySelector('span').textContent = t(`ads_${kind}`);
    press(b, { sound: null });
    b.addEventListener('click', () => watch(kind));
    row.appendChild(b);
  }
}
