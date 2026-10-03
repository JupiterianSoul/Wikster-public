import { RARITIES, rarityById, rarityOfCard, rarityText } from '../data/rarities.js';
import { synth } from '../ui/sound.js';
import { t, tx } from '../i18n.js';
import * as account from '../account.js';
import { press } from '../ui/components.js';
import { iconSvg } from '../data/icons.js';
import { THEME_PACKS } from '../data/packs.js';
import { emblemSvg } from '../data/emblems.js';
import { specName, specTagline } from '../booster.js';
import { el, esc, state } from './core.js';
import { buildStaticCard, openCardDetail, refreshWishes } from './detail.js';
import { describeError, signedIn, userId } from './gate.js';
import { recall, remember } from './memo.js';

export const INDEX_SORTS = ['recent', 'name', 'value'];

export function codexCardData(row) {
  const lang = row.lang ?? String(row.key).split(':')[0] ?? 'en';
  const title = String(row.key).split(':').slice(1).join(':');
  return {
    key: row.key, title: row.title, rarityId: row.rarity, price: row.price ?? 0,
    views: row.views ?? null, thumbnail: row.thumbnail, lang,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    description: '', extract: ''
  };
}

export function indexTile(row) {
  const data = codexCardData(row);
  const rarity = rarityOfCard(data);
  const card = buildStaticCard(data, rarity, null, { fav: false, ownedTag: true });
  card.addEventListener('click', () => { synth.playTap(); openCardDetail(data.key, data, rarity, { fromIndex: true }); });
  return card;
}

export function renderCardIndex() {
  const ci = state.cardIndex;
  el.indexTitle.textContent = t('tabIndex');
  el.indexIntro.textContent = t('indexIntro');
  el.indexSearch.placeholder = t('marketSearch');
  el.indexSearch.value = ci.search;

  const tools = el.indexSearch.parentElement;
  if (!account.configured || !signedIn()) {
    el.indexStatus.textContent = account.configured ? t('marketSignIn') : t('indexOffline');
    el.indexStatus.className = 'find-status';
    tools.hidden = true;
    el.indexCounts.replaceChildren();
    el.indexList.replaceChildren();
    el.indexMore.hidden = true;
    return;
  }
  el.indexStatus.textContent = '';
  tools.hidden = false;

  if (!el.indexSearch.dataset.bound) {
    el.indexSearch.dataset.bound = '1';
    let debounce = null;
    el.indexSearch.addEventListener('input', () => {
      ci.search = el.indexSearch.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => loadIndexPage(true), 280);
    });
    el.indexMore.addEventListener('click', () => { synth.playTap(); loadIndexPage(false); });
    press(el.indexMore, { sound: null });
  }

  const wishChip = document.createElement('button');
  wishChip.type = 'button';
  wishChip.className = `chip market-sort${ci.wishMode ? ' is-on' : ''}`;
  wishChip.innerHTML = `${iconSvg('wish', { size: 12 })}<span style="margin-left:5px">${esc(t('wishTitle'))}</span>`;
  press(wishChip, { sound: null });
  wishChip.addEventListener('click', () => {
    synth.playTap();
    ci.wishMode = !ci.wishMode;
    renderCardIndex();
  });
  el.indexRarities.replaceChildren(wishChip, ...[null, ...RARITIES.map((r) => r.id)].map((id) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-sort${!ci.wishMode && ci.rarity === id ? ' is-on' : ''}`;
    const rarity = id ? rarityById(id) : null;
    chip.textContent = rarity ? tx(rarity.name) : t('filterAll');
    if (rarity && !(ci.rarity === id)) chip.style.color = rarityText(rarity);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      synth.playTap();
      ci.wishMode = false;
      ci.rarity = id;
      renderCardIndex();
    });
    return chip;
  }));

  el.indexSorts.replaceChildren(...INDEX_SORTS.map((sort) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-sort${ci.sort === sort ? ' is-on' : ''}`;
    chip.textContent = t(`indexSort_${sort}`);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      if (ci.sort === sort) return;
      synth.playTap();
      ci.sort = sort;
      renderCardIndex();
    });
    return chip;
  }));
  el.indexSorts.hidden = ci.wishMode;

  if (ci.wishMode) {
    el.indexCounts.replaceChildren(Object.assign(document.createElement('span'),
      { className: 'stat-pill',
        textContent: state.wishlist.size === 1
          ? t('wishCountOne')
          : t('wishCount', { n: state.wishlist.size }) }));
    if (state.wishlist.size) {
      const match = document.createElement('button');
      match.type = 'button';
      match.className = 'btn btn-ghost btn-sm wish-match';
      match.innerHTML = `${iconSvg('trade', { size: 14 })}<span style="margin-left:6px">${esc(t('wishMatchGo'))}</span>`;
      press(match, { sound: null });
      match.addEventListener('click', () => { synth.playTap(); import('./social.js').then((m) => m.openWishMatches()); });
      el.indexCounts.appendChild(match);
    }
    const rows = [...state.wishlist.values()].map((card) => ({
      key: card.key, title: card.title, rarity: card.rarityId,
      price: card.price, views: card.views, thumbnail: card.thumbnail, lang: card.lang
    }));
    el.indexMore.hidden = true;
    if (!rows.length) {
      el.indexList.replaceChildren(Object.assign(document.createElement('p'),
        { className: 'empty-note', textContent: t('wishEmpty') }));
    } else {
      el.indexList.replaceChildren(...rows.map(indexTile));
    }
    if (!ci.wishFresh) {
      ci.wishFresh = true;
      const before = [...state.wishlist.keys()].join('|');
      refreshWishes().then(() => {
        if (state.tab === 'cardindex' && ci.wishMode && [...state.wishlist.keys()].join('|') !== before) renderCardIndex();
      }).finally(() => { setTimeout(() => { ci.wishFresh = false; }, 5000); });
    }
    return;
  }

  paintIndexCounts();
  loadIndexPage(true);
}

