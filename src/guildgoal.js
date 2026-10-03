import * as account from './account.js';
import { emit } from './ui/bus.js';

const FLUSH_MS = 2500;

const KIND_OF = {
  open: () => 'open',
  pull: (detail) => (detail?.isNew ? 'new' : null),
  wikdle: (detail) => (detail?.won ? 'wikdle' : null)
};

const pending = new Map();
let timer = null;
let inGuild = () => false;

export function guildGoalSetup(isInGuild) {
  inGuild = isInGuild;
}

export function reportGuildGoal(metric, detail = {}) {
  const kind = KIND_OF[metric]?.(detail);
  if (!kind || !inGuild()) return;
  pending.set(kind, (pending.get(kind) ?? 0) + 1);
  clearTimeout(timer);
  timer = setTimeout(() => { flushGuildGoal().catch(() => {}); }, FLUSH_MS);
}

export async function flushGuildGoal() {
  clearTimeout(timer);
  timer = null;
  if (!pending.size || !inGuild()) { pending.clear(); return; }
  const batch = [...pending.entries()];
  pending.clear();
  let moved = false;
  for (const [kind, amount] of batch) {
    try { await account.guildGoalAdd(kind, amount); moved = true; } catch {
      pending.set(kind, (pending.get(kind) ?? 0) + amount);
    }
  }
  if (moved) emit('guild-goal', {});
}
