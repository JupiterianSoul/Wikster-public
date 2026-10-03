import { t, tx } from '../i18n.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { press } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { rarityOfCard, rarityText } from '../data/rarities.js';
import { formatAmount } from '../pricing.js';
import { esc, money, openSheet, refreshWallet, state, toast } from './core.js';
import { buildStaticCard } from './detail.js';
import { userId } from './gate.js';
import { live } from './live.js';
import { econ, serverEconomy } from './econ.js';
import { isRunning, keepPending, pending, stillSending } from './pending.js';
import { renderBinder } from './binder.js';
import './playertag.js';
import {
  M, agoText, buyoutLive, findLot, floorOf, fmtLeft, leftMs, marketError, paintList, priceOf, rarityName, reload, upsertLot
} from './market.js';

let shown = null;

const pendingKey = (id) => `lot:${id}`;

export function openLot(id) {
  const lot = findLot(id);
  shown = { id, lot, detail: null, amount: null };
  openSheet(lot?.title ?? lot?.card?.title ?? t('tabMarket'), (body) => {
    const wrap = h('div.market-sheet.ah-sheet', { dataset: { id } });
    M.sheet = wrap;
    body.append(wrap);
    paint();
  });
  refreshLot();
}

export async function refreshLot() {
  const id = shown?.id;
  if (!id) return;
  try {
    const detail = await account.lotDetail(id);
    if (shown?.id !== id || !detail) return;
    const self = userId();
    const lot = { ...detail, mine: detail.seller === self, leading: Boolean(self) && detail.bidder === self };
    shown.detail = detail;
    shown.lot = { ...(shown.lot ?? {}), ...lot, role: shown.lot?.role };
    upsertLot(lot);
    paint();
  } catch (error) {
    if (shown?.id === id && !shown.lot) {
      M.sheet?.replaceChildren(h('p.find-status.is-error', marketError(error)));
    }
  }
}

export function heardLot(row) {
  if (!shown || shown.id !== row.id) return;
  const before = shown.lot?.bid_count ?? 0;
  shown.lot = { ...(shown.lot ?? {}), ...row };
  paint();
  if ((row.bid_count ?? 0) !== before) refreshLot();
}

function line(label, html, extra = '') {
  return `<p class="market-line${extra}"><span>${esc(label)}</span><b>${html}</b></p>`;
}

