import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { h, fill } from '../ui/dom.js';
import { Pager, fitGrid, observeSize, pageKeys, rem, wheelPager } from './kit.js';

export class Book {
  constructor({ make, blank = null, onTurn = null } = {}) {
    this.items = [];
    this.make = make;
    this.blank = blank;
    this.onTurn = onTurn;
    this.slots = 0;
    this.layout = { cols: 3, rows: 2, w: 180 };
    this.pages = [h('div.pck-page-grid'), h('div.pck-page-grid')];
    this.folios = [h('span.pck-folio'), h('span.pck-folio')];
    this.book = h('div.pck-book',
      h('div.pck-page.is-left', this.pages[0], this.folios[0]),
      h('div.pck-spine'),
      h('div.pck-page.is-right', this.pages[1], this.folios[1]));
    this.pager = new Pager({ onChange: (page, dir) => this.paint(dir) });
    const turn = (dir) => {
      const btn = h('button.pck-turn', { type: 'button', 'aria-label': t(dir < 0 ? 'pcPrevPage' : 'pcNextPage'), dataset: { dir: String(dir) } },
        h('span', { html: iconSvg(dir < 0 ? 'chevronLeft' : 'chevronRight', { size: 30 }) }));
      btn.addEventListener('click', () => this.pager.go(this.pager.page + dir, true));
      return btn;
    };
    this.prev = turn(-1);
    this.next = turn(1);
    this.node = h('div.pck-book-wrap', this.prev, this.book, this.next);
    wheelPager(this.book, this.pager);
    observeSize(this.book, () => { this.measure(); this.paint(0); });
  }

  measure() {
    const box = this.pages[0].getBoundingClientRect();
    if (!box.width) return;
    const unit = rem();
    this.layout = fitGrid(box, { aspect: 1.4, extra: 0, gap: 1 * unit, minW: 8 * unit, maxW: 15 * unit, target: 13.5 * unit, maxRows: 3 });
  }

  get perPage() { return Math.max(1, this.layout.cols * this.layout.rows); }

  get perSpread() { return this.perPage * 2; }

  set(items, { slots = 0, keep = false } = {}) {
    this.items = items;
    this.slots = Math.max(slots, items.length);
    const spreads = Math.max(1, Math.ceil(this.slots / this.perSpread));
    this.pager.set(keep ? this.pager.page : 0, spreads);
    this.paint(0);
  }

  showIndex(i) {
    this.pager.set(Math.floor(i / this.perSpread), this.pager.pages);
    this.paint(0);
  }

  paint(dir = 0) {
    const spreads = Math.max(1, Math.ceil(this.slots / this.perSpread));
    if (this.pager.pages !== spreads || this.pager.page >= spreads) this.pager.set(Math.min(this.pager.page, spreads - 1), spreads);
    const { cols, rows, w } = this.layout;
    const start = this.pager.page * this.perSpread;
    this.pages.forEach((grid, side) => {
      grid.style.setProperty('--cols', String(cols));
      grid.style.setProperty('--rows', String(rows));
      grid.style.setProperty('--card-w', `${w}px`);
      const from = start + side * this.perPage;
      const cells = [];
      for (let i = from; i < from + this.perPage; i++) {
        if (i < this.items.length) cells.push(this.make(this.items[i], i));
        else if (i < this.slots) cells.push(this.blank ? this.blank(i) : h('div.pck-slot', h('span', String(i + 1))));
        else cells.push(h('div.pck-slot.is-void'));
      }
      fill(grid, cells);
      this.folios[side].textContent = String(this.pager.page * 2 + side + 1);
    });
    this.prev.disabled = this.pager.page <= 0;
    this.next.disabled = this.pager.page >= this.pager.pages - 1;
    if (dir) {
      this.book.classList.remove('is-turn-next', 'is-turn-prev');
      void this.book.offsetWidth;
      this.book.classList.add(dir > 0 ? 'is-turn-next' : 'is-turn-prev');
      clearTimeout(this.turnTimer);
      this.turnTimer = setTimeout(() => this.book.classList.remove('is-turn-next', 'is-turn-prev'), 420);
      this.onTurn?.(this.pager.page);
    }
  }

  key(event) {
    if (pageKeys(event, this.pager)) return true;
    if (event.key === 'ArrowRight') { this.pager.go(this.pager.page + 1, true); return true; }
    if (event.key === 'ArrowLeft') { this.pager.go(this.pager.page - 1, true); return true; }
    return false;
  }
}
