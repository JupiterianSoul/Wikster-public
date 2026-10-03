const closedError = (e) => /has been closed|Target closed|Target page/i.test(String(e?.message ?? e));

export function guardRoutes(page) {
  if (page.__routesGuarded) return;
  page.__routesGuarded = true;
  const route = page.route.bind(page);
  page.route = (url, handler, options) => route(url, async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (!closedError(error)) throw error;
    }
  }, options);
}

if (!globalThis.__closedGuard) {
  globalThis.__closedGuard = true;
  process.on('unhandledRejection', (error) => {
    if (closedError(error)) return;
    throw error;
  });
}
