import { seasonUnlocks } from '../season.js';
import * as store from '../collection.js';
import { t } from '../i18n.js';
import { evaluate as evaluateAchievements, measure as measureAchievements, redeemableCount } from '../achievements.js';
import { badgeStateFromRank, badgeStates, badgeSvg, romanRank } from '../badges.js';
import { fillList, press, reveal } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { iconNode, iconSvg } from '../data/icons.js';
import { albumsDeep, albumsHundred, albumsStarted } from '../albums.js';
import { loadStats as loadWikdleStats } from '../wikdle.js';
import { formatViews } from '../pricing.js';
import { specName } from '../booster.js';
import { el, esc, ink, money, openSheet, refreshWallet, showScreen, state, toast } from './core.js';
import { addInk, inkForAchievement } from '../ink.js';
import { paintDrawerLinks } from './drawer.js';
import { signedIn } from './gate.js';
import { live } from './live.js';
import { gainBooster, spawnBurst } from './open.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { saveWrites } from '../save.js';
import { claimAll, claimAllBar } from './claimall.js';
import { renderPacks } from './packs.js';
import { renderProfile } from './profile.js';

export function allBadgeStates() {
  const evaluated = evaluateAchievements(recentFacts(), state.profile.achievements?.redeemed ?? []);
  return badgeStates(evaluated, state.profile.codesRedeemed ?? {}, seasonUnlocks(state.profile).badges, state.profile.owned?.supporter ?? [], state.profile);
}

export function wearBadge(id) {
  const states = allBadgeStates();
  if (state.badgeLoadout === null) state.badgeLoadout = wornBadges(states).map((w) => w.badge.id);
  const worn = state.badgeLoadout;
  if (!worn.includes(id)) {
    if (worn.length >= 4) worn.shift();
    worn.push(id);
  }
  store.saveBadgeLoadout(worn);
}

export function wornBadges(states) {
  const earned = states.filter((st) => st.rank > 0);
  if (state.badgeLoadout !== null) {
    return state.badgeLoadout
      .map((id) => earned.find((st) => st.badge.id === id))
      .filter(Boolean)
      .slice(0, 4);
  }
  return [...earned]
    .sort((a, b) => (b.rank / b.max) - (a.rank / a.max) || b.rank - a.rank)
    .slice(0, 4);
}

const badgeArt = new Map();

function badgeNode(st) {
  const key = `${st.badge.id}|${st.rank}|${st.max}`;
  let held = badgeArt.get(key);
  if (!held) {
    const box = document.createElement('span');
    box.innerHTML = badgeSvg(st.badge, st.rank, st.max, { size: 62 });
    held = box.firstElementChild;
    badgeArt.set(key, held);
  }
  return held.cloneNode(true);
}

export function badgeChip(st, { worn = false, readOnly = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `badge-chip${st.rank > 0 ? '' : ' is-locked'}`;
  chip.innerHTML = '<b></b><span class="badge-rank"></span>';
  chip.prepend(badgeNode(st));
  chip.querySelector('b').textContent = st.name;
  const sub = chip.querySelector('.badge-rank');
  if (worn) {
    sub.replaceWith(Object.assign(document.createElement('span'),
      { className: 'badge-equipped-tag', textContent: `${st.max > 1 && st.rank > 0 ? romanRank(st.rank) + ' · ' : ''}${t('badgeWornTag')}` }));
  } else {
    sub.textContent = st.max > 1 && st.rank > 0 ? romanRank(st.rank) : '';
  }
  press(chip, { sound: null });
  chip.addEventListener('click', () => { synth.playTap(); openBadgeSheet(st, { readOnly }); });
  return chip;
}

export function renderBadges() {
  const states = allBadgeStates();
  const earned = states.filter((st) => st.rank > 0).length;
  el.badgesLabel.textContent = `${t('badgesTitle')} · ${earned}/${states.length}`;

  const head = el.badgesLabel.parentElement;
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  let manage = head.querySelector('.badges-manage');
  if (!manage) {
    manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'btn btn-sm btn-ghost badges-manage';
    press(manage, { sound: null });
    manage.addEventListener('click', () => { synth.playTap(); renderBadgesScreen(); showScreen('badges'); });
    head.appendChild(manage);
  }
  manage.textContent = t('badgesAll');

  const worn = wornBadges(states);
  if (!worn.length) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = t('badgesNone');
    el.badgeGrid.replaceChildren(note);
    return;
  }
  el.badgeGrid.replaceChildren(...worn.map((st) => badgeChip(st)));
}

