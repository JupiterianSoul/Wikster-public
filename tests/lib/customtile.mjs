export function customTileAudit() {
  const issues = [];
  const tiles = [...document.querySelectorAll('.shop-tile.is-sized')].filter((n) => n.checkVisibility());
  for (const tile of tiles) {
    const name = tile.querySelector('.shop-tile-name')?.textContent.trim() || tile.dataset.spec;
    const r = tile.getBoundingClientRect();
    const clips = [];
    for (let n = tile.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/auto|scroll/.test(s.overflowY)) break;
      const paint = /paint|strict|content/.test(s.contain);
      if (s.overflowY !== 'visible' || s.overflowX !== 'visible' || paint) clips.push({ box: n.getBoundingClientRect(), x: paint || s.overflowX !== 'visible', y: paint || s.overflowY !== 'visible' });
    }
    if (getComputedStyle(tile).contentVisibility === 'auto') issues.push(`${name}: the tile clips its own content`);
    for (const part of tile.querySelectorAll('.shop-tile-art, .shop-tile-name, .sizer, .shop-tile-foot .buy, .shop-tile-foot .odds-chip')) {
      if (!part.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        if (!part.matches('.odds-chip')) issues.push(`${name}: ${part.className} is hidden`);
        continue;
      }
      const b = part.getBoundingClientRect();
      if (b.top < r.top - 1 || b.bottom > r.bottom + 1 || b.left < r.left - 1 || b.right > r.right + 1) issues.push(`${name}: ${part.className} spills out of the tile`);
      if (clips.some(({ box: c, x, y }) => (y && (b.top < c.top - 1 || b.bottom > c.bottom + 1)) || (x && (b.left < c.left - 1 || b.right > c.right + 1)))) issues.push(`${name}: ${part.className} is cut off`);
    }
    const label = tile.querySelector('.booster-count')?.textContent ?? '';
    const shown = parseInt(label, 10);
    if (String(shown) !== tile.dataset.cards) issues.push(`${name}: the art says "${label}" but the size is ${tile.dataset.cards}`);
    const prices = [...tile.querySelectorAll('svg.buck')].length;
    if (prices !== 1 || tile.querySelectorAll('.buy-price').length !== 1) issues.push(`${name}: ${prices} prices instead of one`);
    if (String(tile.querySelector('.buy')?.dataset.price) !== String(tile.querySelector('.buy-price')?.textContent.replace(/\D/g, ''))) issues.push(`${name}: the button price is not the total`);
    for (const sizer of tile.querySelectorAll('.sizer')) {
      const mids = [...sizer.children].filter((c) => c.checkVisibility()).map((c) => { const b = c.getBoundingClientRect(); return b.top + b.height / 2; });
      if (mids.length !== 4 || Math.max(...mids) - Math.min(...mids) > 4) issues.push(`${name}: the ${sizer.classList.contains('is-qty') ? 'quantity' : 'size'} stepper is not one row`);
      const label = sizer.querySelector('.sizer-label');
      if (label && label.scrollWidth > label.clientWidth + 1) issues.push(`${name}: the stepper label "${label.textContent}" is cut`);
    }
    const head = tile.querySelector('.shop-tile-head');
    const del = head?.querySelector('.pcc-delete');
    const art = tile.querySelector('.shop-tile-art');
    if (del && art) {
      const a = art.getBoundingClientRect();
      const d = del.getBoundingClientRect();
      if (d.left < a.right && d.right > a.left && d.top < a.bottom && d.bottom > a.top) issues.push(`${name}: the delete button covers the art`);
    }
  }
  return { count: tiles.length, issues };
}
