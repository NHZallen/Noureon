// The warning in the header that the model of the chat needs an API key, and the send button, are worked out from the keys the page holds. Keys also arrive after the page was
// drawn: from the cloud sync, and when the sync vault is unlocked (the unlock that is remembered gives them at the start). Without this the warning stays on until something
// else redraws it, although the keys are there.

const EVENTS = ['astra:cloud-sensitive-config', 'noureon:keys-settled'];

export function refreshWhenKeysArrive({ window, refresh }) {
  const onKeys = () => {
    try {
      refresh();
    } catch (error) {
      window.console?.warn?.('The header could not follow the keys that arrived.', error);
    }
  };
  // The keys arriving, and the places they come from having all answered (security/keys-settled.js): the box and the warning are worked out again at both.
  for (const name of EVENTS) window?.addEventListener?.(name, onKeys);
  // (What was settled before this started is worked out now.)
  onKeys();
  return () => { for (const name of EVENTS) window?.removeEventListener?.(name, onKeys); };
}
