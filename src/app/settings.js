import { pulse } from '../ui/native.js';
import { adPrivacyOptions, adPrivacyRequired } from './support.js';
import { aboutRows } from './about.js';
import { LANGUAGES, getLanguage, t, tx } from '../i18n.js';
import { bump, noteIn } from '../ledger.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { codeFrameOwned, codeLook, codeSpec, codeThemeOwned, normalizeCode } from '../codedefs.js';
import { DEFAULT_THEME, THEMES } from '../ui/themes.js';
import { themeUnlocked } from '../season.js';
import { badgeSvg, codeBadge, friendBadge } from '../badges.js';
import { FRAME_STYLES, frameGrade, frameTier, frameUnlocked } from '../frames.js';
import { RARITIES, rarityText } from '../data/rarities.js';
import { DEFAULT_FX, fxForRarity } from '../data/fx.js';
import { ownsFrame, ownsFx, ownsLook, ownsOpening, ownsTheme } from '../ink.js';
import * as account from '../account.js';
import { copyText, describeSave, exportSave, importSave, parseSave, readText } from '../save.js';
import { music } from '../ui/music.js';
import { fill, h } from '../ui/dom.js';
import { backdrop } from '../ui/backdrop.js';
import { reportQuest } from './arcade.js';
import { fxSampleCard } from './fxcard.js';
import { renderBinder } from './binder.js';
import { composedFriend, el, esc, money, openSheet, rememberLook, settings, showScreen, state, storedTheme, toast, useTheme } from './core.js';
import { codeOfLook, friendDef, friendLookId, friendSpec } from '../friendcodes.js';
import { friendThemeIds } from '../appearance.js';
import { describeError, flushSync, leaveAccount, signedIn, syncSoon, syncTimer, userId } from './gate.js';
import { live } from './live.js';
import { openDanger, sayDangerNote } from './danger.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { screenText } from '../wordfilter.js';
import { buildBooster, renderCreator, renderPacks } from './packs.js';
import { applyMatureLock, matureRow, noNsfwRow } from './mature.js';
import { frameStage, frameStyle, pickFrameStyle, updateBadges, wearBadge } from './regalia.js';
import { renderShop } from './shop.js';
import { openAvatarPicker, paintAvatarInto, settlePresence } from './social.js';
import { askNotify, inWrapper, notifyState } from './notify.js';
import { isPc } from '../pc/mode.js';
import { BOOSTER_LOOKS, OPENINGS } from '../data/looks.js';
import { wearLook, wearOpening, wornLook, wornOpening } from '../cosmetics.js';
import { lookTile, openingTile } from './openpreview.js';
import { emit } from '../ui/bus.js';
import { customCard, customOwned, renderCustomTheme } from './customtheme.js';

export function settingRow(key, titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="switch row-action" type="button" role="switch"><span class="switch-knob"></span></button>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);

  const button = row.querySelector('.switch');
  const paint = () => {
    const on = Boolean(settings()[key]);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', `${t(titleKey)}: ${on ? t('on') : t('off')}`);
  };
  paint();
  button.addEventListener('click', () => {
    settings()[key] = !settings()[key];
    store.saveProfile(state.profile);
    applySettings();
    paint();
    if (settings()[key] || key !== 'sound') { synth.resume(); synth.playToggle(Boolean(settings()[key])); }
  });
  return row;
}

