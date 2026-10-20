// Async stand-ins for the functions of a part of the app loaded the first time one of them is called (so it is not in the startup
// files). `load` resolves to an object with those functions; a failed load is tried again on the next call. `load()` of the result
// loads it ahead.
export function createLazyFunctions(load, names) {
  let loaded = null;
  const get = () => loaded ||= Promise.resolve()
    .then(load)
    .catch((error) => {
      loaded = null;
      throw error;
    });
  const functions = Object.fromEntries(names.map((name) => [name, async (...args) => (await get())[name](...args)]));
  return { ...functions, load: get };
}
