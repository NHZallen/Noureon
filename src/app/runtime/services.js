// The services the parts of the page find each other by, instead of properties of window (each was a global named __astra… before): a part provides
// a service when it is ready, and the others get it when they need it (null until then). One page, one set of services.

export const SERVICES = Object.freeze({
  // The conversation sync of the signed-in account (src/app/sync/cloud-sync-v2.js), or a stand-in that says why it is off.
  cloudSync: 'cloud-sync',
  // The queue of settings, keys and vault changes to sync (src/app/sync/cloud-workspace-sync.js); first the early queue of
  // cloud-sync-bootstrap-queue.js, which hands over to it.
  workspaceSync: 'workspace-sync',
  // A promise of the workspace sync's start (main.js).
  workspaceSyncReady: 'workspace-sync-ready',
  // The files kept in the person's cloud storage: hydrate, externalize (src/app/sync/cloud-assets.js).
  cloudAssets: 'cloud-assets',
  // The sync of the memory summaries (src/app/sync/memory-summary-cloud-sync.js).
  memorySummarySync: 'memory-summary-sync',
  // Called once the page's runtime is up, so the live cloud workspace may be applied (cloud-workspace-live-lifecycle.js).
  cloudRuntimeReady: 'cloud-runtime-ready',
  // The dialog that offers a new version (startup-lifecycle.js), for the service worker and the recovery from a missing chunk.
  showUpdateDialog: 'show-update-dialog'
});

const NAMES = new Set(Object.values(SERVICES));
const services = new Map();

const known = (name) => {
  if (!NAMES.has(name)) throw new TypeError(`Unknown service: ${name}`);
  return name;
};

/** Provides `value` as the service `name` (replacing the one there). Resolves `value`. */
export function provideService(name, value) {
  services.set(known(name), value);
  return value;
}

/** The service `name`, or null when nobody provides it. */
export function getService(name) {
  return services.get(known(name)) ?? null;
}

/** Withdraws the service `name`, only when `value` is still the one provided (a newer one stays). */
export function withdrawService(name, value) {
  if (services.get(known(name)) === value) services.delete(name);
}

// For a support session in the browser's console (`noureonDebug.service('cloud-sync').diagnose()`): the services, read only. It is
// not used by the page itself.
if (typeof globalThis !== 'undefined' && !globalThis.noureonDebug) {
  Object.defineProperty(globalThis, 'noureonDebug', {
    configurable: true,
    value: Object.freeze({ service: (name) => services.get(name) ?? null, names: () => [...services.keys()] })
  });
}