export function renderSettings() {
  el.settingsTitle.textContent = t('tabSettings');
  el.prefsLabel.textContent = t('prefsTitle');
  el.accountLabel.textContent = t('settingsAccount');
  el.dataLabel.textContent = t('settingsData');

  const language = document.createElement('div');
  language.className = 'row';
  language.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action"></span>`;
  language.querySelector('h4').textContent = t('settingsLanguage');
  language.querySelector('p').textContent = t('settingsLanguageNote');
  language.querySelector('.chip').innerHTML =
    `${iconSvg('lock', { size: 13 })}<span>${LANGUAGES.find((l) => l.id === getLanguage())?.label ?? ''}</span>`;

  el.settingsList.replaceChildren(...[
    settingRow('sound', 'settingsSound', 'settingsSoundNote'),
    sliderRow('volume', 'settingsVolume', 'settingsVolumeNote',
      { preview: () => { synth.resume(); synth.playTap(); } }),
    settingRow('music', 'settingsMusic', 'settingsMusicNote'),
    sliderRow('musicVolume', 'settingsMusicVolume', 'settingsMusicVolumeNote'),
    settingRow('flash', 'settingsFlash', 'settingsFlashNote'),
    settingRow('tilt', 'settingsTilt', 'settingsTiltNote'),
    settingRow('haptics', 'settingsHaptics', 'settingsHapticsNote'),
    settingRow('awake', 'settingsAwake', 'settingsAwakeNote'),
    settingRow('prices', 'settingsPrices', 'settingsPricesNote'),
    settingRow('lowPower', 'settingsLowPower', 'settingsLowPowerNote'),
    settingRow('hints', 'settingsHints', 'settingsHintsNote'),
    settingRow('blurAdult', 'settingsBlurAdult', 'settingsBlurAdultNote'),
    noNsfwRow(() => {
      el.settingsList.querySelector('.mature-row')?.dispatchEvent(new Event('wikster:repaint'));
      renderPacks();
      renderCreator();
    }),
    matureRow(() => { renderCreator(); }),
    settingRow('rarityShapes', 'settingsRarityShapes', 'settingsRarityShapesNote'),
    isPc ? settingRow('spreadOpen', 'settingsSpread', 'settingsSpreadNote') : null,
    settingRow('skipOpening', 'settingsSkipOpening', 'settingsSkipOpeningNote'),
    language
  ].filter(Boolean));

  el.accountList.replaceChildren(...accountRows());
  if (adPrivacyRequired()) {
    const adRow = document.createElement('div');
    adRow.className = 'row';
    adRow.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
      <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
    adRow.querySelector('h4').textContent = t('adsPrivacy');
    adRow.querySelector('p').textContent = t('adsPrivacyNote');
    const adBtn = adRow.querySelector('button');
    adBtn.textContent = t('saveOpen');
    press(adBtn, { sound: null });
    adBtn.addEventListener('click', adPrivacyOptions);
    el.accountList.appendChild(adRow);
  }
  if (window.wiksterSteam?.ready?.() && state.account.session) {
    const steamRow = document.createElement('div');
    steamRow.className = 'row';
    steamRow.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
      <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
    steamRow.querySelector('h4').textContent = t('steamLink');
    steamRow.querySelector('p').textContent = t('steamLinkNote');
    const steamBtn = steamRow.querySelector('button');
    const steamUser = String(state.account.session.user?.user_metadata?.provider ?? '') === 'steam';
    steamBtn.textContent = steamUser ? t('steamLinked') : t('steamLink');
    steamBtn.disabled = steamUser;
    press(steamBtn, { sound: null });
    steamBtn.addEventListener('click', async () => {
      steamBtn.disabled = true;
      try {
        await account.signInWithSteam(await window.wiksterSteam.ticket(), { link: true });
        steamBtn.textContent = t('steamLinked');
        toast(esc(t('steamLinkDone')));
      } catch (error) {
        steamBtn.disabled = false;
        toast(esc(t(account.readableError(error) ?? 'gateSteamFailed')), 'error');
      }
    });
    el.accountList.appendChild(steamRow);
  }

  const transferRow = document.createElement('div');
  transferRow.className = 'row';
  transferRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  transferRow.querySelector('h4').textContent = t('saveTitle');
  transferRow.querySelector('p').textContent = t('saveNote');
  const transferBtn = transferRow.querySelector('button');
  transferBtn.textContent = t('saveOpen');
  press(transferBtn, { sound: null });
  transferBtn.addEventListener('click', openTransfer);

  const wipeRow = document.createElement('div');
  wipeRow.className = 'row';
  wipeRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  wipeRow.querySelector('h4').textContent = t('settingsCardWipe');
  wipeRow.querySelector('p').textContent = t('settingsCardWipeNote');
  const wipeBtn = wipeRow.querySelector('button');
  wipeBtn.textContent = t('settingsCardWipe');
  wipeBtn.dataset.danger = 'cards';
  press(wipeBtn, { sound: null });
  wipeBtn.addEventListener('click', () => openDanger('cards'));

  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  resetRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  resetRow.querySelector('h4').textContent = t('settingsReset');
  resetRow.querySelector('p').textContent = t('settingsResetNote');
  const resetBtn = resetRow.querySelector('button');
  resetBtn.textContent = t('settingsReset');
  resetBtn.dataset.danger = 'all';
  press(resetBtn, { sound: null });
  resetBtn.addEventListener('click', () => openDanger('all'));

  const accountRow = document.createElement('div');
  accountRow.className = 'row';
  accountRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  accountRow.querySelector('h4').textContent = t('settingsDeleteAccount');
  accountRow.querySelector('p').textContent = t('settingsDeleteAccountNote');
  const accountBtn = accountRow.querySelector('button');
  accountBtn.textContent = t('settingsDeleteAccount');
  accountBtn.dataset.danger = 'account';
  press(accountBtn, { sound: null });
  accountBtn.addEventListener('click', () => openDanger('account'));

  const exportRow = settingsRowShell('myDataTitle', 'myDataNote');
  settingsRowButton(exportRow, t('myDataOpen'), (btn) => openMyData(btn));

  const backupsRow = settingsRowShell('backupsTitle', 'backupsNote');
  settingsRowButton(backupsRow, t('backupsOpen'), () => openBackupsSheet());

  el.dataList.replaceChildren(transferRow, ...(signedIn() ? [exportRow, backupsRow] : []), wipeRow, resetRow, ...(signedIn() ? [accountRow] : []));

  el.redeemLabel.textContent = t('redeemTitle');
  el.redeemList.replaceChildren(redeemRow());
  el.aboutLabel.textContent = t('aboutTitle');
  el.aboutList.replaceChildren(...aboutRows());
}

function deviceData() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('wikster.')) continue;
      const raw = localStorage.getItem(key);
      try { out[key] = JSON.parse(raw); } catch { out[key] = raw; }
    }
  } catch {}
  return out;
}

