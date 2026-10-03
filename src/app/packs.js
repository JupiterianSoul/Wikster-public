import { buildPackElement } from '../packview.js';
import * as store from '../collection.js';
import { specId, specName, specTagline } from '../booster.js';
import { iconSvg } from '../data/icons.js';
import { getLanguage, t, tx } from '../i18n.js';
import { proceduralStyle } from '../packstyle.js';
import { monogramSvg } from '../data/emblems.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { biggestIndex, findKey, findWikis, foldName, formatPages, pageCount } from '../wiki/finder.js';
import { MAX_TIMED_LEVEL, TIMED_CARDS, accrue, levelBounds, levelProgress, maxHeld, msToNext, regenMs, timedLevel, timedSpec, timedTopTier } from '../timed.js';
import { RARITIES } from '../data/rarities.js';
import { formatCountdown } from '../shop.js';
import { reportQuest } from './arcade.js';
import { packsRail } from './boot.js';
import { WIDE, el, esc, showScreen, state, toast } from './core.js';
import { pushNote } from './drawer.js';
import { live } from './live.js';
import { batchFor, gainBooster, openScreenFor, schedulePrefetch } from './open.js';
import { askServer, econ, econMessage, onEconRetry, serverEconomy } from './econ.js';
import { hideNsfw, matureAllowed, matureBadge, packHidden } from './mature.js';
import { minorsText, minorsWiki } from '../wiki/safety.js';
import { holdMerged, spentList, takeParts } from './ready.js';
import { screenText } from '../wordfilter.js';
import { updateBadges } from './regalia.js';
import { payStipend, renderShop } from './shop.js';
import { keeper } from './keep.js';

export function buildBooster(spec, { interactive = false, size = '' } = {}) {
  const booster = buildPackElement(spec, { interactive, size });
  if (interactive && state.ripDir) booster.dataset.ripDir = String(state.ripDir);
  return booster;
}

export function ownedFor(mode) {
  return store.ownedBoosters(state.inventory)
    .filter((slot) => (mode === 'custom') === (slot.spec.kind === 'custom' || slot.spec.kind === 'code'))
    .filter((slot) => !packHidden(slot.spec))
    .sort((a, b) => specName(a.spec).localeCompare(specName(b.spec)));
}

const packsKeep = keeper(() => JSON.stringify([
  state.packMode, Object.entries(state.inventory ?? {}).map(([id, s]) => `${id}:${s?.count}`),
  (state.customPacks ?? []).map((p) => p.id), hideNsfw(), matureAllowed(), WIDE.matches, state.ripDir
]));

export function showPacks() {
  if (packsKeep.fresh()) {
    if (state.packSlots.length) paintPackCaption(Math.min(packsRail.index, state.packSlots.length - 1));
    return;
  }
  renderPacks();
}

export function renderPacks() {
  paintPacks();
  packsKeep.mark();
}

function paintPacks() {
  const slots = ownedFor(state.packMode);
  state.packSlots = slots;

  const custom = state.packMode === 'custom';
  el.creatorWrap.hidden = !custom;
  if (custom) renderCreator();
  const has = slots.length > 0;
  el.packsRail.hidden = !has;
  el.packsCaption.hidden = !has;
  el.packsActions.hidden = !has;
  el.packsEmpty.hidden = has;

  if (!has) {
    packsRail.setItems([]);
    el.packsEmpty.hidden = custom;
    el.packsEmptyMark.innerHTML = iconSvg('packs', { size: 46 });
    el.packsEmptyText.textContent = t('shelfEmpty');
    el.packsEmptyCta.textContent = t('goShop');
    el.packsEmptyCta.hidden = false;
    return;
  }

  packsRail.setItems(slots.map((slot, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rail-item';
    item.dataset.index = String(index);
    item.setAttribute('aria-label', specName(slot.spec));
    item.appendChild(buildBooster(slot.spec));

    const badge = document.createElement('span');
    badge.className = 'own-badge';
    badge.textContent = `×${slot.count}`;
    item.appendChild(badge);

    item.addEventListener('click', () => {
      if (index === packsRail.index) openScreenFor(slot.spec);
      else packsRail.scrollTo(index);
    });
    return item;
  }));
  paintPackCaption(Math.min(packsRail.index, slots.length - 1));
}

