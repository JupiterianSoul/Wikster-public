import * as store from '../collection.js';
import { addInk, loadInk } from '../ink.js';
import { rarityById, rarityText } from '../data/rarities.js';
import { priceFor } from '../pricing.js';
import { specId, specName, specIcon } from '../booster.js';
import { addXp } from '../progression.js';
import { t, getLanguage } from '../i18n.js';
import * as account from '../account.js';
import { econ, serverEconomy } from './econ.js';
import { openSheet, refreshWallet, state, toast } from './core.js';
import { live } from './live.js';
import { renderPacks } from './packs.js';
import { renderBinder } from './binder.js';
import { renderShop } from './shop.js';
import { refreshLevelBadge } from './regalia.js';
import { markThumb } from './mature.js';
import { isMature } from '../sensitive.js';

function apply(row) {
  const p = row.payload ?? {};
  switch (row.kind) {
    case 'coins': {
      const before = store.loadWallet();
      const after = p.mode === 'set' ? Number(p.amount) : before + Number(p.amount);
      store.saveWallet(Math.max(0, Math.round(after)));
      state.wallet = store.loadWallet();
      return { text: t('giftCoins', { n: Math.round(state.wallet - before) }), icon: 'coin' };
    }
    case 'ink': {
      const before = loadInk();
      if (p.mode === 'set') {
        addInk(Math.max(0, Number(p.amount) - before));
      } else {
        addInk(Number(p.amount));
      }
      return { text: t('giftInk', { n: Math.round(Number(p.amount)) }), icon: 'ink' };
    }
    case 'booster': {
      const spec = p.spec;
      if (!spec || typeof spec !== 'object') return null;
      const count = Math.max(1, Math.round(Number(p.count) || 1));
      store.addBooster(state.inventory, spec, count);
      return { text: `${count} x ${specName(spec)}`, icon: specIcon(spec), spec };
    }
    case 'card': {
      const article = p.article;
      if (!article?.key) return null;
      const rarity = rarityById(p.rarityId);
      const count = Math.max(1, Math.round(Number(p.count) || 1));
      const price = priceFor(Number(article.popularity) || 0, rarity);
      const pulls = Array.from({ length: count }, () => ({
        article, rarity, price,
        packName: t('giftPackName'), packIcon: 'gift', packAccent: null
      }));
      store.recordPulls(state.collection, pulls, { kind: 'open', themeId: null, rarityId: rarity.id, cards: count });
      return { text: `${article.title} x${count}`, icon: 'card', thumbnail: article.thumbnail, rarity, mature: isMature(article) };
    }
    case 'xp': {
      const amount = Math.round(Number(p.amount) || 0);
      if (!(amount > 0)) return null;
      state.profile.progress ??= { level: 1, xp: 0 };
      const gained = addXp(state.profile.progress, amount);
      if (gained.length) state.profile.pendingLevels = [...(state.profile.pendingLevels ?? []), ...gained];
      store.saveProfile(state.profile);
      return { text: t('giftXp', { n: amount }), icon: 'star' };
    }
    case 'takeBooster': {
      if (!p.spec || typeof p.spec !== 'object') return null;
      const id = specId(p.spec);
      const slot = state.inventory[id];
      if (!slot) return null;
      const n = Math.min(slot.count, Math.max(1, Math.round(Number(p.count) || 1)));
      slot.count -= n;
      if (slot.count <= 0) delete state.inventory[id];
      store.saveInventory(state.inventory);
      return { text: t('giftTaken', { what: specName(p.spec) }), icon: 'minus' };
    }
    case 'takeCard': {
      const entry = state.collection.entries?.[p.key];
      if (!entry) return null;
      delete state.collection.entries[p.key];
      store.saveCollection(state.collection);
      return { text: t('giftTaken', { what: entry.title ?? p.key }), icon: 'minus' };
    }
    case 'profile': {
      let changed = 0;
      for (const [path, value] of Object.entries(p.patch ?? {})) {
        const parts = String(path).split('.');
        let node = state.profile;
        for (const part of parts.slice(0, -1)) {
          if (typeof node[part] !== 'object' || !node[part]) node[part] = {};
          node = node[part];
        }
        node[parts.at(-1)] = value;
        changed++;
      }
      if (!changed) return null;
      store.normalizeProfile(state.profile);
      store.saveProfile(state.profile);
      return { text: p.say || t('giftProfile'), icon: 'star' };
    }
    case 'profileAdd': {
      const parts = String(p.path ?? '').split('.').filter(Boolean);
      if (!parts.length) return null;
      let node = state.profile;
      for (const part of parts.slice(0, -1)) {
        if (typeof node[part] !== 'object' || !node[part]) node[part] = {};
        node = node[part];
      }
      const last = parts.at(-1);
      node[last] = Math.max(0, (Number(node[last]) || 0) + (Number(p.by) || 0));
      store.normalizeProfile(state.profile);
      store.saveProfile(state.profile);
      return { text: p.say || t('giftProfile'), icon: 'star' };
    }
    case 'owned': {
      const bucket = p.bucket;
      if (!['themes', 'frames', 'fx', 'looks', 'openings', 'supporter'].includes(bucket)) return null;
      const ids = (Array.isArray(p.ids) ? p.ids : [p.id]).filter(Boolean).map(String);
      if (!ids.length) return null;
      state.profile.owned ??= { themes: [], frames: [], fx: [] };
      const list = (state.profile.owned[bucket] ??= []);
      let added = 0;
      for (const id of ids) if (!list.includes(id)) { list.push(id); added++; }
      store.saveProfile(state.profile);
      return added ? { text: t('giftOwned', { n: added, kind: t(`giftBucket_${bucket}`) }), icon: 'wand' } : null;
    }
    case 'revokeOwned': {
      const bucket = p.bucket;
      if (!['themes', 'frames', 'fx', 'looks', 'openings', 'supporter'].includes(bucket)) return null;
      const list = state.profile.owned?.[bucket];
      if (!Array.isArray(list) || !list.includes(p.id)) return null;
      state.profile.owned[bucket] = list.filter((x) => x !== p.id);
      store.saveProfile(state.profile);
      return { text: t('giftRevoked'), icon: 'minus' };
    }
    default:
      return null;
  }
}

