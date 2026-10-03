const PREFIX = 'wikster.memo.';
const mem = new Map();

const slot = (name, owner) => `${name}:${owner ?? ''}`;

export function recall(name, owner) {
  const id = slot(name, owner);
  if (mem.has(id)) return mem.get(id);
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + name) ?? 'null');
    if (raw && raw.owner === (owner ?? null)) {
      mem.set(id, raw.value);
      return raw.value;
    }
  } catch {}
  return undefined;
}

export function remember(name, owner, value, { disk = true } = {}) {
  mem.set(slot(name, owner), value);
  if (!disk) return;
  try { localStorage.setItem(PREFIX + name, JSON.stringify({ owner: owner ?? null, value })); } catch {}
}