export function paintPackCaption(index) {
  const slot = state.packSlots[index];
  if (!slot) return;
  el.packsName.textContent = specName(slot.spec);
  el.packsSub.textContent = specTagline(slot.spec);
  el.packsOwn.innerHTML = `${t('youOwn', { n: slot.count })} · ${slot.spec.cards} ${t('cards', { n: slot.spec.cards })}`;
  el.packsOpen.textContent = t('openPack');
  el.packsOpen.onclick = () => openScreenFor(slot.spec);
  const all = batchFor(slot.spec);
  if (el.packsOpenAll) {
    el.packsOpenAll.hidden = !all;
    el.packsOpenAll.textContent = all ? t('openAllN', { n: all }) : '';
    el.packsOpenAll.onclick = () => openScreenFor(slot.spec, { batch: true });
  }
  el.packsHint.textContent = t(WIDE.matches ? 'dragShelf' : 'swipeShelf');
  schedulePrefetch(slot.spec);
}

export const FORGE_IDEAS = ['Minecraft', 'Naruto', 'Pokémon', 'Star Wars', 'Zelda', 'One Piece'];

export function paintForgeSeal(text) {
  const subject = text.trim();
  const style = proceduralStyle((subject || 'wikster').toLowerCase());
  el.forgeSeal.style.setProperty('--accent', style.accent);
  el.forgeSeal.style.setProperty('--accent2', style.accent2);
  const letter = (subject.charAt(0) || 'W').toUpperCase();
  el.forgeSeal.innerHTML = monogramSvg(letter, subject.length * 3, { size: 86 });
  el.forgeSeal.classList.toggle('is-live', subject.length > 0);
}

export function renderCreator() {
  el.forgeTitle.textContent = t('creatorTitle');
  el.forgeNote.textContent = t('creatorNote');
  el.creatorInput.placeholder = t('customPlaceholder');
  el.creatorGo.textContent = t('create');
  el.creatorMineLabel.textContent = t('creatorMine');
  el.creatorStatus.hidden = !el.creatorStatus.textContent;
  paintForgeSeal(el.creatorInput.value);
  paintFinder();

  el.forgeIdeas.replaceChildren(...FORGE_IDEAS.map((idea) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'forge-idea';
    chip.textContent = idea;
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      el.creatorInput.value = idea;
      onFinderInput();
      synth.playTap();
    });
    return chip;
  }));

  const made = (state.customPacks ?? []).filter((pack) => !packHidden(pack));
  el.creatorEmpty.hidden = made.length > 0;
  if (!made.length) {
    el.creatorEmptyMark.innerHTML = iconSvg('wand', { size: 40 });
    el.creatorEmptyText.textContent = t('creatorNoneYet');
  }

  el.creatorMine.replaceChildren(...made.map((pack) => {
    const spec = {
      kind: 'custom', themeId: null, rarityId: null, cards: 5,
      customName: pack.name, customId: pack.id, wiki: pack.wiki,
      icon: pack.icon, accent: pack.accent, accent2: pack.accent2
    };
    const tile = document.createElement('div');
    tile.className = 'forge-made';
    tile.innerHTML = `
      <button type="button" class="forge-made-main">
        <span class="forge-made-art"></span>
        <b></b><span class="forge-made-sub"></span>
      </button>
      <button type="button" class="forge-made-delete" aria-label="${esc(t('deleteBoosterNamed', { name: pack.name }))}">
        ${iconSvg('trash', { size: 16 })}
      </button>`;
    tile.querySelector('.forge-made-art').appendChild(buildBooster(spec, { size: 'is-tiny' }));
    tile.querySelector('b').textContent = pack.name;
    if (pack.wiki?.mature) tile.querySelector('b').appendChild(matureBadge());
    tile.querySelector('.forge-made-sub').textContent = t('creatorInShop');

    const main = tile.querySelector('.forge-made-main');
    press(main, { sound: null });
    main.addEventListener('click', () => {
      synth.playTap();
      payStipend();
      renderShop();
      showScreen('shop');
    });

    const del = tile.querySelector('.forge-made-delete');
    let armTimer = 0;
    del.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!del.classList.contains('is-armed')) {
        del.classList.add('is-armed');
        toast(t('deleteArmed'), 'ok');
        synth.playTap();
        armTimer = setTimeout(() => del.classList.remove('is-armed'), 3500);
        return;
      }
      clearTimeout(armTimer);
      await deleteCustomPackNow(pack);
    });
    return tile;
  }));
}