export async function openMyData(button) {
  button.disabled = true;
  let text = '';
  try {
    const server = await account.myData();
    text = JSON.stringify({ server, device: deviceData() }, null, 2);
  } catch (error) {
    toast(esc(describeError(error)), 'error');
    button.disabled = false;
    return;
  }
  button.disabled = false;
  openSheet(t('myDataTitle'), (body) => {
    const intro = document.createElement('p');
    intro.style.marginBottom = '14px';
    intro.textContent = t('myDataIntro', { kb: Math.max(1, Math.round(text.length / 1024)) });
    const save = document.createElement('a');
    save.className = 'btn btn-primary btn-block';
    save.textContent = t('myDataDownload');
    save.download = `wikster-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    save.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-ghost btn-block';
    copy.style.marginTop = '10px';
    copy.textContent = t('myDataCopy');
    press(copy, { sound: null });
    copy.addEventListener('click', async () => {
      const ok = await copyText(text);
      copy.textContent = ok ? t('saveCopied') : t('saveCopyManually');
      if (ok) synth.playCoins(); else synth.playDenied();
    });
    body.append(intro, save, copy);
  });
}

const REDEEM_ERRORS = { UNKNOWN_CODE: 'redeemUnknown', CODE_EXPIRED: 'redeemExpired', CODE_USED_UP: 'redeemUsedUp', ALREADY_CLAIMED: 'redeemUsed' };

async function redeemFromServer(input, status) {
  let res = null;
  try {
    res = await econ('redeem', { code: input.value });
  } catch (error) {
    const key = REDEEM_ERRORS[String(error?.message ?? '')];
    synth.playDenied();
    status.textContent = key ? t(key) : econMessage(error, t);
    status.className = 'find-status is-error';
    return;
  }
  input.value = '';
  synth.playTheme();
  if (res?.code && typeof res.code === 'object') {
    status.textContent = t('redeemDone', { name: codeLook(res.code).name });
    status.className = 'find-status is-ok';
    revealCode(res.code);
    return;
  }
  status.textContent = t('redeemDbDone');
  status.className = 'find-status is-ok';
  renderPacks();
  updateBadges();
  if (res?.friend) openFriendReveal(res.friend);
}

export function openFriendReveal(friend) {
  const themeId = friend.theme ? friendLookId(friend.code) : null;
  const badgeId = friend.badge ? friendLookId(friend.code) : null;
  if (themeId && composedFriend(themeId)) useTheme(themeId);
  if (badgeId) wearBadge(badgeId);
  syncSoon();
  const accent = friend.booster?.accent ?? friend.theme?.accent ?? friend.badge?.color ?? '#64748b';
  openSheet(t('revealTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'reveal is-friend';
    wrap.style.setProperty('--accent', accent);
    wrap.style.setProperty('--accent2', friend.booster?.accent2 ?? '#1e2233');
    wrap.style.setProperty('--light', '#ffffff');
    wrap.innerHTML = `
      <p class="reveal-message" data-friend-message></p>
      <div class="reveal-booster" data-friend-booster hidden>
        <div class="reveal-pack"></div>
        <div class="reveal-copy"><span class="label"></span><h3></h3><p></p></div>
      </div>
      <div class="reveal-copy" data-friend-cards hidden><span class="label reveal-label"></span><ul class="reveal-cards"></ul></div>
      <div class="reveal-grants">
        <div class="reveal-grant" data-theme-grant hidden>
          <span class="reveal-swatch"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
        <div class="reveal-grant" data-badge-grant hidden>
          <span class="reveal-badge"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
      </div>
      <p class="reveal-where"></p>
      <div class="reveal-actions">
        <button class="btn btn-primary" type="button" data-go></button>
        <button class="btn btn-ghost" type="button" data-later></button>
      </div>`;
    wrap.querySelector('[data-friend-message]').textContent = friend.message ?? '';
    if (friend.booster) {
      const spec = friend.spec ?? friendSpec(friend.code, friend.booster, friend.name);
      const box = wrap.querySelector('[data-friend-booster]');
      box.hidden = false;
      box.querySelector('.reveal-pack').appendChild(buildBooster(spec, { size: 'is-small' }));
      box.querySelector('.label').textContent = t('revealBooster');
      box.querySelector('h3').textContent = friend.booster.name;
      box.querySelector('p').textContent = t('friendBoosterTagline', { name: friend.name });
    }
    const keys = Array.isArray(friend.keys) ? friend.keys : [];
    if (keys.length) {
      const list = wrap.querySelector('[data-friend-cards]');
      list.hidden = false;
      list.querySelector('.label').textContent = t('friendRevealCards', { n: keys.length });
      list.querySelector('ul').replaceChildren(...keys.map((key) => {
        const li = document.createElement('li');
        li.textContent = state.collection.entries[key]?.title ?? key;
        return li;
      }));
    }
    if (themeId) {
      const composed = composedFriend(themeId);
      const grant = wrap.querySelector('[data-theme-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-swatch').innerHTML = (composed?.swatch ?? [accent]).map((c) => `<span style="background:${esc(String(c).slice(0, 7))}"></span>`).join('');
      grant.querySelector('.label').textContent = t('revealTheme');
      grant.querySelector('b').textContent = friend.theme.name;
    }
    if (badgeId) {
      const grant = wrap.querySelector('[data-badge-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-badge').innerHTML = badgeSvg(friendBadge(badgeId, friend.badge), 1, 1, { size: 52 });
      grant.querySelector('.label').textContent = t('revealBadge');
      grant.querySelector('b').textContent = friend.badge.name;
    }
    wrap.querySelector('.reveal-where').textContent = friend.booster ? t('revealWhere') : keys.length ? t('friendRevealWhere') : '';
    const go = wrap.querySelector('[data-go]');
    const later = wrap.querySelector('[data-later]');
    go.textContent = friend.booster ? t('revealTake') : t('revealSeeIt');
    later.textContent = t('revealClose');
    press(go, { sound: null });
    press(later, { sound: null });
    go.addEventListener('click', () => {
      live.sheet.hide();
      if (!friend.booster) { showScreen('customize'); renderCustomize(); return; }
      showScreen('packs');
      state.packMode = 'custom';
      live.packsSeg?.select('custom', { silent: true });
      renderPacks();
    });
    later.addEventListener('click', () => live.sheet.hide());
    body.appendChild(wrap);
  });
}

export function redeemRow() {
  const row = document.createElement('div');
  row.className = 'row row-stack';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <form class="redeem-form" autocomplete="off">
      <input class="creator-input" type="text" maxlength="32" spellcheck="false" data-code>
      <button class="btn btn-sm btn-primary" type="submit"></button>
    </form>
    <p class="find-status" role="status" aria-live="polite" data-status></p>`;
  row.querySelector('h4').textContent = t('redeemTitle');
  row.querySelector('p').textContent = t('redeemNote');
  const form = row.querySelector('form');
  const input = row.querySelector('[data-code]');
  const status = row.querySelector('[data-status]');
  const button = row.querySelector('button');
  input.placeholder = t('redeemPlaceholder');
  button.textContent = t('redeemGo');
  press(button, { sound: null });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!normalizeCode(input.value)) return;
    if (!serverEconomy()) {
      synth.playDenied();
      status.textContent = t('redeemSignIn');
      status.className = 'find-status is-error';
      return;
    }
    await redeemFromServer(input, status);
  });
  return row;
}

