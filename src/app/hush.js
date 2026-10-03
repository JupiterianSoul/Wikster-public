const queue = [];
const keyed = new Map();
let held = 0;

export const hushing = () => held > 0;

function flush() {
  const list = [...queue.splice(0), ...keyed.values()];
  keyed.clear();
  for (const fn of list) {
    try { fn(); } catch (error) { console.warn('held feedback', error); }
  }
}

export function hush() {
  held++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held = Math.max(0, held - 1);
    if (!held) flush();
  };
}

export function afterReveal(fn, key = null) {
  if (!held) { fn(); return; }
  if (key) { keyed.delete(key); keyed.set(key, fn); }
  else queue.push(fn);
}
