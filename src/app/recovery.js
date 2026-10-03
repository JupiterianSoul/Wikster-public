import { t } from '../i18n.js';
import * as account from '../account.js';
import { logoSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { el, toast } from './core.js';
import { endSplash } from './boot.js';
import { describeError, field, gateMessage, gateStatus, holdSessions, onSession, requestReset } from './gate.js';

const MIN_LENGTH = 6;
const PROBLEM_BODY = { expired: 'resetExpiredBody', device: 'resetDeviceBody', offline: 'resetOfflineBody', broken: 'resetBrokenBody' };

function frame(titleKey, body) {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t(titleKey);
  el.gateBody.textContent = body;
  el.gateFoot.textContent = t('resetFoot');
  el.gateSeg.parentElement.hidden = true;
  el.gateSteam.hidden = true;
  el.gate.dataset.flow = 'recovery';
  gateStatus(null);
  el.gate.hidden = false;
}

function button(key) {
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t(key);
  press(submit, { sound: null });
  return submit;
}

async function release(session = null) {
  holdSessions(false);
  delete el.gate.dataset.flow;
  await onSession(session ?? await account.currentSession());
}

export async function landFromEmail() {
  const found = account.takeLanding();
  if (!found) return false;
  holdSessions(true);
  let outcome;
  try {
    outcome = await account.settleLanding(found);
  } catch {
    outcome = { problem: 'broken' };
  }
  if (outcome?.recovery && outcome.session) {
    account.markRecovering(outcome.session.user?.id);
    showNewPassword(outcome.session);
    endSplash();
    return true;
  }
  if (outcome?.problem) {
    showLinkProblem(outcome.problem);
    endSplash();
    return true;
  }
  holdSessions(false);
  if (outcome?.session && found.kind !== 'resume') toast(t('gateEmailConfirmed'));
  return false;
}

export function showNewPassword(session) {
  const email = session?.user?.email ?? '';
  frame('resetTitle', email ? t('resetBody', { email }) : t('resetBodyPlain'));
  const first = field('password', 'resetNew', { type: 'password', icon: 'key', hintKey: 'gatePasswordHint', autocomplete: 'new-password' });
  const second = field('confirm', 'resetConfirm', { type: 'password', icon: 'key', autocomplete: 'new-password' });
  const user = document.createElement('input');
  user.type = 'email';
  user.name = 'username';
  user.autocomplete = 'username';
  user.value = email;
  user.hidden = true;
  el.gateForm.replaceChildren(user, first, second, button('resetSave'));
  el.gateAlt.textContent = t('resetCancel');
  setTimeout(() => el.gateForm.elements.password?.focus(), 60);

  let busy = false;
  el.gateForm.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const password = el.gateForm.elements.password.value;
    const confirm = el.gateForm.elements.confirm.value;
    if (password.length < MIN_LENGTH) { synth.playDenied(); return gateStatus('authWeakPassword', 'error'); }
    if (password !== confirm) { synth.playDenied(); return gateStatus('resetMismatch', 'error'); }
    busy = true;
    gateStatus('gateWorking', 'working');
    try {
      await account.setNewPassword(password);
      account.markRecovering(null);
      gateStatus('resetSaved', 'ok');
      synth.playFanfare();
      toast(t('resetDone'));
      await release();
    } catch (error) {
      synth.playDenied();
      if (account.readableError(error) === 'resetSessionGone') { account.markRecovering(null); showLinkProblem('expired'); return; }
      gateMessage(describeError(error));
    } finally {
      busy = false;
    }
  };
  el.gateAlt.onclick = async () => {
    synth.playTap();
    account.markRecovering(null);
    await account.signOut().catch(() => {});
    await release(null);
  };
}

export function showLinkProblem(kind = 'expired') {
  frame(kind === 'expired' ? 'resetExpiredTitle' : 'resetBrokenTitle', t(PROBLEM_BODY[kind] ?? PROBLEM_BODY.broken));
  el.gateForm.replaceChildren(
    field('email', 'gateEmail', { type: 'email', icon: 'mail', autocomplete: 'email' }),
    button('resetSendAgain')
  );
  el.gateAlt.textContent = t('resetBack');
  el.gateForm.onsubmit = async (event) => {
    event.preventDefault();
    synth.playTap();
    await requestReset(String(el.gateForm.elements.email?.value ?? '').trim());
  };
  el.gateAlt.onclick = async () => {
    synth.playTap();
    await release();
  };
}