export function renderBadgesScreen() {
  const states = allBadgeStates();
  el.badgesTitle.textContent = t('badgesTitle');
  el.badgesIntro.textContent = t('badgesIntro');
  const wornIds = new Set(wornBadges(states).map((st) => st.badge.id));
  fillList(el.badgesAll, states, (st) => badgeChip(st, { worn: wornIds.has(st.badge.id) }), { first: 12, batch: 24 });
}

export function toggleBadgeEquip(st) {
  const states = allBadgeStates();
  if (state.badgeLoadout === null) {
    state.badgeLoadout = wornBadges(states).map((w) => w.badge.id);
  }
  const worn = state.badgeLoadout;
  const i = worn.indexOf(st.badge.id);
  if (i >= 0) worn.splice(i, 1);
  else {
    if (worn.length >= 4) { toast(t('badgeLoadoutFull'), 'error'); synth.playDenied(); return false; }
    worn.push(st.badge.id);
  }
  store.saveBadgeLoadout(worn);
  synth.playResolved();
  return true;
}

export function openBadgeSheet(st, { readOnly = false } = {}) {
  openSheet(st.name, (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'badge-sheet';
    wrap.innerHTML = `<div class="badge-sheet-chip"></div><p class="badge-sheet-line"></p><div class="badge-rungs"></div>`;
    if (st.rank > 0 && !readOnly) {
      const wornNow = wornBadges(allBadgeStates()).some((w) => w.badge.id === st.badge.id);
      const equip = document.createElement('button');
      equip.type = 'button';
      equip.className = `btn ${wornNow ? 'btn-ghost' : 'btn-primary'}`;
      equip.textContent = wornNow ? t('badgeUnequip') : t('badgeEquip');
      press(equip, { sound: null });
      equip.addEventListener('click', () => {
        if (!toggleBadgeEquip(st)) return;
        live.sheet.hide();
        if (state.tab === 'badges') renderBadgesScreen();
        if (state.tab === 'profile') renderProfile();
      });
      wrap.insertBefore(equip, wrap.querySelector('.badge-rungs'));
    }
    wrap.querySelector('.badge-sheet-chip').innerHTML = badgeSvg(st.badge, st.rank, st.max, { size: 120 });
    wrap.querySelector('.badge-sheet-line').textContent = st.rank > 0
      ? (st.max > 1 ? t('badgeRank', { n: romanRank(st.rank), max: romanRank(st.max) }) : t('badgeEarned'))
      : t('badgeLockedLine');
    wrap.querySelector('.badge-rungs').replaceChildren(...st.rungs.map((rung) => {
      const row = document.createElement('div');
      row.className = `badge-rung${rung.unlocked ? ' is-done' : ''}`;
      row.innerHTML = `<span class="badge-rung-mark">${iconSvg(rung.unlocked ? 'check' : 'lock', { size: 14 })}</span>
        <span class="badge-rung-copy"><b></b><span></span></span>`;
      row.querySelector('b').textContent = rung.name;
      row.querySelector('.badge-rung-copy span').textContent = rung.desc;
      return row;
    }));
    body.appendChild(wrap);
  });
}

export function achFacts() {
  const entries = store.allEntries(state.collection).filter((e) => !e.special);
  return measureAchievements({
    profile: state.profile,
    entries,
    albumsDeep: albumsDeep(entries, state.customPacks),
    albumsStarted: albumsStarted(entries, state.customPacks),
    albumsHundred: albumsHundred(entries, state.customPacks),
    customPacks: state.customPacks ?? [],
    friends: state.social.friends.length,
    wallet: state.wallet,
    wikdle: loadWikdleStats(),
    wishlist: store.loadWishlist().length,
    badgesWorn: Array.isArray(state.badgeLoadout) ? state.badgeLoadout.length : 0,
    signedIn: signedIn(),
    specials: store.allEntries(state.collection).filter((e) => e.special).length
  });
}

