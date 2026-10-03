export const optionIn = (page, value) => page.locator(`.wk-drop:not(.is-leaving) [role="option"][data-value=${JSON.stringify(String(value))}]`);

export async function pickOption(page, target, value) {
  const host = typeof target === 'string' ? page.locator(target) : target;
  await host.click();
  const option = optionIn(page, value);
  await option.waitFor({ state: 'visible', timeout: 5000 });
  await option.click();
  await page.waitForFunction(() => !document.querySelector('.wk-drop:not(.is-leaving)'), null, { timeout: 5000 });
}

export function dropdownAudit() {
  const parse = (text) => {
    const m = String(text).trim().match(/^rgba?\(([^)]*)\)$/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const groundOf = (el) => {
    const chain = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.push(n);
    let ground = { r: 0, g: 0, b: 0, a: 1 };
    for (const n of [document.documentElement, document.body]) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) ground = over(bg, ground);
    }
    for (const n of chain.reverse()) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) ground = over(bg, ground);
    }
    return ground;
  };
  const issues = [];
  const layer = document.querySelector('.wk-drop:not(.is-leaving)');
  if (!layer) return { issues: ['no dropdown is open'], rows: 0, worst: null };
  const panel = layer.querySelector('.wk-drop-panel');
  const r = panel.getBoundingClientRect();
  if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) {
    issues.push(`the open list runs off the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} of ${innerWidth}x${innerHeight})`);
  }
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 30));
  if (!top || !panel.contains(top)) issues.push(`something covers the open list (${top?.className || top?.tagName})`);
  const list = panel.querySelector('.wk-drop-list');
  if (list.scrollHeight > list.clientHeight + 2 && !/auto|scroll/.test(getComputedStyle(list).overflowY)) issues.push('a long list does not scroll');
  const rows = [...panel.querySelectorAll('[role="option"]')].filter((n) => n.checkVisibility());
  if (!rows.length) issues.push('the open list has no options');
  const seen = [];
  for (const row of rows) {
    const name = row.querySelector('.wk-drop-name');
    const fg = parse(getComputedStyle(name).color);
    if (!fg) continue;
    const ground = groundOf(name);
    const value = ratio(over(fg, ground), ground);
    seen.push(value);
    if (value < 4.5) issues.push(`"${name.textContent.slice(0, 24)}"${row.classList.contains('is-on') ? ' (chosen)' : ''}${row.classList.contains('is-active') ? ' (focused)' : ''} reads at ${value.toFixed(2)}:1`);
  }
  if (!rows.some((n) => n.getAttribute('aria-selected') === 'true')) issues.push('no option is marked as chosen');
  const host = document.querySelector('wk-select[aria-expanded="true"]');
  if (!host) issues.push('the trigger does not say it is expanded');
  else if (host.getAttribute('aria-controls') !== list.id) issues.push('the trigger does not point at its list');
  if (list.getAttribute('role') !== 'listbox') issues.push('the list is not a listbox');
  return { issues, rows: rows.length, worst: seen.length ? Math.min(...seen) : null };
}