export async function deleteCustomPackNow(pack) {
  if (serverEconomy()) {
    try { await econ('customDelete', { id: pack.id }); } catch (error) {
      toast(esc(econMessage(error, t)), 'error'); synth.playDenied(); return false;
    }
  } else {
    state.customPacks = store.deleteCustomPack(pack.id);
  }
  toast(t('packDeleted', { name: pack.name }), 'ok');
  synth.playResolved();
  renderCreator();
  renderPacks();
  renderShop();
  return true;
}

export function customPackName(typed, sitename) {
  const trimmed = (sitename ?? '').replace(/\s*(fandom|wiki|wikia)\s*$/i, '').trim();
  return trimmed.length >= 2 ? trimmed : typed.replace(/\s+/g, ' ').trim();
}

export function setCreatorStatus(text, kind) {
  el.creatorStatus.textContent = text;
  el.creatorStatus.className = `forge-status is-${kind}`;
  el.creatorStatus.hidden = !text;
}

export const FIND_DELAY_MS = 450;
export const FIND_SHOWN = 6;

const finder = { seq: 0, timer: 0, query: '', found: null, pick: null, searching: false };
const finds = new Map();

const FARMS = { fandom: 'Fandom', wikigg: 'wiki.gg', miraheze: 'Miraheze', wikimedia: 'Wikimedia' };

export function hitName(hit) {
  return hit.topic ? `${hit.sitename}: ${hit.topic}` : hit.sitename;
}

export async function lookUpWikis(raw) {
  const q = raw.replace(/\s+/g, ' ').trim();
  if (minorsText(q)) return { query: q, corrected: null, results: [], mature: 0, refused: true };
  const mature = matureAllowed();
  const quiet = hideNsfw();
  const key = `${findKey(q, getLanguage())}|${mature ? 1 : 0}|${quiet ? 1 : 0}`;
  if (finds.has(key)) return finds.get(key);
  let found = null;
  if (serverEconomy()) {
    try { found = (await askServer('wikiFind', { q, mature }, 16000))?.find ?? null; } catch {}
  }
  if (!Array.isArray(found?.results)) found = await findWikis(q, { lang: getLanguage(), allowMature: mature, fandom: false });
  found = {
    ...found,
    results: found.results.filter((r) => !minorsWiki(r) && (mature || !r.mature)),
    mature: quiet ? 0 : Number(found.mature) || 0
  };
  if (found.results.length) {
    finds.set(key, found);
    if (finds.size > 40) finds.delete(finds.keys().next().value);
  }
  return found;
}