const FACTS_FRESH_MS = 1500;
let factsMemo = null;

const factsKey = () => [saveWrites(), state.collection, state.customPacks, state.profile, state.social.friends.length,
  state.wallet, Array.isArray(state.badgeLoadout) ? state.badgeLoadout.length : 0, signedIn()];

function recentFacts() {
  const key = factsKey();
  const now = Date.now();
  if (factsMemo && now - factsMemo.at < FACTS_FRESH_MS && factsMemo.key.every((v, i) => v === key[i])) return factsMemo.facts;
  const facts = achFacts();
  factsMemo = { key, at: now, facts };
  return facts;
}

export function achievementsUnlocked() {
  return evaluateAchievements(recentFacts(), state.profile.achievements?.redeemed ?? []).filter((a) => a.unlocked).length;
}

export function achRedeemableCount() {
  return redeemableCount(recentFacts(), state.profile.achievements?.redeemed ?? []);
}

const ACH_ROW = (() => {
  const row = document.createElement('div');
  row.className = 'ach';
  row.innerHTML = '<span class="ach-icon"></span>'
    + '<span class="ach-copy"><b></b><span class="ach-desc"></span>'
    + '<span class="ach-track"><i></i></span></span>'
    + '<span class="ach-side"></span>';
  return row;
})();

export function renderAchievements() {
  el.achTitle.textContent = t('achTitle');
  const list = evaluateAchievements(achFacts(), state.profile.achievements?.redeemed ?? []);
  const done = list.filter((a) => a.unlocked).length;
  el.achSub.textContent = t('achSub', { done, total: list.length });

  const order = (a) => (a.redeemable ? 0 : !a.unlocked ? 1 : 2);
  list.sort((a, b) => order(a) - order(b)
    || (b.have / b.need) - (a.have / a.need));

  const makeRow = (a) => {
    const row = ACH_ROW.cloneNode(true);
    row.className = `ach${a.redeemable ? ' is-ready' : ''}${a.redeemed ? ' is-done' : ''}`;
    row.querySelector('.ach-icon').replaceChildren(iconNode(a.icon, { size: 20 }));
    row.querySelector('b').textContent = a.name;
    row.querySelector('.ach-desc').textContent = a.desc;
    row.querySelector('.ach-track i').style.width = `${Math.round((a.have / a.need) * 100)}%`;

    const side = row.querySelector('.ach-side');
    if (a.redeemed) {
      side.innerHTML = `<span class="ach-claimed">${iconSvg('check', { size: 16 })}</span>`;
    } else if (a.redeemable) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = t('achRedeem');
      press(btn, { sound: null });
      btn.addEventListener('click', () => redeemAchievement(a, btn));
      side.appendChild(btn);
    } else {
      const inMoney = a.stat === 'value' || a.stat === 'wallet' || a.stat === 'maxCardPrice';
      const fmt = (v) => inMoney ? money(v) : a.stat === 'maxViews' ? formatViews(v) : String(Math.floor(v));
      side.innerHTML = `<span class="ach-progress tabular">${fmt(a.have)}/<b>${fmt(a.need)}</b></span>`;
    }

    const label = document.createElement('span');
    label.className = 'ach-reward';
    label.innerHTML = (a.reward.kind === 'coins'
      ? t('achRewardCoins', { amount: money(a.reward.coins) })
      : t('achRewardPack', { name: specName(a.reward.spec) })) + ` + ${ink(inkForAchievement(a.reward))}`;
    row.querySelector('.ach-copy').appendChild(label);
    return row;
  };
  let all = document.getElementById('ach-all');
  if (!all) {
    all = document.createElement('div');
    all.id = 'ach-all';
    all.className = 'claim-all-row pad';
    el.achList.before(all);
  }
  const ready = list.filter((a) => a.redeemable).length;
  all.replaceChildren(...(ready >= 2 ? [claimAllBar(ready, (btn) => claimAllAchievements(btn))] : []));
  all.hidden = ready < 2;
  reveal(fillList(el.achList, list, makeRow, { first: 12, batch: 60 }), { step: 24, from: 8 });
}

