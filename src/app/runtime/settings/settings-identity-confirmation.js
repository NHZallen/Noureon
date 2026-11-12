// "Confirm it is you" before a change that is hard to undo or that someone with a stolen sign-in would make (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §16.4).
// One rule for every such action: with an authenticator app set up, its six digits (the server and the rules of the table check this one, so it is real protection);
// with no authenticator but a passkey, a tap of the passkey (the page checks it, so it keeps off whoever has the unlocked phone, not a stolen sign-in);
// with neither, nothing more. Once confirmed, it is not asked again for ten minutes (the six digits, once confirmed, hold for the whole sign-in).

const WINDOW_MS = 10 * 60 * 1000;

/**
 * `authenticator`: { isSet(), requireAal2() }, `passkeys`: { hasSlots(), openKey() }. Resolves a function: confirmIdentity({ onlyIfSet }) -> true when the action
 * may go on. `onlyIfSet`: for a change that needs no more than the sync password (adding a passkey), only an authenticator that is set up is asked for (the table
 * wants its code for any write), and a passkey is not.
 */
export function createIdentityConfirmation({ authenticator, passkeys, now = () => Date.now() }) {
  let confirmedUntil = 0;
  return async ({ onlyIfSet = false } = {}) => {
    if (!onlyIfSet && now() < confirmedUntil) return true;
    if (await authenticator.isSet()) {
      if (!await authenticator.requireAal2()) return false;
    } else if (!onlyIfSet && await passkeys.hasSlots()) {
      await passkeys.openKey();
    }
    if (!onlyIfSet) confirmedUntil = now() + WINDOW_MS;
    return true;
  };
}
