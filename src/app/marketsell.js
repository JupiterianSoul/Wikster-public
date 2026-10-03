import { t } from '../i18n.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { press } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { rarityById, rarityText } from '../data/rarities.js';
import { formatAmount } from '../pricing.js';
import { bestPrint, printPrice, printsOf, sortedPrints, sparesOf, spareRarity } from '../econ/rules.js';
import { esc, money, openSheet, state, toast } from './core.js';
import { live } from './live.js';
import { econ, serverEconomy } from './econ.js';
import { isRunning, keepPending, pending, stillSending } from './pending.js';
import { renderBinder } from './binder.js';
import { markThumb } from './mature.js';
import { DURATIONS, M, durationLabel, feeOf, feePct, marketError, rarityName, reload, showView } from './market.js';

const art = (url) => (url ? `url("${String(url).replace(/"/g, '%22')}")` : '');

export function listablePrints(entry) {
  const prints = printsOf(entry);
  const total = Object.values(prints).reduce((a, n) => a + n, 0);
  if (total <= 1) return [[bestPrint(prints), 1]];
  return sortedPrints(sparesOf(entry));
}

export function printValue(entry, rarity) {
  return printPrice(entry.price, bestPrint(printsOf(entry)), rarity);
}

export function openSellSheet() {
  if (!serverEconomy()) {
    toast(esc(t('marketNeedsServer')), 'error');
    synth.playDenied();
    return;
  }
  const mine = store.allEntries(state.collection)
    .filter((c) => c.count > 0 && !store.isLocked(c))
    .sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  openSheet(t('marketPickCard'), (body) => {
    if (!mine.length) {
      body.append(h('p.muted', t('marketNoCards')));
      return;
    }
    const search = h('input.creator-input.ah-search', { type: 'search', placeholder: t('marketSearchMine'), 'aria-label': t('marketSearchMine'), autocomplete: 'off' });
    const grid = h('div.market-pick.ah-pick');
    const paint = () => {
      const q = search.value.trim().toLowerCase();
      const rows = (q ? mine.filter((e) => String(e.title ?? '').toLowerCase().includes(q)) : mine).slice(0, 240);
      grid.replaceChildren(...rows.map((entry) => {
        const prints = printsOf(entry);
        const thumb = h('span.market-cell-art', { style: { backgroundImage: art(entry.thumbnail), borderColor: rarityById(bestPrint(prints))?.color ?? 'transparent' } });
        markThumb(thumb, entry);
        const cell = h('button.market-cell.ah-cell', { type: 'button', dataset: { key: entry.key } },
          thumb,
          h('b', entry.title),
          h('small', { html: entry.count > 1 ? `x${esc(entry.count)}` : money(entry.price ?? 0) }));
        press(cell, { sound: null });
        cell.addEventListener('click', () => { synth.playTap(); openListSheet(entry); });
        return cell;
      }));
      if (!rows.length) grid.append(h('p.muted', t('marketNoMatch')));
    };
    search.addEventListener('input', paint);
    paint();
    body.append(h('div.ah-pick-sheet', search, grid));
  });
}

