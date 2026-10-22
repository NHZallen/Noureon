// Lets Node load the page's modules the way Vite does: `/src/…` means the project's folder, and styles, pictures and `?raw` files are empty modules.
const root = new URL('../../../', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('/src/') || specifier.startsWith('/public/')) return next(new URL(specifier.slice(1), root).href, context);
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (/\.(css|svg|png|jpe?g|webp|woff2?|ttf)(\?.*)?$/.test(url) || /\?(raw|url|inline)/.test(url)) return { format: 'module', shortCircuit: true, source: 'export default ""' };
  const loaded = await next(url, context);
  // Vite fills in `import.meta.env`; here it is a plain object a test may set (globalThis.__IMPORT_META_ENV__).
  if (loaded.format === 'module' && loaded.source && url.startsWith(root.href) && !url.includes('/node_modules/')) {
    const source = String(loaded.source);
    if (source.includes('import.meta.env')) return { ...loaded, source: source.replaceAll('import.meta.env', '(globalThis.__IMPORT_META_ENV__ ??= { DEV: false, PROD: true, MODE: "test" })') };
  }
  return loaded;
}