function revealCode(entry) {
  const theme = entry.theme ? THEMES.find((th) => th.id === entry.theme) ?? null : null;
  if (theme) useTheme(theme.id);
  const badge = codeBadge(entry);
  if (badge) wearBadge(badge.id);
  const frame = entry.frame ? FRAME_STYLES.find((f) => f.id === entry.frame) : null;
  if (frame) pickFrameStyle(frame.id);
  syncSoon();
  renderPacks();
  updateBadges();
  openReveal(entry, { theme, badge });
}

export function openReveal(entry, { theme, badge }) {
  const look = codeLook(entry);
  openSheet(t('revealTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'reveal';
    wrap.style.setProperty('--accent', look.accent);
    wrap.style.setProperty('--accent2', look.accent2);
    wrap.style.setProperty('--light', look.light);
    wrap.innerHTML = `
      <p class="reveal-message"></p>
      <div class="reveal-booster">
        <div class="reveal-pack"></div>
        <div class="reveal-copy"><span class="label"></span><h3></h3><p></p></div>
      </div>
      <div class="reveal-grants">
        <div class="reveal-grant" data-theme-grant hidden>
          <span class="reveal-swatch"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
        <div class="reveal-grant" data-badge-grant hidden>
          <span class="reveal-badge"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
      </div>
      <p class="reveal-where"></p>
      <div class="reveal-actions">
        <button class="btn btn-primary" type="button" data-go></button>
        <button class="btn btn-ghost" type="button" data-later></button>
      </div>`;
    wrap.querySelector('.reveal-message').textContent = tx(entry.message);
    if (entry.regalia) {
      wrap.querySelector('.reveal-booster').remove();
    } else {
      wrap.querySelector('.reveal-pack').appendChild(buildBooster(codeSpec(entry), { size: 'is-small' }));
      wrap.querySelector('.reveal-copy .label').textContent = t('revealBooster');
      wrap.querySelector('.reveal-copy h3').textContent = look.name;
      wrap.querySelector('.reveal-copy p').textContent = look.tagline;
    }
    if (theme) {
      const grant = wrap.querySelector('[data-theme-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-swatch').innerHTML =
        theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('');
      grant.querySelector('.label').textContent = t('revealTheme');
      grant.querySelector('b').textContent = tx(theme.name);
    }
    if (badge) {
      const grant = wrap.querySelector('[data-badge-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-badge').innerHTML = badgeSvg(badge, 1, 1, { size: 52 });
      grant.querySelector('.label').textContent = t('revealBadge');
      grant.querySelector('b').textContent = tx(badge.name);
    }
    wrap.querySelector('.reveal-where').textContent = t('revealWhere');
    const go = wrap.querySelector('[data-go]');
    const later = wrap.querySelector('[data-later]');
    go.textContent = t('revealTake');
    later.textContent = t('revealClose');
    press(go, { sound: null });
    press(later, { sound: null });
    go.textContent = entry.regalia ? t('revealSeeIt') : t('revealTake');
    go.addEventListener('click', () => {
      live.sheet.hide();
      if (entry.regalia) { showScreen('customize'); renderCustomize(); return; }
      showScreen('packs');
      state.packMode = 'custom';
      live.packsSeg?.select('custom', { silent: true });
      renderPacks();
    });
    later.addEventListener('click', () => live.sheet.hide());
    body.appendChild(wrap);
  });
}

export function renderCustomize() {
  el.customizeTitle.textContent = t('tabCustomize');
  el.themeLabel.textContent = t('themeTitle');
  el.identityLabel.textContent = t('identityTitle');

  const doorway = document.createElement('div');
  doorway.className = 'row atelier-door';
  doorway.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
  doorway.querySelector('h4').textContent = t('customizeAtelier');
  doorway.querySelector('p').textContent = t('customizeAtelierNote');
  settingsRowButton(doorway, t('tabAtelier'), () => import('./atelier.js').then((m) => { showScreen('atelier'); m.renderAtelier(); }));
  el.customizeDoor.replaceChildren(doorway);

  const current = storedTheme();
  el.themeGrid.replaceChildren(...THEMES.filter((theme) => themeOwned(theme, current)).map((theme) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `theme-card${theme.id === current ? ' is-on' : ''}`;
    card.dataset.theme = theme.id;
    card.innerHTML = `
      <span class="theme-swatch">${theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
      <h4></h4><p></p>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    card.querySelector('h4').textContent = tx(theme.name);
    card.querySelector('p').textContent = tx(theme.blurb);
    if (theme.code || theme.season) {
      const note = document.createElement('span');
      note.className = 'theme-note';
      note.textContent = t(theme.season ? 'themeSeasonNote' : 'themeLockedNote');
      card.querySelector('p').after(note);
    }
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (theme.id === storedTheme()) return;
      useTheme(theme.id, { announce: true });
      renderCustomize();
      renderPacks();
      renderShop();
      renderBinder();
    });
    return card;
  }));
  for (const id of friendThemeIds(state.profile)) {
    const card = friendThemeCard(id, current);
    if (card) el.themeGrid.appendChild(card);
  }
  if (customOwned()) {
    el.themeGrid.appendChild(customCard(() => { renderCustomize(); renderPacks(); renderShop(); renderBinder(); }));
  }
  renderCustomTheme();

  el.identityList.replaceChildren(...identityRows());

  el.framesLabel.textContent = t('framesTitle');
  const level = state.profile.progress.level ?? 1;
  const tier = frameTier(level);
  el.framesNote.hidden = true;
  const wearing = frameStyle();
  const offered = FRAME_STYLES.filter((style) => style.code ? codeFrameOwned(state.profile, style.id)
    : style.ink ? ownsFrame(state.profile, style.id) : true);
  el.frameStyles.replaceChildren(...offered.map((style) => {
    const open = style.code || style.ink ? true : frameUnlocked(style, level);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `frame-card${style.id === wearing ? ' is-on' : ''}${tier < 1 ? ' is-dim' : ''}${open ? '' : ' is-locked'}`;
    card.dataset.frame = style.id;
    card.innerHTML = `
      <span class="frame-prev"></span>
      <span class="frame-copy"><h4></h4><span class="grade-chip is-small"></span><small></small></span>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    const grade = frameGrade(style);
    card.style.setProperty('--grade', grade.color);
    card.querySelector('.frame-prev').appendChild(frameStage(style.id, { size: 44, width: 3 }));
    card.querySelector('.grade-chip').textContent = tx(grade.name);
    card.querySelector('h4').textContent = tx(style.name);
    card.querySelector('small').textContent = open ? (style.ink ? t('frameFromAtelier') : '') : t('frameLocked', { level: style.minLevel });
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (!open) {
        synth.playDenied();
        toast(esc(t('frameLocked', { level: style.minLevel })), 'error');
        return;
      }
      if (style.id === frameStyle()) return;
      synth.playTap();
      pickFrameStyle(style.id);
      toast(t('frameEquipped', { name: tx(style.name) }));
      renderCustomize();
    });
    return card;
  }));

  renderCardFx();
  renderLookPicks();
}

