import { t } from '../i18n.js';
import { h, fill } from '../ui/dom.js';
import { renderSellingInto, sellingKeys, sellingPending } from '../app/selling.js';
import { collectionStamp } from '../collection.js';
import { state } from '../app/core.js';
import { registerView } from './shell.js';
import { keeper } from './kit.js';

const view = { node: h('section.pc-view.pcsell'), root: h('div.selling.is-pc'), head: h('header.pcsell-head'), mount: null };
const keep = keeper(() => `${collectionStamp()}|${(state.customPacks ?? []).length}`);

registerView('selling', {
  node: view.node,
  screens: ['selling'],
  render() {
    if (!view.root.parentNode) fill(view.node, view.head, view.root);
    fill(view.head, h('h2', t('sellingTitle')), h('p', t('sellingIntro')));
    view.mount = renderSellingInto(view.root, { pc: true });
    keep.mark();
  },
  show() {
    if (!view.mount || sellingPending() || !keep.fresh()) this.render();
  },
  find() { view.mount?.search?.focus(); },
  key(event) {
    if (!view.mount) return;
    if (event.target?.matches?.('input, textarea, select, wk-select') && !['Enter'].includes(event.key)) return;
    if (sellingKeys(view.mount, event)) event.preventDefault();
  },
  prompts: () => [['↑ ↓', t('pcPromptMove')], ['+ −', t('sellPromptStep')], ['Enter', t('sellGo')]]
});
