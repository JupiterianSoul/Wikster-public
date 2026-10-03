import { Scene } from './scene.js';

const CALLS = new Set(['setTheme', 'setLowPower', 'markBusy', 'setPaused', 'start', 'stop']);
const scene = new Scene();

self.addEventListener('message', ({ data }) => {
  if (data.type === 'mount') scene.mount(data.canvas, data.view);
  else if (data.type === 'resize') scene.resizeTo(data.view);
  else if (data.type === 'hidden') scene.setHidden(data.hidden);
  else if (data.type === 'call' && CALLS.has(data.name)) scene[data.name](...data.args);
  else if (data.type === 'snapshot') {
    const image = scene.snapshot();
    self.postMessage({ type: 'snapshot', id: data.id, width: image?.width ?? 0, height: image?.height ?? 0, data: image?.data ?? null });
  }
});