function describeGrant(row) {
  const p = row.payload ?? {};
  switch (row.kind) {
    case 'coins': return { text: t('giftCoins', { n: Math.round(Number(p.amount) || 0) }), icon: 'coin' };
    case 'ink': return { text: t('giftInk', { n: Math.round(Number(p.amount) || 0) }), icon: 'ink' };
    case 'booster': {
      const count = Math.max(1, Math.round(Number(p.count) || 1));
      return p.spec ? { text: `${count} x ${specName(p.spec)}`, icon: specIcon(p.spec), spec: p.spec } : null;
    }
    case 'card': {
      const count = Math.max(1, Math.round(Number(p.count) || 1));
      return p.article?.key ? { text: `${p.article.title} x${count}`, icon: 'card', thumbnail: p.article.thumbnail, rarity: rarityById(p.rarityId), mature: isMature(p.article) } : null;
    }
    case 'takeCard': return { text: t('giftTaken', { what: p.key ?? '?' }), icon: 'minus' };
    case 'takeBooster': return p.spec ? { text: t('giftTaken', { what: specName(p.spec) }), icon: 'minus' } : null;
    case 'xp': return { text: t('giftXp', { n: Math.round(Number(p.amount) || 0) }), icon: 'star' };
    case 'owned': {
      const ids = (Array.isArray(p.ids) ? p.ids : [p.id]).filter(Boolean);
      return { text: t('giftOwned', { n: ids.length, kind: t(`giftBucket_${p.bucket}`) }), icon: 'wand' };
    }
    case 'revokeOwned': return { text: t('giftRevoked'), icon: 'minus' };
    case 'profile':
    case 'profileAdd': return { text: p.say || t('giftProfile'), icon: 'star' };
    default: return null;
  }
}

const LOCAL_KINDS = new Set(['profile', 'profileAdd']);

const words = (row) => {
  const lang = getLanguage() === 'fr' ? 'fr' : 'en';
  return String(row[`note_${lang}`] || row.note_en || '').trim();
};

export function openGifts(landed) {
  openSheet(t('giftTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'notice-sheet notice-gift gift-sheet';
    wrap.dataset.kindLabel = t('noticeKindGift');

    const lead = document.createElement('p');
    lead.className = 'notice-body';
    lead.textContent = t(landed.length === 1 ? 'giftLeadOne' : 'giftLeadMany', { n: landed.length });
    wrap.append(lead);

    const list = document.createElement('ul');
    list.className = 'gift-list';
    for (const item of landed) {
      const li = document.createElement('li');
      li.className = 'gift-item';
      if (item.thumbnail) {
        const img = document.createElement('img');
        img.className = 'gift-art';
        img.src = item.thumbnail;
        markThumb(img, item);
        img.alt = '';
        img.loading = 'lazy';
        li.append(img);
      }
      const what = document.createElement('b');
      what.textContent = item.text;
      if (item.rarity) what.style.color = rarityText(item.rarity);
      li.append(what);
      list.append(li);
    }
    wrap.append(list);

    const notes = [...new Set(landed.map((x) => x.note).filter(Boolean))];
    for (const note of notes) {
      const said = document.createElement('p');
      said.className = 'notice-reason gift-note';
      said.textContent = note;
      wrap.append(said);
    }
    body.append(wrap);
  });
}

let running = false;

export async function collectGifts({ quiet = false, launched = null } = {}) {
  if (running) return 0;
  const userId = state.account?.session?.user?.id ?? null;
  if (!userId) return 0;
  running = true;
  try {
    const landed = [];
    const onServer = serverEconomy();
    if (onServer) {
      const res = launched ?? await econ('grants', {}, { quiet: true }).catch(() => null);
      for (const row of res?.landed ?? []) {
        const out = describeGrant(row);
        if (out) landed.push({ ...out, note: words(row) });
      }
    }
    const kept = onServer && Array.isArray(launched?.local) ? launched.local : null;
    const rows = kept ?? (await account.waitingGrants(userId)).filter((row) => !onServer || LOCAL_KINDS.has(row.kind));
    if (!rows.length && !landed.length) return 0;

    const done = [];
    for (const row of rows) {
      let out = null;
      try { out = apply(row); }
      catch (err) { console.warn('grant', row.id, err); continue; }
      if (!out) continue;
      done.push(row.id);
      landed.push({ ...out, note: words(row) });
    }
    if (!done.length && !landed.length) return 0;

    if (done.length) await account.claimGrants(done);

    refreshWallet();
    refreshLevelBadge();
    renderPacks();
    renderShop();
    renderBinder();

    if (!quiet) {
      let tries = 0;
      const attempt = () => {
        if (live.sheet?.open || document.querySelector('.reveal')) {
          if (tries++ < 120) { setTimeout(attempt, 500); return; }
          toast(t('giftToast', { n: landed.length }));
          return;
        }
        openGifts(landed);
      };
      attempt();
    }
    return landed.length;
  } catch (err) {
    console.warn('gifts', err);
    return 0;
  } finally {
    running = false;
  }
}
