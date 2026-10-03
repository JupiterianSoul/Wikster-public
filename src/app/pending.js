import { t } from '../i18n.js';
import { synth } from '../ui/sound.js';
import { esc, toast } from './core.js';

export const SLOW_MS = 10000;

const running = new Map();

export const isRunning = (key) => running.has(key);

function mark(button, on) {
  if (!button) return;
  button.classList.toggle('is-pending', on);
  if (on) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

export function stillSending() {
  toast(esc(t('stillSending')), 'info');
}

export function keepPending(key, button) {
  const job = running.get(key);
  if (!job || !button) return;
  job.button = button;
  mark(button, !job.slow);
}

export async function pending(key, button, task, { slow = SLOW_MS } = {}) {
  if (running.has(key)) {
    stillSending();
    synth.playDenied();
    return undefined;
  }
  const job = { button, slow: false };
  running.set(key, job);
  mark(button, true);
  const timer = setTimeout(() => {
    job.slow = true;
    mark(job.button, false);
    stillSending();
  }, slow);
  try {
    return await task();
  } finally {
    clearTimeout(timer);
    if (running.get(key) === job) running.delete(key);
    mark(job.button, false);
  }
}