export function openListSheet(entry, wanted = null) {
  const choices = listablePrints(entry);
  let rarity = spareRarity(entry, wanted);
  if (!choices.some(([r]) => r === rarity)) rarity = choices[0][0];
  let minutes = 1440;
  let prices = null;
  openSheet(entry.title, (body) => {
    const wrap = h('div.market-sheet.ah-sell');
    const head = h('div.market-head');
    const picture = h('span.market-art.is-big', { style: { backgroundImage: art(entry.thumbnail) } });
    markThumb(picture, entry);
    const facts = h('div.market-lines');
    head.append(picture, facts);
    const printRow = h('div.ah-prints');
    const start = h('input.creator-input.ah-amount', { type: 'number', inputmode: 'numeric', min: '1', step: '1', dataset: { price: '1' }, 'aria-label': t('marketStartPrice') });
    const buyout = h('input.creator-input.ah-amount', { type: 'number', inputmode: 'numeric', min: '1', step: '1', dataset: { buyout: '1' }, placeholder: t('marketNoBuyoutHint'), 'aria-label': t('marketBuyout') });
    const startHints = h('div.ah-quick');
    const buyHints = h('div.ah-quick');
    const durations = h('div.market-durations.ah-durations');
    const fee = h('p.ah-note');
    const go = h('button.btn.btn-primary.btn-block', { type: 'button', dataset: { go: '1' } });
    const market = h('p.frames-note.ah-suggest', t('marketLoading'));

    const value = () => printValue(entry, rarity);
    const avg = () => {
      const same = (prices?.sales ?? []).filter((s) => s.rarity === rarity);
      if (!same.length) return null;
      return Math.round(same.reduce((a, s) => a + (Number(s.price) || 0), 0) / same.length);
    };
    const chip = (label, amount, target) => {
      const c = h('button.chip.ah-step', { type: 'button' }, h('span', label), h('b', { html: money(amount) }));
      press(c, { sound: null });
      c.addEventListener('click', () => { synth.playTap(); target.value = String(amount); paintFee(); });
      return c;
    };
    const paintFacts = () => {
      const r = rarityById(rarity);
      picture.style.borderColor = r?.color ?? 'transparent';
      facts.innerHTML = `
        <p class="market-line"><span>${esc(t('marketPrint'))}</span><b style="color:${rarityText(r)}">${esc(rarityName(rarity))}</b></p>
        <p class="market-line"><span>${esc(t('marketCardValue'))}</span><b>${money(value())}</b></p>
        <p class="market-line"><span>${esc(t('marketCopies'))}</span><b>${esc(String(entry.count))}</b></p>`;
    };
    const paintPrints = () => {
      printRow.replaceChildren(...choices.map(([rid, n]) => {
        const r = rarityById(rid);
        const c = h('button.chip.ah-rarity', { type: 'button', dataset: { print: rid }, style: { '--r': r?.color ?? 'var(--accent)' } },
          `${rarityName(rid)} x${n}`);
        c.classList.toggle('is-on', rid === rarity);
        press(c, { sound: null });
        c.addEventListener('click', () => {
          if (rid === rarity) return;
          synth.playTap();
          rarity = rid;
          start.value = String(Math.max(1, value()));
          paintAll();
          loadPrices();
        });
        return c;
      }));
    };
    const paintHints = () => {
      const v = Math.max(1, value());
      const a = avg();
      startHints.replaceChildren(chip(t('marketHintValue'), v, start), chip('-20%', Math.max(1, Math.round(v * 0.8)), start),
        ...(a ? [chip(t('marketHintSales'), a, start)] : []));
      buyHints.replaceChildren(chip('x1.5', Math.max(1, Math.round(v * 1.5)), buyout), chip('x2', Math.max(1, v * 2), buyout));
      const sales = prices?.sales ?? [];
      if (!prices) market.textContent = t('marketLoading');
      else if (!sales.length && prices.open == null) market.textContent = t('marketNoSales');
      else {
        const parts = [];
        if (a) parts.push(t('marketAvgSales', { amount: formatAmount(a), n: sales.filter((s) => s.rarity === rarity).length }));
        if (sales.length && !a) parts.push(t('marketLastSale', { amount: formatAmount(sales[0].price), rarity: rarityName(sales[0].rarity) }));
        if (prices.open != null) parts.push(t('marketLowestOpen', { amount: formatAmount(prices.open) }));
        market.textContent = parts.join(' · ');
      }
    };
    const paintDurations = () => {
      durations.replaceChildren(...DURATIONS.map((m) => {
        const c = h('button.chip.market-duration', { type: 'button', dataset: { minutes: String(m) } }, durationLabel(m));
        c.classList.toggle('is-on', m === minutes);
        press(c, { sound: null });
        c.addEventListener('click', () => {
          minutes = m;
          synth.playTap();
          paintDurations();
        });
        return c;
      }));
    };
    const paintFee = () => {
      const p = Math.max(0, Math.floor(Number(start.value) || 0));
      const pct = feePct();
      fee.innerHTML = t('marketFeeLine', { pct: formatAmount(pct), amount: money(p), paid: money(p - feeOf(p, pct)) });
      const b = Math.floor(Number(buyout.value) || 0);
      buyout.classList.toggle('is-bad', b > 0 && b < p);
      go.innerHTML = t('marketListGo', { amount: money(p) });
    };
    const paintAll = () => { paintFacts(); paintPrints(); paintHints(); paintFee(); };
    const loadPrices = () => {
      prices = null;
      const want = rarity;
      paintHints();
      account.cardPrices(entry.key, null).then((res) => {
        if (want !== rarity || !wrap.isConnected) return;
        prices = res ?? { sales: [], open: null };
        paintHints();
      }).catch(() => {
        prices = { sales: [], open: null };
        if (wrap.isConnected) paintHints();
      });
    };
    start.value = String(Math.max(1, value()));
    start.addEventListener('input', paintFee);
    buyout.addEventListener('input', paintFee);
    paintAll();
    paintDurations();
    press(go, { sound: null });
    keepPending(`list:${entry.key}`, go);
    go.addEventListener('click', () => {
      if (isRunning(`list:${entry.key}`)) { stillSending(); return; }
      const price = Math.floor(Number(start.value) || 0);
      const buy = Math.floor(Number(buyout.value) || 0) || null;
      if (price < 1 || price > 1000000) { toast(esc(t('marketBadPrice')), 'error'); synth.playDenied(); return; }
      if (buy != null && (buy < price || buy > 1000000)) { toast(esc(t('marketBadBuyout')), 'error'); synth.playDenied(); return; }
      pending(`list:${entry.key}`, go, () => listCard(entry, rarity, price, buy, minutes, go));
    });
    wrap.append(head,
      choices.length > 1 ? h('div', h('p.label', t('marketWhichPrint')), printRow) : printRow,
      h('label.label', t('marketStartPrice')), start, startHints, market,
      h('label.label', t('marketBuyoutOptional')), buyout, buyHints,
      h('p.label', t('marketDuration')), durations,
      fee, go,
      h('p.frames-note', t('marketCancelNote')));
    body.append(wrap);
    loadPrices();
  });
}

async function listCard(entry, rarity, price, buyout, minutes, go) {
  try {
    const res = await econ('marketList', { key: entry.key, rarity, start: price, buyout, minutes });
    const lot = res?.result?.lot;
    state.profile.auctionsListed = (state.profile.auctionsListed ?? 0) + 1;
    store.saveProfile(state.profile);
    toast(t('marketListed', { card: esc(entry.title) }), 'ok');
    synth.playResolved();
    if (go.isConnected) live.sheet.hide();
    renderBinder();
    if (lot) {
      const mine = M.mine.selling ?? { rows: [], total: 0 };
      M.mine.selling = { rows: [{ ...lot, mine: true, role: 'selling' }, ...mine.rows.filter((x) => x.id !== lot.id)], total: mine.total + 1 };
      M.counts = { ...(M.counts ?? {}), selling: (M.counts?.selling ?? 0) + 1 };
    }
    if (state.tab === 'market') {
      showView('selling');
      reload();
    }
  } catch (error) {
    toast(esc(marketError(error)), 'error');
    synth.playDenied();
  }
}
