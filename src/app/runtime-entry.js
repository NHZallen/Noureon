let productionStartPromise;

// The chat page's shell (shell.js): importing it makes the stores and every feature of the page; startPage() then starts it.
export function loadShell() {
  return import('./runtime/shell/shell.js');
}

/** Loads the shell and starts the page, once. */
export function startRuntimeEntry({
  loadCore = loadShell
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
