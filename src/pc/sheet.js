let frame = 0;

function fit() {
  frame = 0;
  const sheet = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  if (!sheet || !body) return;
  const card = body.querySelector(':scope > .giant-card');
  sheet.classList.toggle('is-card-view', Boolean(card));
  if (!card || sheet.hidden) return;
  const panel = sheet.querySelector('.sheet-panel');
  const head = sheet.querySelector('.sheet-head');
  const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0;
  const room = innerHeight * 0.94 - (head?.offsetHeight ?? 0) - pad - 8;
  let lo = 200;
  let hi = Math.max(lo, Math.min(innerWidth * 0.9, room * 0.9));
  const fits = (w) => {
    card.style.width = `${w}px`;
    return card.offsetHeight <= room;
  };
  if (fits(hi)) lo = hi;
  else {
    while (hi - lo > 2) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  }
  const width = lo;
  card.style.width = `${width}px`;
  panel?.style.setProperty('--card-fit', `${Math.round(width)}px`);
}

export function refitSheet() {
  if (!frame) frame = requestAnimationFrame(fit);
}

export function watchSheet() {
  const body = document.getElementById('sheet-body');
  const sheet = document.getElementById('sheet');
  if (!body || !sheet) return;
  new MutationObserver(refitSheet).observe(body, { childList: true, subtree: true, characterData: true });
  new MutationObserver(refitSheet).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', refitSheet);
  document.fonts?.ready?.then(refitSheet);
}
