let productionStartPromise;

// The chat page's shell (legacy-core.js): importing it makes the stores and every feature of the page; startPage() then starts it.
export function loadLegacyCore() {
  return import('./runtime/legacy-core/legacy-core.js');
}

/** Loads the shell and starts the page, once. */
export function startRuntimeEntry({
  loadCore = loadLegacyCore
} = {}) {
  if (productionStartPromise) return productionStartPromise;

  productionStartPromise = Promise.resolve()
    .then(() => loadCore())
    .then((core) => {
      if (typeof core?.startPage !== 'function') throw new TypeError('The legacy core must provide startPage.');
      return core.startPage();
    });

  return productionStartPromise;
}
