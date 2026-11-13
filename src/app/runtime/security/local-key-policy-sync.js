// Makes the protection of the keys follow the account (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §26). The choice ({ on, days }, security/local-key-policy.js) is a setting, so it goes
// to the cloud with the other settings and every device sees it; what a device does about it is its own, because the keys it keeps are sealed on that device (security/local-key-protection.js):
//   - the person changes the protection on this device (the settings card; the event "noureon:local-keys-changed"): the choice is written to the settings;
//   - the settings change from another device (or this one has just started): this device does what they say, as soon as it can. Turning the protection on or off re-seals the keys,
//     which needs the sync vault open, so with it locked this waits for the unlock and nothing else happens (the keys stay as they were, nothing is lost).
// Nothing chosen in the settings yet and this device has the protection on (it was turned on before the choice was kept in the settings): this device's choice becomes the first one.
// The most recent change wins on every device (the settings merge key by key with a time stamp: data/settings-merge.js).

import { DEFAULT_REAUTH_DAYS, normalizeLocalKeyPolicy } from './local-key-policy.js';

const SETTLE_MS = 400;
const ARRIVED = ['astra:cloud-config', 'astra:cloud-workspace-committed', 'astra:sync-vault-unlocked'];

/**
 * protection: the object of security/local-key-protection.js. settings: { getConfig(), update(patch), save() } (services.js, SERVICES.settingsAccess), or a function that returns it
 * (it is there a little after the sync starts). canTurnOn(): whether this device may turn the protection on by what the settings say (the account has a sync password and a passkey).
 * isUnlocked(): whether the sync vault is open. Returns { reconcile, publish, destroy }.
 */
export function startLocalKeyPolicySync({ window, protection, settings, canTurnOn = async () => true, isUnlocked = () => true, warn = (...args) => console.warn(...args) }) {
  const access = () => (typeof settings === 'function' ? settings() : settings);
  const wanted = () => normalizeLocalKeyPolicy(access()?.getConfig?.()?.localKeyProtection);
  let timer = null;
  let running = false;
  let again = false;
  let stopped = false;

  /** What this device does is written to the settings (nothing is written when they say the same). */
  function publish() {
    const settingsAccess = access();
    if (!settingsAccess) return false;
    const own = protection.protection();
    const current = wanted();
    if (!own && !current) return false;
    const next = own ? { on: true, days: own.days } : { on: false, days: current?.days ?? DEFAULT_REAUTH_DAYS };
    if (current && current.on === next.on && current.days === next.days) return false;
    settingsAccess.update({ localKeyProtection: next });
    void Promise.resolve().then(() => settingsAccess.save()).catch(() => { /* kept with the next save of the settings */ });
    return true;
  }

  /** This device does what the settings say. Returns what it did: 'enabled', 'disabled', 'days', 'published', or '' (nothing to do, or it has to wait). */
  async function applyWanted() {
    if (!access()) return '';
    const want = wanted();
    const own = protection.protection();
    if (!want) return own && publish() ? 'published' : '';
    if (want.on === Boolean(own) && (!own || own.days === want.days)) return '';
    if (!await protection.hasVault()) return '';
    if (want.on && !own) {
      if (!isUnlocked() || !await canTurnOn()) return '';
      await protection.enable({ days: want.days });
      return 'enabled';
    }
    if (!want.on && own) {
      if (!isUnlocked()) return '';
      await protection.disable();
      return 'disabled';
    }
    await protection.setDays(want.days);
    return 'days';
  }

  async function reconcile() {
    if (running) { again = true; return ''; }
    running = true;
    let done = '';
    try {
      done = await applyWanted();
    } catch (error) {
      warn('The protection of the keys could not follow the settings.', error);
    } finally {
      running = false;
    }
    if (again && !stopped) { again = false; return reconcile(); }
    return done;
  }

  const later = () => {
    if (stopped) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = null; void reconcile(); }, SETTLE_MS);
  };
  const onLocalChange = () => { publish(); };

  window.addEventListener('noureon:local-keys-changed', onLocalChange);
  for (const name of ARRIVED) window.addEventListener(name, later);
  later();

  return {
    reconcile,
    publish,
    destroy() {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('noureon:local-keys-changed', onLocalChange);
      for (const name of ARRIVED) window.removeEventListener(name, later);
    }
  };
}