function hitRow(hit, index, biggest = -1) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'forge-hit';
  row.setAttribute('role', 'option');
  row.dataset.api = hit.apiUrl;
  const selected = finder.pick === hit;
  row.setAttribute('aria-selected', String(selected));
  const name = document.createElement('span');
  name.className = 'forge-hit-name';
  name.textContent = hitName(hit);
  if (hit.mature) name.appendChild(matureBadge());
  const meta = document.createElement('span');
  meta.className = 'forge-hit-meta';
  meta.textContent = [FARMS[hit.farm] ?? t('finderIndependent'), hit.host, String(hit.lang ?? '').toUpperCase()].filter(Boolean).join(' · ');
  const size = document.createElement('span');
  size.className = 'forge-hit-size';
  size.textContent = t('finderPages', { n: formatPages(pageCount(hit), getLanguage()) });
  size.dataset.pages = String(pageCount(hit));
  const label = index === biggest ? 'finderBiggest' : index === 0 ? 'finderTopic' : null;
  if (label) {
    const tag = document.createElement('small');
    tag.dataset.tag = label;
    tag.textContent = t(label);
    size.prepend(tag);
  }
  row.append(name, meta, size);
  press(row, { sound: null });
  row.addEventListener('click', () => {
    finder.pick = hit;
    synth.playTap();
    paintFinder();
  });
  return row;
}

export function paintFinder() {
  const box = el.forgeResults;
  if (!box) return;
  const q = el.creatorInput.value.trim();
  const typed = foldName(q).length >= 3;
  if (!typed || (!finder.searching && !finder.found)) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  const note = (key, vars = {}, busy = false) => {
    const p = document.createElement('p');
    p.className = `forge-results-note${busy ? ' is-busy' : ''}`;
    p.textContent = t(key, vars);
    return p;
  };
  const hits = (finder.found?.results ?? []).slice(0, FIND_SHOWN);
  const biggest = biggestIndex(hits);
  const rows = hits.map((hit, i) => hitRow(hit, i, biggest));
  if (finder.searching) rows.unshift(note('finderSearching', {}, true));
  else if (!hits.length) rows.push(note('finderNone'));
  if (!finder.searching && finder.found?.mature > 0 && !hideNsfw()) rows.push(note('finderMatureHidden', { n: finder.found.mature }));
  box.replaceChildren(...rows);
  box.hidden = false;
}

export async function runFinder(q) {
  const seq = ++finder.seq;
  clearTimeout(finder.timer);
  finder.query = q;
  finder.searching = true;
  paintFinder();
  const found = await lookUpWikis(q).catch(() => null);
  if (seq !== finder.seq) return found;
  finder.searching = false;
  finder.found = found;
  finder.pick = found?.results?.[0] ?? null;
  paintFinder();
  return found;
}

export function onFinderInput() {
  paintForgeSeal(el.creatorInput.value);
  clearTimeout(finder.timer);
  const q = el.creatorInput.value.replace(/\s+/g, ' ').trim();
  if (q === finder.query && (finder.found || finder.searching)) return;
  finder.seq++;
  finder.found = null;
  finder.pick = null;
  finder.searching = false;
  finder.query = '';
  if (foldName(q).length < 3) { paintFinder(); return; }
  finder.timer = setTimeout(() => { runFinder(q); }, FIND_DELAY_MS);
}

export function customPackFrom(typed, hit) {
  const url = new URL(hit.apiUrl);
  const topic = hit.topic ? String(hit.topic).slice(0, 80) : null;
  const where = url.host + url.pathname.replace('/api.php', '') + (topic ? `-${foldName(topic)}` : '');
  const wiki = {
    apiUrl: hit.apiUrl, sitename: hit.sitename, lang: hit.lang ?? null, server: hit.server ?? null,
    articlePath: hit.articlePath ?? '/wiki/$1', mainPage: hit.mainPage ?? null, logo: hit.logo ?? null,
    articles: hit.articles ?? null, farm: hit.farm ?? null,
    ...(hit.mature ? { mature: true } : {}),
    ...(topic ? { topic } : {})
  };
  return {
    id: `custom-${where.replace(/\W+/g, '-')}`.slice(0, 80),
    name: topic ? topic.slice(0, 60) : customPackName(typed, hit.sitename),
    tagline: topic ? `${hit.sitename} · ${topic}`.slice(0, 160) : hit.sitename,
    icon: 'wand',
    accent: '#a78bfa', accent2: '#4c1d95',
    wiki
  };
}

