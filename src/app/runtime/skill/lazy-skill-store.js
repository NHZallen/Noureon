// The skill store (skill-store.js) as the page's main code holds it: the real store is loaded the first time something asks it for the skills in the cloud
// (the "/" list, the Extensions page, a reply that offers skills), so the code that reads and checks a pasted skill stays out of the page's first load.
// Until then there is nothing held: no skills, not loaded.

export function createLazySkillStore(options) {
  let real = null;
  let loading = null;
  const load = () => (loading ||= import('./skill-store.js').then((module) => {
    real = module.createSkillStore(options);
    return real;
  }));
  return {
    cached: () => (real ? real.cached() : []),
    get loaded() { return real ? real.loaded : false; },
    ensure: async () => (await load()).ensure(),
    list: async (listOptions) => (await load()).list(listOptions),
    add: async (text, addOptions) => (await load()).add(text, addOptions),
    addBundle: async (input, addOptions) => (await load()).addBundle(input, addOptions),
    openBundle: async (name) => (await load()).openBundle(name),
    remove: async (name) => (await load()).remove(name)
  };
}
