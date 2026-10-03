import * as account from '../account.js';
import { screenText } from '../wordfilter.js';
import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { esc, openSheet, state, toast } from './core.js';
import { live } from './live.js';
import { pushNote } from './drawer.js';
import { describeError, userId } from './gate.js';

export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'threat', 'spam', 'scam', 'cheating', 'name', 'other'];

export const isBlocked = (id) => Boolean(id) && state.blocked.has(id);

export function guardText(text, scope) {
  const why = screenText(text, scope);
  if (!why) return true;
  synth.playDenied();
  toast(esc(t(`filter_${why}`)), 'error');
  account.noteFiltered(scope, text);
  return false;
}

export async function loadBlocks() {
  const rows = await account.myBlocks(userId());
  state.blocked = new Set(rows.map((r) => r.blocked));
  return rows;
}

export async function checkReportsAnswered(given = null) {
  const rows = given ?? await account.reportsAnswered();
  if (!rows?.length) return;
  for (const r of rows) {
    const key = r.status === 'actioned' ? 'reportActioned' : 'reportDismissed';
    pushNote('shield', t(key, { name: r.username || t('friendSomeone') }), 'friends');
  }
  await account.reportsSeen();
}

export function openReport({ kind, ref = null, target = null, name = '' }) {
  openSheet(t('reportTitle', { name }), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'report-sheet';
    const lead = document.createElement('p');
    lead.className = 'muted';
    lead.textContent = t(`reportLead_${kind}`);
    const list = document.createElement('div');
    list.className = 'report-reasons';
    list.setAttribute('role', 'radiogroup');
    let chosen = null;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-primary btn-block';
    go.textContent = t('reportSend');
    go.disabled = true;
    for (const reason of REPORT_REASONS) {
      if (reason === 'name' && kind !== 'player' && kind !== 'guild') continue;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'report-reason';
      opt.setAttribute('role', 'radio');
      opt.setAttribute('aria-checked', 'false');
      opt.textContent = t(`reportReason_${reason}`);
      press(opt, { sound: null });
      opt.addEventListener('click', () => {
        chosen = reason;
        for (const other of list.children) other.setAttribute('aria-checked', String(other === opt));
        go.disabled = false;
        synth.playTap();
      });
      list.appendChild(opt);
    }
    const note = document.createElement('textarea');
    note.className = 'report-note';
    note.maxLength = 500;
    note.rows = 3;
    note.placeholder = t('reportNote');
    const status = document.createElement('p');
    status.className = 'find-status';
    status.setAttribute('role', 'status');
    press(go, { sound: null });
    go.addEventListener('click', async () => {
      if (!chosen) return;
      go.disabled = true;
      try {
        await account.fileReport(kind, ref, target, chosen, note.value.trim());
        synth.playResolved();
        toast(esc(t('reportSent')), 'ok');
        live.sheet.hide();
      } catch (error) {
        go.disabled = false;
        const code = String(error?.message ?? '');
        status.textContent = code === 'TOO_MANY' ? t('reportTooMany')
          : code === 'SAFETY_UNSET' ? t('reportUnavailable') : describeError(error);
        status.className = 'find-status is-error';
        synth.playDenied();
      }
    });
    wrap.append(lead, list, note, go, status);
    body.appendChild(wrap);
  });
}

export function confirmBlock({ id, name }, after = null) {
  openSheet(t('blockTitle', { name }), (body) => {
    const text = document.createElement('p');
    text.textContent = t('blockBody', { name });
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-danger btn-block';
    go.style.marginTop = '14px';
    go.innerHTML = `${iconSvg('block', { size: 16 })}<span style="margin-left:8px">${esc(t('blockGo'))}</span>`;
    press(go, { sound: null });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        await account.blockPlayer(id);
        state.blocked.add(id);
        synth.playResolved();
        toast(esc(t('blockDone', { name })), 'ok');
        live.sheet.hide();
        after?.();
      } catch (error) {
        go.disabled = false;
        toast(esc(String(error?.message) === 'SAFETY_UNSET' ? t('reportUnavailable') : describeError(error)), 'error');
        synth.playDenied();
      }
    });
    body.append(text, go);
  });
}

export async function openBlockedList() {
  const rows = await loadBlocks().catch(() => []);
  const profiles = rows.length ? await account.profilesById(rows.map((r) => r.blocked)).catch(() => []) : [];
  const nameOf = (id) => profiles.find((p) => p.id === id)?.username ?? '?';
  openSheet(t('blockedTitle'), (body) => {
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = t('blockedEmpty');
      body.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'settings-list';
    list.style.padding = '0';
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<div class="row-copy"><h4></h4></div>';
      row.querySelector('h4').textContent = nameOf(r.blocked);
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'btn btn-sm btn-ghost row-action';
      undo.textContent = t('blockedUndo');
      press(undo, { sound: null });
      undo.addEventListener('click', async () => {
        undo.disabled = true;
        try {
          await account.unblockPlayer(r.blocked);
          state.blocked.delete(r.blocked);
          row.remove();
          toast(esc(t('blockedUndone', { name: nameOf(r.blocked) })), 'ok');
        } catch (error) {
          undo.disabled = false;
          toast(esc(describeError(error)), 'error');
        }
      });
      row.appendChild(undo);
      list.appendChild(row);
    }
    body.appendChild(list);
  });
}

export function reportOnHold(node, open) {
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('contextmenu', (event) => { event.preventDefault(); cancel(); open(); });
  node.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    cancel();
    timer = setTimeout(() => { timer = null; navigator.vibrate?.(12); open(); }, 550);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) node.addEventListener(type, cancel);
  node.title = t('reportHold');
}