function friendThemeCard(id, current) {
  const composed = composedFriend(id);
  if (!composed) return null;
  const person = friendDef(codeOfLook(id))?.name ?? '';
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `theme-card is-friend${id === current ? ' is-on' : ''}`;
  card.dataset.theme = id;
  card.innerHTML = `
    <span class="theme-swatch">${composed.swatch.map((c) => `<span style="background:${esc(String(c).slice(0, 7))}"></span>`).join('')}</span>
    <h4></h4><p></p><span class="theme-note"></span>
    <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
  card.querySelector('h4').textContent = composed.name;
  card.querySelector('p').textContent = t('friendThemeBlurb', { name: person });
  card.querySelector('.theme-note').textContent = t('themeLockedNote');
  press(card, { sound: null });
  card.addEventListener('click', () => {
    if (id === storedTheme()) return;
    useTheme(id, { announce: true });
    renderCustomize();
    renderPacks();
    renderShop();
    renderBinder();
  });
  return card;
}

export function themeOwned(theme, current = storedTheme()) {
  if (theme.id === DEFAULT_THEME || theme.id === current) return true;
  if (theme.code) return codeThemeOwned(state.profile, theme.id);
  if (theme.season) return themeUnlocked(state.profile, theme.season);
  return ownsTheme(state.profile, theme.id);
}

export function renderCardFx() {
  el.fxLabel.textContent = t('fxTitle');
  el.fxNote.textContent = t('fxNote');

  el.fxTiers.replaceChildren(...RARITIES.map((rarity) => {
    const styles = fxForRarity(rarity.id).filter((style) => style.id === DEFAULT_FX || ownsFx(state.profile, rarity.id, style.id));
    const row = document.createElement('div');
    row.className = 'fx-tier';
    row.innerHTML = `<div class="fx-tier-head"><span class="fx-tier-name"></span>
      <span class="fx-tier-count tabular"></span></div><div class="fx-chips"></div>`;
    const name = row.querySelector('.fx-tier-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarityText(rarity);
    row.querySelector('.fx-tier-count').textContent = t('fxOwnedStyles', { n: styles.length - 1, total: fxForRarity(rarity.id).length - 1 });

    row.querySelector('.fx-chips').replaceChildren(...styles.map((style) => {
      const worn = (state.cardFx[rarity.id] ?? DEFAULT_FX) === style.id;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `fx-chip${worn ? ' is-on' : ''}`;
      chip.style.setProperty('--rarity', rarity.color);
      chip.innerHTML = `<span class="fx-sample-slot"></span><span class="fx-chip-name"></span><span class="fx-chip-sub"></span>`;
      chip.querySelector('.fx-sample-slot').appendChild(fxSampleCard(rarity, style.id));
      chip.querySelector('.fx-chip-name').textContent = tx(style.name);
      chip.querySelector('.fx-chip-sub').textContent = tx(style.note);
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        if (worn) return;
        synth.playTap();
        wearFx(rarity, style);
        toast(esc(t('fxEquipped', { name: tx(style.name), rarity: tx(rarity.name) })));
        renderCardFx();
      });
      return chip;
    }));
    if (styles.length === 1) {
      const more = document.createElement('span');
      more.className = 'fx-chip is-hint';
      more.innerHTML = `<span class="fx-chip-name"></span><span class="fx-chip-sub"></span>`;
      more.querySelector('.fx-chip-name').textContent = t('fxMoreTitle');
      more.querySelector('.fx-chip-sub').textContent = t('fxMore');
      row.querySelector('.fx-chips').appendChild(more);
    }
    return row;
  }));
}

export function wearFx(rarity, style) {
  if (style.id === DEFAULT_FX) delete state.cardFx[rarity.id];
  else state.cardFx[rarity.id] = style.id;
  store.saveCardFx(state.cardFx);
  if (noteIn(state.profile, 'fxWorn', `${rarity.id}:${style.id}`, 64)) store.saveProfile(state.profile);
  emit('look');
  reportQuest('fx');
  renderBinder();
  import('./cardindex.js').then((m) => m.renderCardIndex());
}

export function settingsRowShell(titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  return row;
}

export function settingsRowButton(row, label, run) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-ghost row-action';
  btn.textContent = label;
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(btn); });
  row.appendChild(btn);
  return btn;
}

export function offlineAccountRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
  row.querySelector('h4').textContent = t('accountOfflineTitle');
  row.querySelector('p').textContent = t('accountOfflineNote');
  return row;
}

export function staleSchemaRow() {
  const row = document.createElement('div');
  row.className = 'row is-warning';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
  row.querySelector('h4').textContent = t('schemaOldTitle');
  row.querySelector('p').textContent = t('schemaOldNote');
  return row;
}

export function identityRows() {
  if (!account.configured) return [offlineAccountRow()];

  const rows = [];
  if (account.socialSchemaReady()) {
    const avatarRow = settingsRowShell('avatarTitle', 'avatarNote');
    const face = document.createElement('span');
    face.className = 'person-mark row-action';
    paintAvatarInto(face, state.account.profile,
      { frame: { style: frameStyle(), tier: frameTier(state.profile.progress.level) } });
    face.style.cursor = 'pointer';
    face.addEventListener('click', () => { synth.playTap(); openAvatarPicker(); });
    avatarRow.appendChild(face);
    rows.push(avatarRow);
  } else {
    rows.push(staleSchemaRow());
  }

  const nameRow = settingsRowShell('usernameTitle', 'usernameNote');
  settingsRowButton(nameRow, t('usernameChange'), () => openUsernameChange());
  rows.push(nameRow);
  if (signedIn()) {
    const blockRow = settingsRowShell('blockedTitle', 'blockedNote');
    settingsRowButton(blockRow, t('blockedOpen'), () => import('./safety.js').then((m) => m.openBlockedList()));
    rows.push(blockRow);
  }
  return rows;
}

export function accountRows() {
  if (!account.configured) return [offlineAccountRow()];

  const who = document.createElement('div');
  who.className = 'row';
  who.dataset.account = 'sync';
  who.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  who.querySelector('h4').textContent = t('accountSyncTitle');
  const syncBtn = who.querySelector('button');
  syncBtn.textContent = t('accountSyncNow');
  press(syncBtn, { sound: null });
  syncBtn.addEventListener('click', () => { synth.playTap(); flushSync(); });

  const out = document.createElement('div');
  out.className = 'row';
  out.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  out.querySelector('h4').textContent =
    t('accountSignedInAs', { name: state.account.profile?.username ?? '' });
  out.querySelector('p').textContent = t('accountSignOutNote');
  const outBtn = out.querySelector('button');
  outBtn.textContent = t('accountSignOut');
  press(outBtn, { sound: null });
  outBtn.addEventListener('click', () => { synth.playTap(); leaveAccount(); });

  paintSyncLine(who);

  if (!account.socialSchemaReady()) return [who, out];

  const visRow = settingsRowShell('visibilityTitle', 'visibilityNote');
  const visOrder = ['public', 'friends', 'private'];
  const visLabel = (v) => t(`visibility_${v}`);
  settingsRowButton(visRow, visLabel(state.account.profile?.visibility ?? 'public'), async (btn) => {
    const current = state.account.profile?.visibility ?? 'public';
    const next = visOrder[(visOrder.indexOf(current) + 1) % visOrder.length];
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { visibility: next });
      state.account.profile.visibility = next;
      btn.textContent = visLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  const presRow = settingsRowShell('presenceTitle', 'presenceNote');
  const presLabel = (v) => (v === 'hidden' ? t('presence_hidden') : t('presence_online'));
  settingsRowButton(presRow, presLabel(state.account.profile?.presence ?? 'online'), async (btn) => {
    const next = (state.account.profile?.presence ?? 'online') === 'online' ? 'hidden' : 'online';
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { presence: next });
      state.account.profile.presence = next;
      settlePresence();
      btn.textContent = presLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  const notifyRow = settingsRowShell('notifyTitle', inWrapper() ? 'notifyNoteWrapper' : 'notifyNoteBrowser');
  const notifyLabel = (s) => t(s === 'on' ? 'notifyOn' : s === 'off' ? 'notifyOff' : s === 'none' ? 'notifyNone' : 'notifyAsk');
  settingsRowButton(notifyRow, notifyLabel(notifyState()), async (btn) => {
    btn.disabled = true;
    const now = await askNotify();
    btn.textContent = notifyLabel(now);
    if (now === 'off') toast(esc(t('notifyRefused')), 'error');
    btn.disabled = false;
  });

  return [who, visRow, presRow, notifyRow, out];
}

export function openUsernameChange() {
  openSheet(t('usernameTitle'), (body) => {
    body.innerHTML = `
      <p class="muted" style="font-size:.86rem;margin-bottom:14px" data-note></p>
      <input class="creator-input" type="text" maxlength="20" data-name
        autocapitalize="off" autocomplete="off" spellcheck="false" />
      <p class="find-status" data-status role="status" style="margin-top:8px"></p>
      <button class="btn btn-primary btn-block" type="button" data-save style="margin-top:12px"></button>`;
    body.querySelector('[data-note]').textContent = t('usernameSheetNote');
    const input = body.querySelector('[data-name]');
    input.value = state.account.profile?.username ?? '';
    const status = body.querySelector('[data-status]');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('usernameSave');
    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!account.USERNAME_RE.test(name)) {
        status.textContent = t('usernameRules');
        status.className = 'find-status is-error';
        return;
      }
      const refused = screenText(name, 'name');
      if (refused) {
        status.textContent = t(`filter_${refused}`);
        status.className = 'find-status is-error';
        return;
      }
      saveBtn.disabled = true;
      status.textContent = t('usernameChecking');
      status.className = 'find-status is-working';
      try {
        const updated = await account.changeUsername(userId(), name);
        if (!updated) {
          status.textContent = t('authNameTaken');
          status.className = 'find-status is-error';
          saveBtn.disabled = false;
          return;
        }
        state.account.profile = updated;
        toast(t('usernameChanged', { name: esc(name) }));
        synth.playResolved();
        live.sheet.hide();
        renderCustomize();
      } catch (error) {
        status.textContent = describeError(error);
        status.className = 'find-status is-error';
        saveBtn.disabled = false;
      }
    });
  });
}

export function paintSyncLine(row) {
  const line = row?.querySelector('p');
  if (!line) return;
  if (state.account.syncing) { line.textContent = t('accountSyncing'); return; }
  if (state.account.failed) { line.textContent = t('accountSyncFailed'); return; }
  if (!state.account.syncedAt) { line.textContent = t('accountSyncNote'); return; }
  const mins = Math.floor((Date.now() - state.account.syncedAt) / 60000);
  line.textContent = t('accountSynced', {
    when: mins < 1 ? t('accountJustNow') : t('accountMinsAgo', { n: mins })
  });
}

export function renderAccountRow() {
  return (paintSyncLine(el.dataList.querySelector('[data-account="sync"]')));
}

export function openTransfer() {
  openSheet(t('saveTitle'), (body) => {
    body.innerHTML = `
      <p style="margin-bottom:16px" data-intro></p>

      <div class="row" style="display:grid;gap:12px">
        <div class="row-copy"><h4 data-out-t></h4><p data-out-n></p></div>
        <textarea class="filter-input no-drag" data-out rows="4" readonly spellcheck="false"
                  style="font-family:ui-monospace,monospace;font-size:.7rem;resize:none"></textarea>
        <button class="btn btn-sm btn-primary" type="button" data-copy></button>
      </div>

      <div class="row" style="display:grid;gap:12px;margin-top:10px">
        <div class="row-copy"><h4 data-in-t></h4><p data-in-n></p></div>
        <textarea class="filter-input no-drag" data-in rows="4" spellcheck="false"
                  style="font-family:ui-monospace,monospace;font-size:.7rem;resize:none"></textarea>
        <p class="muted" style="font-size:.76rem;min-height:1.2em" data-status></p>
        <button class="btn btn-sm btn-ghost" type="button" data-load></button>
      </div>`;

    body.querySelector('[data-intro]').textContent = t('saveIntro');
    body.querySelector('[data-out-t]').textContent = t('saveExport');
    body.querySelector('[data-out-n]').textContent = t('saveExportNote');
    body.querySelector('[data-in-t]').textContent = t('saveImport');
    body.querySelector('[data-in-n]').textContent = t('saveImportNote');

    const out = body.querySelector('[data-out]');
    out.value = exportSave();
    bump(state.profile, 'backups');
    store.saveProfile(state.profile);
    out.addEventListener('focus', () => out.select());

    const copy = body.querySelector('[data-copy]');
    copy.textContent = t('saveCopy');
    press(copy, { sound: null });
    copy.addEventListener('click', async () => {
      const ok = await copyText(out.value);
      copy.textContent = ok ? t('saveCopied') : t('saveCopyManually');
      if (ok) synth.playCoins(); else { out.focus(); out.select(); synth.playDenied(); }
      setTimeout(() => { copy.textContent = t('saveCopy'); }, 2600);
    });

    const input = body.querySelector('[data-in]');
    input.placeholder = t('savePastePlaceholder');
    const status = body.querySelector('[data-status]');
    const load = body.querySelector('[data-load]');
    load.textContent = t('saveLoad');
    press(load, { sound: null });

    let armed = false;
    const paint = () => {
      load.textContent = armed ? t('saveLoadConfirm') : t('saveLoad');
      load.classList.toggle('btn-danger', armed);
      load.classList.toggle('is-armed', armed);
    };

    readText().then((text) => {
      if (text && parseSave(text) && !input.value) {
        input.value = text;
        input.dispatchEvent(new Event('input'));
      }
    });

    input.addEventListener('input', () => {
      armed = false;
      paint();
      const text = input.value.trim();
      if (!text) { status.textContent = ''; status.style.color = ''; return; }
      const summary = describeSave(text);
      if (!summary) {
        status.textContent = t('saveUnreadable');
        status.style.color = 'var(--negative)';
        return;
      }
      status.innerHTML = t('saveFound', {
        cards: summary.cards.toLocaleString(),
        level: summary.level,
        amount: money(summary.wallet)
      });
      status.style.color = 'var(--positive)';
    });

    load.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!describeSave(text)) {
        status.textContent = t('saveUnreadable');
        status.style.color = 'var(--negative)';
        synth.playDenied();
        return;
      }
      if (!armed) {
        armed = true;
        paint();
        synth.playArm();
        setTimeout(() => { armed = false; paint(); }, 5000);
        return;
      }
      const before = exportSave();
      if (!importSave(text)) {
        status.textContent = t('saveUnreadable');
        synth.playDenied();
        return;
      }
      if (signedIn() && state.account.profile) {
        clearTimeout(syncTimer);
        status.textContent = t('accountSyncing');
        status.style.color = '';
        try {
          await account.pushSave(userId());
        } catch (error) {
          importSave(before);
          status.textContent = describeError(error);
          status.style.color = 'var(--negative)';
          synth.playDenied();
          return;
        }
      }
      location.reload();
    });
    paint();
  });
}
export function openBackupsSheet() {
  openSheet(t('backupsTitle'), (body) => {
    const list = h('div.press', h('p.empty-note', t('backupsLoading')));
    body.append(h('p.muted', { style: { fontSize: '.8rem', lineHeight: '1.5', marginBottom: '12px' } }, t('backupsIntro')), list);
    account.listBackups(userId()).then((rows) => {
      fill(list, rows.length ? rows.map(backupRow) : h('p.empty-note', t('backupsEmpty')));
    }).catch((error) => {
      fill(list, h('p.empty-note', error?.message === 'BACKUPS_UNSET' ? t('backupsUnset') : describeError(error)));
    });
  });
}

function backupRow(row) {
  const when = new Date(row.at).toLocaleString(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const facts = [];
  if (row.cards !== null && row.cards !== undefined) facts.push(t('backupsCards', { n: row.cards }));
  if (row.coins !== null && row.coins !== undefined) facts.push(h('span', { html: money(row.coins) }));
  if (row.reason === 'erase') facts.push(t('backupsErase'));
  if (row.reason === 'before-restore') facts.push(t('backupsBeforeRestore'));
  const line = h('p');
  facts.forEach((fact, i) => { if (i) line.append(' \u00b7 '); line.append(fact); });

  let armed = false;
  let timer = null;
  const btn = h('button.btn.btn-sm.btn-ghost.row-action', { type: 'button' }, t('backupsRestore'));
  press(btn, { sound: null });
  const paint = () => {
    btn.textContent = armed ? t('backupsRestoreConfirm') : t('backupsRestore');
    btn.classList.toggle('btn-danger', armed);
    btn.classList.toggle('is-armed', armed);
  };
  btn.addEventListener('click', async () => {
    if (!armed) {
      armed = true; paint(); synth.playArm();
      clearTimeout(timer);
      timer = setTimeout(() => { armed = false; paint(); }, 5000);
      return;
    }
    btn.disabled = true;
    btn.textContent = t('backupsRestoring');
    try {
      await account.restoreBackup(userId(), row.id);
      toast(t('backupsRestored'));
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      btn.disabled = false; armed = false; paint();
      synth.playDenied();
      toast(esc(describeError(error)), 'error');
    }
  });
  return h('div.row', [h('div.row-copy', [h('h4', when), line]), btn]);
}

export const wipeEverything = () => openDanger('all');

export const sayWipeNote = sayDangerNote;

export function buzz(ms = 12, strength = Math.min(1, ms / 50)) {
  if (settings().haptics === false) return;
  pulse(ms, strength);
}

export let wakeLock = null;

export async function holdWakeLock() {
  if (settings().awake === false || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen') ?? null;
    wakeLock?.addEventListener?.('release', () => { wakeLock = null; });
  } catch {}
}

export function releaseWakeLock() {
  try { wakeLock?.release?.(); } catch {}
  wakeLock = null;
}

export function applySettings() {
  const s = settings();
  document.documentElement.dataset.lowpower = s.lowPower ? '1' : '0';
  rememberLook({ lp: s.lowPower ? 1 : 0 });
  document.documentElement.dataset.hints = s.hints ? '1' : '0';
  document.documentElement.dataset.prices = s.prices === false ? '0' : '1';
  document.documentElement.dataset.blurAdult = s.blurAdult ? '1' : '0';
  applyMatureLock();
  document.documentElement.dataset.rarityShapes = s.rarityShapes ? '1' : '0';
  if (s.awake === false) releaseWakeLock();
  synth.setMuted(!s.sound);
  synth.setVolume(s.volume ?? 1);
  music.setVolume(s.musicVolume ?? 0.4);
  music.setOn(s.music !== false);
  backdrop.setLowPower(s.lowPower);
}

export function sliderRow(key, titleKey, noteKey, { preview = null } = {}) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <input class="row-slider row-action" type="range" min="0" max="100" step="5">`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  const slider = row.querySelector('input');
  slider.value = String(Math.round((settings()[key] ?? 1) * 100));
  slider.setAttribute('aria-label', t(titleKey));
  slider.addEventListener('input', () => {
    settings()[key] = Number(slider.value) / 100;
    applySettings();
  });
  slider.addEventListener('change', () => {
    store.saveProfile(state.profile);
    preview?.();
  });
  return row;
}