export async function createCustomPack(event) {
  event.preventDefault();
  if (state.forging) return;

  const raw = el.creatorInput.value.replace(/\s+/g, ' ').trim();
  if (!raw) { setCreatorStatus(t('typeNameFirst'), 'error'); return; }

  state.forging = true;
  el.creatorGo.disabled = true;
  el.creatorInput.disabled = true;
  setCreatorStatus(t('creating'), 'working');

  try {
    let hit = finder.pick && finder.query === raw && finder.found?.results?.includes(finder.pick) ? finder.pick : null;
    if (!hit) hit = (await runFinder(raw))?.results?.[0] ?? null;
    if (!hit) {
      setCreatorStatus(t('finderNone'), 'error');
      synth.playDenied();
      return;
    }
    const pack = customPackFrom(raw, hit);
    if (minorsText(raw) || minorsWiki(pack.wiki, [pack.name, pack.tagline])) {
      setCreatorStatus(t('contentRefused'), 'error');
      synth.playDenied();
      return;
    }
    if (pack.wiki.mature && !matureAllowed()) {
      setCreatorStatus(t('matureLocked'), 'error');
      synth.playDenied();
      return;
    }
    const refused = screenText(pack.name, pack.wiki.mature ? 'adultPack' : 'pack');
    if (refused) {
      setCreatorStatus(t(`filter_${refused}`), 'error');
      synth.playDenied();
      return;
    }
    if (serverEconomy()) {
      const stop = onEconRetry((action) => { if (action === 'customSave') setCreatorStatus(t('creatorRetrying'), 'working'); });
      try {
        await econ('customSave', { pack });
      } catch (error) {
        setCreatorStatus(econMessage(error, t), 'error');
        synth.playDenied();
        return;
      } finally {
        stop();
      }
    } else {
      state.customPacks = store.saveCustomPack(pack);
      state.profile.packsBuilt = (state.profile.packsBuilt ?? 0) + 1;
    }

    renderPacks();
    renderShop();
    setCreatorStatus(t('createdGoShop', { name: pack.name }), 'ok');
    reportQuest('custom');
    el.creatorInput.value = '';
    onFinderInput();
    synth.playResolved();
  } catch {
    setCreatorStatus(t('createFailed'), 'error');
    synth.playDenied();
  } finally {
    state.forging = false;
    el.creatorGo.disabled = false;
    el.creatorInput.disabled = false;
  }
}

export function syncTimed() {
  const before = state.profile.timed.count ?? 0;
  accrue(state.profile.timed);
  const after = state.profile.timed.count ?? 0;
  const cap = maxHeld(timedLevel(state.profile.timed.opened ?? 0));
  if (after > before && after >= cap) pushNote('clock', t('notifTimedFull'), 'timed');
  store.saveProfile(state.profile);
  return state.profile.timed;
}

export function currentTimedSpec() {
  return (timedSpec(timedLevel(state.profile.timed.opened ?? 0)));
}

