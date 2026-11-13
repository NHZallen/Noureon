// Whether the API keys of this visit have had their chance to arrive. The keys are read from this device, and for a cloud account they may also come from the cloud
// (the sync, the unlock of the vault that is remembered), a moment after the page is drawn. A box that says "enter an API key" and a warning in the header drawn before that would
// flash and go for a person whose keys are there, so they wait until the places the keys can come from have answered. A person who really has no key is told as soon as
// they have: the local read is done at once for a local account, and the sync of a cloud account tells when it is ready (the wait ends in any case after `giveUpMs`).
// Keeps no keys: only what has answered.

// Before the visit begins (the page draws its box and header first) nothing has answered yet. A page with no signed-in person never begins one, and has no keys to warn about.
const state = { local: false, cloudExpected: false, cloud: false, forced: false };
let timer = null;
let listening = false;

export const keysSettled = () => state.forced || (state.local && (!state.cloudExpected || state.cloud));

const change = (update) => {
  const before = keysSettled();
  update();
  if (!before && keysSettled()) globalThis.window?.dispatchEvent?.(new globalThis.CustomEvent('noureon:keys-settled'));
};

/** A visit begins (a person signed in): nothing has answered yet. `cloud`: the account is a cloud one, so the sync may bring keys. */
export function beginKeysSettling({ cloud = false, giveUpMs = 8000 } = {}) {
  clearTimeout(timer);
  Object.assign(state, { local: false, cloudExpected: cloud, cloud: false, forced: false });
  if (!listening) {
    listening = true;
    globalThis.window?.addEventListener?.('astra:cloud-sensitive-config', () => keysCloudAnswered());
  }
  // Whatever fails or never answers, the wait ends: a person with no key is told in the end.
  timer = setTimeout(() => change(() => { state.forced = true; }), giveUpMs);
  timer.unref?.();
}

/** The keys of this device were read (there may be none). */
export const keysLocalRead = () => change(() => { state.local = true; });

/** The sync of the cloud account is ready, or keys arrived from it. */
export const keysCloudAnswered = () => change(() => { state.cloud = true; });