export async function paintIndexCounts() {
  const ci = state.cardIndex;
  const me = userId();
  ci.counts ??= recall('indexCounts', me) ?? null;
  if (ci.counts) drawIndexCounts(ci.counts);
  try {
    const counts = await account.codexCounts();
    if (userId() !== me) return;
    ci.counts = counts;
    remember('indexCounts', me, counts);
  } catch (error) {
    if (error?.message === 'INDEX_UNSET') {
      el.indexStatus.textContent = t('indexUnset');
      el.indexStatus.className = 'find-status is-error';
    }
    return;
  }
  if (state.tab !== 'cardindex' || ci.wishMode) return;
  drawIndexCounts(ci.counts);
}

function drawIndexCounts(counts) {
  const pills = [Object.assign(document.createElement('span'),
    { className: 'stat-pill', innerHTML: `<b>${Number(counts.total ?? 0).toLocaleString()}</b> ${esc(t('indexDiscovered'))}` })];
  for (const rarity of RARITIES) {
    const n = counts.byRarity?.[rarity.id] ?? 0;
    if (!n) continue;
    const pill = document.createElement('span');
    pill.className = 'stat-pill';
    pill.innerHTML = `<b style="color:${rarityText(rarity)}">${Number(n).toLocaleString()}</b> ${esc(tx(rarity.name))}`;
    pills.push(pill);
  }
  el.indexCounts.replaceChildren(...pills);
}

const INDEX_PAGE = 40;

const plainQuery = (ci) => !ci.search.trim() && !ci.rarity && ci.sort === 'recent';

function paintIndexRows(ci) {
  el.indexStatus.textContent = '';
  if (!ci.rows.length) {
    el.indexList.replaceChildren(Object.assign(document.createElement('p'),
      { className: 'empty-note', textContent: t('indexEmpty') }));
  } else {
    el.indexList.replaceChildren(...ci.rows.map(indexTile));
  }
  el.indexMore.hidden = !ci.more;
  el.indexMore.textContent = t('indexMore');
}

export async function loadIndexPage(reset) {
  const ci = state.cardIndex;
  if (!reset && ci.busy) return;
  const ask = reset ? (ci.ask = (ci.ask ?? 0) + 1) : (ci.ask ?? 0);
  const me = userId();
  ci.busy = true;
  if (reset) {
    ci.page = 0;
    ci.rows = [];
    const kept = plainQuery(ci) ? recall('indexPage', me) : null;
    if (Array.isArray(kept) && kept.length && !el.indexList.querySelector('.card')) {
      ci.rows = kept;
      ci.more = false;
      if (state.tab === 'cardindex' && !ci.wishMode) paintIndexRows(ci);
      ci.rows = [];
    }
    el.indexList.classList.add('is-refreshing');
  } else {
    el.indexMore.classList.add('is-pending');
  }
  const query = { search: ci.search, rarity: ci.rarity, sort: ci.sort, offset: ci.page * INDEX_PAGE, limit: INDEX_PAGE };
  try {
    const rows = await account.codexPage(query);
    if (ask !== ci.ask) return;
    ci.rows = reset ? rows : [...ci.rows, ...rows];
    ci.more = rows.length === INDEX_PAGE;
    ci.page += 1;
    if (reset && plainQuery(ci) && userId() === me) remember('indexPage', me, rows);
    if (state.tab === 'cardindex' && !ci.wishMode) paintIndexRows(ci);
  } catch (error) {
    if (ask !== ci.ask) return;
    el.indexStatus.textContent = error?.message === 'INDEX_UNSET' ? t('indexUnset') : describeError(error);
    el.indexStatus.className = 'find-status is-error';
  } finally {
    if (ask === ci.ask) {
      ci.busy = false;
      el.indexList.classList.remove('is-refreshing');
      el.indexMore.classList.remove('is-pending');
    }
  }
}

export function renderGlossary() {
  el.glossaryTitle.textContent = t('tabGlossary');
  el.glossaryIntro.textContent = t('glossaryIntro');
  el.glossaryList.replaceChildren(...THEME_PACKS.map((theme) => {
    const spec = { kind: 'theme', themeId: theme.id, rarityId: null, cards: 5 };
    const row = document.createElement('div');
    row.className = 'glossary-row';
    row.style.setProperty('--ga', theme.accent);
    row.innerHTML = `
      <span class="glossary-mark">${emblemSvg(theme.id, { size: 34 })}</span>
      <span class="glossary-copy"><b></b><span></span></span>`;
    row.querySelector('b').textContent = specName(spec);
    row.querySelector('.glossary-copy span').textContent = specTagline(spec);
    return row;
  }));
}