export function renderTimed() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;

  el.timedTitle.textContent = t('tabTimed');
  el.freeCap.textContent = t('freeOf', { max: cap });
  el.freeFoot.textContent = t('freeFoot', {
    cards: TIMED_CARDS, minutes: Math.round(regenMs(level) / 60000)
  });

  el.freePips.replaceChildren(...Array.from({ length: cap }, (_, i) => {
    const pip = document.createElement('span');
    pip.className = `free-pip${i < held ? ' is-full' : (i === held ? ' is-next' : '')}`;
    return pip;
  }));

  el.timedOpen.textContent = t('timedOpen');
  el.timedOpen.disabled = held <= 0;
  el.timedOpen.onclick = openTimed;

  el.timedOpenAll.hidden = held < 2;
  el.timedOpenAll.textContent = t('timedOpenAll', { n: held });
  el.timedOpenAll.onclick = openAllTimed;

  el.freeTrackLabel.textContent = t('freeTrackLabel');
  const { to } = levelBounds(timed.opened ?? 0);
  const atMax = level >= MAX_TIMED_LEVEL;
  el.trackLevel.textContent = t('freeLevel', { level });
  el.trackRemaining.textContent = atMax
    ? t('freeMaxed')
    : t('timedToNext', { n: to - (timed.opened ?? 0), level: level + 1 });
  live.trackBar.set(levelProgress(timed.opened ?? 0));

  const topTier = timedTopTier(level);
  const atCeiling = topTier.id === RARITIES[RARITIES.length - 1].id;
  const perks = [
    ['clock', t('freePerkSpeed', { minutes: Math.round(regenMs(level) / 60000) })],
    ['packs', t('freePerkCap', { max: cap })],
    ['gem', atCeiling ? t('freePerkTierMax') : t('freePerkTier', { tier: tx(topTier.name) })]
  ];
  el.freePerks.replaceChildren(...perks.map(([icon, text]) => {
    const row = document.createElement('div');
    row.className = 'free-perk';
    row.innerHTML = `<span class="free-perk-icon">${iconSvg(icon, { size: 17 })}</span><span></span>`;
    row.querySelector('span:last-child').innerHTML = esc(text).replace(/\*([^*]+)\*/g, '<b>$1</b>');
    return row;
  }));

  el.trackNext.textContent = atMax ? '' : t('timedNextPerks', {
    minutes: Math.round(regenMs(level + 1) / 60000), max: maxHeld(level + 1)
  });
  el.trackNext.hidden = atMax;

  tickTimed();
}

export function tickTimed() {
  const timed = state.profile.timed;
  const before = timed.count ?? 0;
  accrue(timed);
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;

  if (held !== before) {
    store.saveProfile(state.profile);
    updateBadges();
    synth.playReady();
    renderTimed();
    return;
  }

  el.freeCount.textContent = String(held);
  el.timedOpen.disabled = held <= 0;
  el.timedOpenAll.hidden = held < 2;
  if (held >= 2) el.timedOpenAll.textContent = t('timedOpenAll', { n: held });

  const left = msToNext(timed);
  if (left === null) {
    live.freeRing.set(1, '');
    el.freeState.textContent = t('freeFull');
    el.freeState.className = 'free-state is-ready';
  } else {
    const step = regenMs(level);
    live.freeRing.set(step > 0 ? 1 - left / step : 0, '');
    el.freeState.textContent = t('freeNextIn', { time: formatCountdown(left) });
    el.freeState.className = `free-state${held > 0 ? ' is-ready' : ''}`;
  }
  el.freeCap.textContent = t('freeOf', { max: cap });
}

export function openTimed() {
  openSlots(1);
}

export function openAllTimed() {
  openSlots(syncTimed().count ?? 0);
}

async function openSlots(slots) {
  if (serverEconomy()) {
    const held = syncTimed().count ?? 0;
    if (held <= 0) { synth.playDenied(); return; }
    const take = Math.min(Math.max(1, Math.floor(slots)), held);
    const merged = take > 1 ? takeParts(specId(timedSpec(timedLevel(state.profile.timed?.opened ?? 0))), take) : null;
    let res;
    try { res = await econ('timed', { slots: take, skip: spentList() }); } catch (error) {
      synth.playDenied(); toast(esc(econMessage(error, t)), 'error'); return;
    }
    const parts = merged ?? res.merged ?? null;
    if (take > 1 && parts && (res.spec?.timedSlots ?? 1) === parts.parts.length) holdMerged(specId(res.spec), parts);
    updateBadges();
    openScreenFor(res.spec);
    return;
  }
  const timed = syncTimed();
  const held = timed.count ?? 0;
  const take = Math.min(Math.max(1, Math.floor(slots)), held);
  if (held <= 0) { synth.playDenied(); return; }
  const base = currentTimedSpec();
  const spec = take > 1
    ? { ...base, cards: base.cards * take, timedSlots: take }
    : base;
  gainBooster(spec, 1);
  timed.count -= take;
  if (!Number.isFinite(timed.last)) timed.last = Date.now();
  store.saveProfile(state.profile);
  updateBadges();
  openScreenFor(spec);
}
