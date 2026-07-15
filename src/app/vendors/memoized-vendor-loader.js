export function createMemoizedVendorLoader(loadVendor) {
  if (typeof loadVendor !== 'function') {
    throw new TypeError('A vendor loading function is required.');
  }

  let loadPromise;

  return function loadMemoizedVendor() {
    if (loadPromise) return loadPromise;

    loadPromise = Promise.resolve()
      .then(loadVendor)
      .catch((error) => {
        loadPromise = undefined;
        throw error;
      });

    return loadPromise;
  };
}
