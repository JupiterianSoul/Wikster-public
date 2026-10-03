const ASSET = /\.(jpe?g|png|webp|gif|svg|mp3|ogg|wav|woff2?|css)$/i;

export async function resolve(specifier, context, next) {
  if (ASSET.test(specifier)) return { url: `wikster-asset:${specifier}`, shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith('wikster-asset:')) {
    return { format: 'module', source: `export default ${JSON.stringify(url.slice('wikster-asset:'.length))};`, shortCircuit: true };
  }
  return next(url, context);
}
