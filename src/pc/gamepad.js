const BUTTONS = {
  0: ['Enter', 'Enter'],
  1: ['Escape', 'Escape'],
  2: [' ', 'Space'],
  3: ['v', 'KeyV'],
  4: ['q', 'KeyQ'],
  5: ['e', 'KeyE'],
  6: ['PageUp', 'PageUp'],
  7: ['PageDown', 'PageDown'],
  9: ['Escape', 'Escape'],
  12: ['ArrowUp', 'ArrowUp'],
  13: ['ArrowDown', 'ArrowDown'],
  14: ['ArrowLeft', 'ArrowLeft'],
  15: ['ArrowRight', 'ArrowRight']
};
const REPEATS = new Set([12, 13, 14, 15, 6, 7]);
const FIRST_REPEAT = 380;
const NEXT_REPEAT = 110;
const DEAD = 0.55;

const GLYPHS = [
  [/^Esc$/i, 'B'],
  [/^Enter$/i, 'A'],
  [/^Space$/i, 'X'],
  [/^Espace$/i, 'X'],
  [/^Entrée$/i, 'A'],
  [/^V$/, 'Y'],
  [/^Q\s*E$/i, 'LB RB'],
  [/^Q$/, 'LB'],
  [/^E$/, 'RB'],
  [/^PgUp\s*PgDn$/i, 'LT RT'],
  [/^[←→\s]+$/, '◀ ▶'],
  [/^[↑↓\s]+$/, '▲ ▼'],
  [/^[←→↑↓\s]+$/, '✚']
];

let padMode = false;
let listeners = [];
const held = new Map();
let frame = 0;

export const usingPad = () => padMode;
export const onPadMode = (fn) => { listeners.push(fn); };

export function padLabel(label) {
  if (!padMode) return label;
  const text = String(label).trim();
  for (const [re, glyph] of GLYPHS) if (re.test(text)) return glyph;
  return label;
}

function setPadMode(on) {
  if (padMode === on) return;
  padMode = on;
  document.documentElement.classList.toggle('is-pad', on);
  for (const kbd of document.querySelectorAll('kbd.pcx-key[data-key]')) kbd.textContent = padLabel(kbd.dataset.key);
  for (const fn of listeners) { try { fn(on); } catch {} }
}

function send(key, code) {
  const target = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement : document;
  const init = { key, code, bubbles: true, cancelable: true, composed: true };
  const down = new KeyboardEvent('keydown', init);
  const handled = !target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  if (!handled && key === 'Enter' && target instanceof HTMLElement && target.matches('button, a, [role="button"], .pcx-card, [tabindex]')) {
    target.click();
  }
}

function stickDirections(pad) {
  const [x = 0, y = 0] = pad.axes;
  const out = new Set();
  if (y < -DEAD) out.add(12);
  if (y > DEAD) out.add(13);
  if (x < -DEAD) out.add(14);
  if (x > DEAD) out.add(15);
  return out;
}

function poll(now) {
  frame = 0;
  const pads = navigator.getGamepads?.() ?? [];
  const pressed = new Set();
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    pad.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.6) pressed.add(i); });
    for (const d of stickDirections(pad)) pressed.add(d);
  }
  for (const i of pressed) {
    const map = BUTTONS[i];
    if (!map) continue;
    const since = held.get(i);
    if (since == null) {
      held.set(i, { at: now, next: now + FIRST_REPEAT });
      setPadMode(true);
      send(...map);
    } else if (REPEATS.has(i) && now >= since.next) {
      since.next = now + NEXT_REPEAT;
      send(...map);
    }
  }
  for (const i of [...held.keys()]) if (!pressed.has(i)) held.delete(i);
  if (pads.some((p) => p?.connected)) frame = requestAnimationFrame(poll);
}

export function initGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  addEventListener('gamepadconnected', () => { if (!frame) frame = requestAnimationFrame(poll); });
  addEventListener('gamepaddisconnected', () => { if (!(navigator.getGamepads() ?? []).some((p) => p?.connected)) setPadMode(false); });
  addEventListener('keydown', (e) => { if (e.isTrusted) setPadMode(false); }, true);
  addEventListener('pointerdown', () => setPadMode(false), true);
  if ((navigator.getGamepads() ?? []).some((p) => p?.connected)) frame = requestAnimationFrame(poll);
}
