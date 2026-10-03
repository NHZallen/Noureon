// The pages a reply met, each with the number the answer cites it by ([3]). Pages come from several places in a reply (each
// search, each page opened, the provider's own search); this adds a batch to what is known, once per page, and gives a number
// to the ones that came without one (the provider's own search gives none): after the others, once per address.
// Used by the reply in the browser (single-model-response-lifecycle.js) and by the one the server runs.

/** The known pages with `found` added (a page that was found and then read is both, so each is kept once as found and once as read). */
export function addNumberedSources(known, found) {
  const have = new Set(known.map((source) => `${Boolean(source.read)} ${source.url}`));
  const fresh = (Array.isArray(found) ? found : []).filter((source) => source?.url && !have.has(`${Boolean(source.read)} ${source.url}`));
  const all = [...known, ...fresh];
  let highest = all.reduce((most, source) => Math.max(most, Number(source.n) || 0), 0);
  const numbers = new Map(all.filter((source) => Number(source.n) > 0).map((source) => [source.url, Number(source.n)]));
  return all.map((source) => {
    if (Number(source.n) > 0) return source;
    if (!numbers.has(source.url)) numbers.set(source.url, (highest += 1));
    return { ...source, n: numbers.get(source.url) };
  });
}
