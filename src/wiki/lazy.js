let loading = null;

export const loadWiki = () => (loading ??= import('../wiki.js').catch((error) => { loading = null; throw error; }));

export const drawArticles = (...args) => loadWiki().then((m) => m.drawArticles(...args));
export const fetchTopRead = (...args) => loadWiki().then((m) => m.fetchTopRead(...args));
export const fetchViewsFor = (...args) => loadWiki().then((m) => m.fetchViewsFor(...args));
export const refreshTitleCard = (...args) => loadWiki().then((m) => m.refreshTitleCard(...args));
export const translateCard = (...args) => loadWiki().then((m) => m.translateCard(...args));
export const repairCard = (...args) => loadWiki().then((m) => m.repairCard(...args));
export const findWikis = (...args) => import('./finder.js').then((m) => m.findWikis(...args));