async function payAchievement(a, { gather = false } = {}) {
  const redeemed = state.profile.achievements.redeemed;
  if (redeemed.includes(a.id)) throw new Error('ALREADY_CLAIMED');
  if (serverEconomy()) {
    await econ('achievement', { id: a.id, facts: { [a.stat]: achFacts()[a.stat] } }, { gather });
    if (a.reward.kind !== 'coins') gainBooster(a.reward.spec, 1);
    return;
  }
  redeemed.push(a.id);
  if (a.reward.kind === 'coins') store.saveWallet(store.loadWallet() + a.reward.coins);
  else gainBooster(a.reward.spec, 1);
  addInk(inkForAchievement(a.reward));
  store.saveProfile(state.profile);
}

function achievementError(error) {
  synth.playDenied();
  toast(esc(String(error?.message) === 'NOT_EARNED' ? t('econNotEarned') : econMessage(error, t)), 'error');
}

export async function redeemAchievement(a, btn) {
  if (state.profile.achievements.redeemed.includes(a.id)) return;
  btn.disabled = true;
  try {
    await payAchievement(a);
  } catch (error) {
    btn.disabled = false;
    achievementError(error);
    return;
  }
  renderPacks();
  refreshWallet();
  store.saveProfile(state.profile);
  synth.playAchievement();
  const rect = btn.getBoundingClientRect();
  spawnBurst({ shapes: ['star4', 'orb'], colors: ['#fbbf24', '#ffffff'],
    count: 14, spread: 1.1, gravity: 0.3 },
    { x: rect.left + rect.width / 2, y: rect.top }, { scale: 0.6 });
  toast(t('achRedeemed', { name: a.name }), 'ok');
  renderAchievements();
  paintDrawerLinks();
}

export async function claimAllAchievements(anchor = null) {
  const ready = evaluateAchievements(achFacts(), state.profile.achievements?.redeemed ?? []).filter((a) => a.redeemable);
  if (!ready.length) return { ok: 0, failed: 0 };
  const done = await claimAll(ready.map((a) => () => payAchievement(a, { gather: true })), { anchor });
  if (!done.ok && done.error) achievementError(done.error);
  renderPacks();
  store.saveProfile(state.profile);
  if (state.tab === 'ach') renderAchievements();
  paintDrawerLinks();
  return done;
}

export function friendShelf(profile) {
  const raw = profile?.badges;
  const earned = (Array.isArray(raw) ? raw : raw?.earned ?? [])
    .map((r) => badgeStateFromRank(r?.id, r?.rank, r?.look)).filter((st) => st && st.rank > 0);
  const wornIds = Array.isArray(raw) ? [] : (raw?.worn ?? []);
  const worn = wornIds.length
    ? wornIds.map((id) => earned.find((st) => st.badge.id === id)).filter(Boolean)
    : [...earned].sort((a, b) => (b.rank / b.max) - (a.rank / a.max) || b.rank - a.rank).slice(0, 4);
  const ach = Array.isArray(raw) ? null : (Number.isFinite(raw?.ach) ? raw.ach : null);
  return { earned, worn, ach };
}

export function paintFriendBadges(entry) {
  const { earned, worn } = friendShelf(entry.profile);
  el.friendBadgesLabel.textContent = t('friendBadgesLabel');
  el.friendBadgesEmpty.hidden = earned.length > 0;
  el.friendBadgesEmpty.textContent = t('friendBadgesEmpty', { name: entry.profile?.username ?? '' });
  el.friendBadges.replaceChildren(...worn.map((st) => badgeChip(st, { readOnly: true })));
  const head = el.friendBadgesLabel.parentElement;
  head.querySelector('.badges-manage')?.remove();
  if (!earned.length) return;
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'btn btn-ghost btn-sm badges-manage';
  all.textContent = t('friendBadgesAll', { n: earned.length });
  press(all, { sound: null });
  all.addEventListener('click', () => { synth.playTap(); openFriendBadges(entry, earned); });
  head.appendChild(all);
}

export function openFriendBadges(entry, earned) {
  openSheet(t('friendBadgesTitle', { name: entry.profile?.username ?? '' }), (body) => {
    const grid = document.createElement('div');
    grid.className = 'badge-grid is-all';
    grid.replaceChildren(...earned.map((st) => badgeChip(st, { readOnly: true })));
    body.appendChild(grid);
  });
}

export { evaluateAchievements };