function wearButton(worn, onWear) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-sm atelier-buy${worn ? ' btn-ghost is-owned' : ' btn-primary'}`;
  btn.innerHTML = `<span class="buy-label">${esc(worn ? t('atelierWorn') : t('atelierWear'))}</span>`;
  btn.disabled = worn;
  press(btn, { sound: null });
  btn.addEventListener('click', () => { if (worn) return; synth.playTap(); onWear(); });
  return btn;
}

function moreTile(text) {
  const tile = document.createElement('div');
  tile.className = 'look-tile is-hint';
  const p = document.createElement('p');
  p.textContent = text;
  tile.appendChild(p);
  return tile;
}

export function renderLookPicks() {
  el.looksLabel.textContent = t('looksTitle');
  el.looksNote.textContent = t('looksNote');
  el.openingsLabel.textContent = t('openingsTitle');
  el.openingsNote.textContent = t('openingsNote');
  const look = wornLook();
  const looks = [null, ...BOOSTER_LOOKS.filter((l) => ownsLook(state.profile, l.id))];
  el.lookPicks.replaceChildren(...looks.map((l) => {
    const id = l ? l.id : null;
    const tile = lookTile(l, { button: wearButton(id === look, () => {
      wearLook(id);
      renderPacks();
      toast(esc(t('lookEquipped', { name: l ? tx(l.name) : t('lookClassic') })));
      renderLookPicks();
    }) });
    tile.classList.toggle('is-on', id === look);
    return tile;
  }), ...(looks.length === 1 ? [moreTile(t('looksMore'))] : []));
  const opening = wornOpening();
  const openings = [null, ...OPENINGS.filter((o) => ownsOpening(state.profile, o.id))];
  el.openingPicks.replaceChildren(...openings.map((o) => {
    const id = o ? o.id : null;
    const tile = openingTile(o, { button: wearButton(id === opening, () => {
      wearOpening(id);
      toast(esc(t('openingEquipped', { name: o ? tx(o.name) : t('openingClassic') })));
      renderLookPicks();
    }) });
    tile.classList.toggle('is-on', id === opening);
    return tile;
  }), ...(openings.length === 1 ? [moreTile(t('openingsMore'))] : []));
}
