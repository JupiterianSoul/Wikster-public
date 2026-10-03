const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name)?.delete(fn);
}

export function once(name, fn) {
  const off = on(name, (detail) => { off(); fn(detail); });
  return off;
}

export function emit(name, detail) {
  for (const fn of [...(listeners.get(name) ?? [])]) {
    try { fn(detail); } catch (error) { console.error(`bus: a listener for "${name}" threw`, error); }
  }
}
