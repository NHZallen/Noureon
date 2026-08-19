// Single source of truth for the product version.
//
// Keep this in sync with package.json, package-lock.json and the newest entry in
// src/data/update-logs/entries.js. `npm run check:version` fails the build when they drift.
//
// This is the PRODUCT version only. The PWA cache version (public/service-worker.js),
// the memory/sync schema versions (src/app/runtime/memory/, src/app/sync/) and any
// API or protocol versions are managed separately and must not be unified with it.
export const PRODUCT_VERSION = '16.6.4';

globalThis.PRODUCT_VERSION = PRODUCT_VERSION;

export default PRODUCT_VERSION;
