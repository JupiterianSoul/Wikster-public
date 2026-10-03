import '../styles/pc-layer.css';
import './home.js';
import './boosters.js';
import './custom.js';
import './free.js';
import './collection.js';
import './albums.js';
import './classic.js';
import './selling.js';
import './shop.js';
import { mountPc, refreshPrompts } from './shell.js';
import { initGamepad, onPadMode } from './gamepad.js';
import { watchGamePrompts } from './gamekeys.js';

export function startPc() {
  const pc = mountPc();
  initGamepad();
  onPadMode(() => refreshPrompts());
  watchGamePrompts(refreshPrompts);
  return pc;
}
