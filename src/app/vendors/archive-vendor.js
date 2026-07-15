import { createMemoizedVendorLoader } from './memoized-vendor-loader.js';

export const loadArchiveVendor = createMemoizedVendorLoader(async () => {
  const module = await import('jszip');
  const JSZip = module.default;

  if (typeof JSZip !== 'function') {
    throw new TypeError('JSZip did not expose a usable constructor.');
  }

  return JSZip;
});