function paint() {
  const wrap = M.sheet;
  if (!wrap?.isConnected || !shown?.lot) {
    if (wrap?.isConnected && !shown?.lot) wrap.replaceChildren(h('p.find-status.is-working', t('marketLoading')));
    return;
  }
  const lot = shown.lot;
  const rarity = rarityOfCard({ ...lot.card, rarityId: lot.rarity ?? lot.card?.rarityId });
  const open = lot.status === 'open' && leftMs(lot) > 0;
  const head = h('div.market-head.ah-head');
  const card = buildStaticCard({ ...(shown.detail?.card ?? lot.card), rarityId: rarity?.id }, rarity, null, { fav: false, ownedTag: true });
  card.classList.add('ah-sheet-card');
  const lines = h('div.market-lines.ah-lines');
  const leader = lot.leading ? t('marketYou') : (lot.bidder_name || '?');
  lines.innerHTML = [
    line(t('marketPrint'), `<span style="color:${rarityText(rarity)}">${esc(rarity ? tx(rarity.name) : '')}</span>`),
    line(t('marketCardValue'), money(lot.card?.price ?? 0)),
    line(t('marketSellerLine'), lot.mine || !lot.seller ? esc(lot.mine ? t('marketYou') : (lot.seller_name || '?'))
      : `<button type="button" class="market-seller" data-player="${esc(lot.seller)}" data-player-name="${esc(lot.seller_name || '')}">${esc(lot.seller_name || '?')}</button>`),
    open
      ? line(t('marketTimeLeft'), `<span class="market-time" data-ends="${esc(lot.ends_at)}">${esc(fmtLeft(leftMs(lot)))}</span>`)
      : line(t('marketClosed'), esc(agoText(lot.settled_at ?? lot.ends_at))),
    lot.current_bid != null
      ? line(open ? t('marketCurrent') : t('marketFinal'), `${money(lot.current_bid)} <small>${esc(leader)}</small>`, lot.leading ? ' is-good' : '')
      : line(t('marketStartAt'), money(lot.start_price)),
    lot.buyout != null ? line(t('marketBuyout'), money(lot.buyout), buyoutLive(lot) ? '' : ' is-muted') : '',
    line(t('marketBidsLine'), esc(String(lot.bid_count ?? 0)))
  ].join('');
  head.append(card, lines);

  const actions = h('div.market-actions.ah-actions');
  if (open && lot.mine) {
    if (!lot.bidder) {
      const cancel = h('button.btn.btn-danger.btn-block', { type: 'button', dataset: { cancel: '1' } }, t('marketCancel'));
      press(cancel, { sound: null });
      keepPending(pendingKey(lot.id), cancel);
      cancel.addEventListener('click', () => cancelFlow(lot, cancel));
      actions.append(cancel, h('p.frames-note', t('marketCancelNote')));
    } else {
      actions.append(h('p.frames-note', t('marketCancelLocked')));
    }
  } else if (open && lot.leading) {
    actions.append(h('p.ah-note.is-good', { html: t('marketLeadingNote', { amount: money(lot.current_bid) }) }));
  } else if (open) {
    actions.append(bidBox(lot));
  } else {
    actions.append(h('p.ah-note', outcomeText(lot)));
  }

  const history = h('div.ah-history');
  const bids = shown.detail?.bids ?? [];
  history.append(h('p.label', t('marketHistoryBids')));
  if (!bids.length) history.append(h('p.frames-note', shown.detail ? t('marketNoBidsYet') : t('marketLoading')));
  for (const b of bids) {
    const row = h('p.ah-bid', h('span', b.me ? t('marketYou') : (b.name || '?')), h('b', { html: `${money(b.amount)}${b.buyout ? ` <small>${esc(t('marketBuyoutTag'))}</small>` : ''}` }),
      h('small', agoText(b.at)));
    row.classList.toggle('is-me', Boolean(b.me));
    history.append(row);
  }
  const sales = shown.detail?.sales ?? [];
  if (sales.length) {
    history.append(h('p.label', t('marketRecentSales')));
    for (const s of sales) {
      history.append(h('p.ah-bid', h('span', rarityName(s.rarity)), h('b', { html: money(s.price) }), h('small', agoText(s.at))));
    }
  }
  wrap.replaceChildren(head, actions, history);
}

function outcomeText(lot) {
  if (lot.outcome === 'cancelled') return t('marketWithdrawn');
  if (lot.outcome === 'pulled') return t('marketPulled');
  if (lot.outcome === 'unsold' || (lot.status !== 'open' && !lot.bidder)) return t('marketUnsold');
  if (lot.leading) return t('marketYouWon', { amount: formatAmount(lot.current_bid ?? 0) });
  if (lot.mine) return t('marketYouSold', { amount: formatAmount(lot.current_bid ?? 0), paid: formatAmount(lot.paid ?? 0) });
  return t('marketSoldTo', { amount: formatAmount(lot.current_bid ?? 0) });
}

function bidBox(lot) {
  const floor = floorOf(lot);
  const box = h('div.ah-bidbox');
  const input = h('input.creator-input.ah-amount', { type: 'number', inputmode: 'numeric', min: String(floor), step: '1', dataset: { bid: '1' }, 'aria-label': t('marketBidLabel') });
  const wanted = Math.max(floor, Number(shown.amount) || 0);
  input.value = String(wanted);
  const go = h('button.btn.btn-primary.btn-block', { type: 'button', dataset: { go: '1' } });
  const paint = () => {
    const amount = Math.floor(Number(input.value) || 0);
    shown.amount = amount;
    const capped = lot.buyout != null && buyoutLive(lot) && amount >= lot.buyout;
    go.innerHTML = capped ? t('marketBuyGo', { amount: money(lot.buyout) }) : t('marketBidGo', { amount: money(Math.max(amount, floor)) });
  };
  const quick = h('div.ah-quick');
  const steps = [
    [t('marketQuickMin'), floor],
    ['+10%', Math.max(floor, Math.ceil(priceOf(lot) * 1.1))],
    ['+25%', Math.max(floor, Math.ceil(priceOf(lot) * 1.25))]
  ];
  for (const [label, value] of steps) {
    const chip = h('button.chip.ah-step', { type: 'button', dataset: { step: String(value) } }, h('span', label), h('b', { html: money(value) }));
    press(chip, { sound: null });
    chip.addEventListener('click', () => { synth.playTap(); input.value = String(value); paint(); });
    quick.append(chip);
  }
  input.addEventListener('input', paint);
  paint();
  press(go, { sound: null });
  keepPending(pendingKey(lot.id), go);
  go.addEventListener('click', () => bidFlow(lot, Math.floor(Number(input.value) || 0), go, false));
  box.append(h('label.label', t('marketBidLabel')), input, quick, go);
  if (buyoutLive(lot)) {
    const buy = h('button.btn.btn-ghost.btn-block.ah-buyout', { type: 'button', dataset: { buy: '1' }, html: t('marketBuyGo', { amount: money(lot.buyout) }) });
    press(buy, { sound: null });
    keepPending(pendingKey(lot.id), buy);
    buy.addEventListener('click', () => bidFlow(lot, lot.buyout, buy, true));
    box.append(buy);
  }
  box.append(h('p.frames-note', t('marketSnipeNote')));
  return box;
}

async function bidFlow(lot, amount, btn, buyout) {
  const key = pendingKey(lot.id);
  if (isRunning(key)) { stillSending(); return; }
  const floor = floorOf(lot);
  const capped = buyout || (lot.buyout != null && buyoutLive(lot) && amount >= lot.buyout);
  const pay = capped ? lot.buyout : amount;
  if (!capped && (!Number.isFinite(amount) || amount < floor)) {
    toast(esc(t('marketTooLow', { amount: formatAmount(floor) })), 'error');
    synth.playDenied();
    return;
  }
  if (pay > store.loadWallet()) {
    toast(esc(t('marketNoFunds')), 'error');
    synth.playDenied();
    return;
  }
  if (!serverEconomy()) {
    toast(esc(t('marketNeedsServer')), 'error');
    synth.playDenied();
    return;
  }
  await pending(key, btn, () => sendBid(lot, pay, capped));
}

async function sendBid(lot, pay, buyout) {
  const before = { ...lot };
  const self = userId();
  const guess = { ...lot, current_bid: pay, bidder: self, leading: true, bid_count: (lot.bid_count ?? 0) + 1, pending: true };
  upsertLot(guess);
  if (shown?.id === lot.id) shown.lot = { ...shown.lot, ...guess };
  paintList();
  try {
    const res = await econ('marketBid', buyout ? { id: lot.id, buyout: true } : { id: lot.id, amount: pay });
    const fresh = res?.result?.lot ? { ...res.result.lot, pending: false } : { ...guess, pending: false };
    upsertLot(fresh);
    if (shown?.id === lot.id) shown.lot = { ...shown.lot, ...fresh };
    refreshWallet();
    state.profile.bidsPlaced = (state.profile.bidsPlaced ?? 0) + 1;
    store.saveProfile(state.profile);
    if (res?.result?.bought) {
      toast(t('marketBoughtToast', { card: esc(lot.title ?? lot.card?.title ?? ''), amount: money(res.result.paid ?? pay) }), 'bought');
      synth.playResolved();
      renderBinder();
    } else {
      toast(t('marketBidPlaced', { amount: money(pay) }), 'ok');
      synth.playPurchase();
    }
    M.counts = null;
    paintList();
    refreshLot();
    reload();
  } catch (error) {
    upsertLot({ ...before, pending: false });
    if (shown?.id === lot.id) shown.lot = { ...before };
    paintList();
    toast(esc(marketError(error)), 'error');
    synth.playDenied();
    refreshLot();
  } finally {
    paint();
  }
}

async function cancelFlow(lot, btn) {
  const key = pendingKey(lot.id);
  if (isRunning(key)) { stillSending(); return; }
  if (!serverEconomy()) {
    toast(esc(t('marketNeedsServer')), 'error');
    synth.playDenied();
    return;
  }
  await pending(key, btn, async () => {
    try {
      const res = await econ('marketCancel', { id: lot.id });
      const fresh = res?.result?.lot;
      if (fresh) upsertLot(fresh);
      if (M.mine.selling) M.mine.selling.rows = M.mine.selling.rows.filter((x) => x.id !== lot.id);
      M.lots = M.lots.filter((x) => x.id !== lot.id);
      toast(esc(t('marketCancelled')), 'ok');
      synth.playResolved();
      if (btn.isConnected) live.sheet.hide();
      renderBinder();
      paintList();
      reload();
    } catch (error) {
      toast(esc(marketError(error)), 'error');
      synth.playDenied();
      refreshLot();
    }
  });
}
