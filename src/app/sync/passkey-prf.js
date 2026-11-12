// The passkey side of the recovery slots (vault-recovery-slots.js): making a passkey for the sync password's recovery, and asking it for its secret.
// The secret is computed by the passkey itself with the WebAuthn PRF extension from a salt, only when the person confirms (Face ID, Touch ID, a PIN, a
// security key); the server is not involved at all: the challenge is made here and nothing is verified by a server, because the passkey is used as a
// key, not as a sign-in. Everything the browser gives (`navigator`, `crypto`) can be passed in, for tests.

import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from './vault-recovery-slots.js';

const withCode = (error, code) => Object.assign(error, { code });

// What went wrong, as a code the pages show in the person's language. `detail` is the browser's own name for it (NotAllowedError...), kept so a page can show it:
// a browser says "not allowed" for a cancelled sheet, a tap that was too old, and a view that has no passkeys, and only the name tells them apart a little.
// A refusal that comes back at once (the person had no time to touch anything) means the browser would not even show the sheet: an app's own browser view
// (the Google app, Facebook, Instagram...) has no passkeys. A cancelled sheet takes seconds.
const BLOCKED_WITHIN_MS = 300;
const failure = (error, startedAt = 0, now = Date.now()) => {
  if (error?.code && String(error.code).startsWith('passkey-')) return error;
  const detail = error?.name || '';
  const make = (message, code) => Object.assign(new Error(message), { code, detail });
  if (error?.name === 'NotAllowedError' && startedAt && now - startedAt < BLOCKED_WITHIN_MS) return make('The browser did not show the passkey sheet.', 'passkey-blocked');
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') return make('The passkey was not confirmed.', 'passkey-cancelled');
  if (error?.name === 'InvalidStateError') return make('This passkey is already registered.', 'passkey-exists');
  if (error?.name === 'NotSupportedError' || error?.name === 'SecurityError') return make('Passkeys cannot be used here.', 'passkey-unsupported');
  return make(error?.message || 'The passkey failed.', 'passkey-failed');
};

const secretOf = (results) => {
  const value = results?.first;
  if (!value) return null;
  const bytes = new Uint8Array(value instanceof ArrayBuffer ? value : (value.buffer ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value));
  return bytes.length === 32 ? bytes : null;
};

/** The browser views that apps open inside themselves (Google app, Facebook, Instagram, Line, WeChat, Android WebView): they have no passkeys. */
export const isInAppBrowser = (userAgent = '') => /\bGSA\/|FBAN|FBAV|FB_IAB|Instagram|\bLine\/|MicroMessenger|\bwv\)/i.test(String(userAgent));

/**
 * Whether this browser can do it: 'yes' (it says it supports PRF), 'no' (no passkeys, or it says it does not), 'unknown' (passkeys, but the browser
 * cannot say about PRF: the page offers it and a failure is told when it happens).
 */
export async function passkeyPrfAvailability({ pkc = globalThis.PublicKeyCredential, nav = globalThis.navigator } = {}) {
  if (!pkc || !nav?.credentials?.create) return 'no';
  if (isInAppBrowser(nav.userAgent)) return 'in-app';
  try {
    if (typeof pkc.getClientCapabilities === 'function') {
      const capabilities = await pkc.getClientCapabilities();
      if (capabilities && 'extension:prf' in capabilities) return capabilities['extension:prf'] ? 'yes' : 'no';
    }
  } catch { /* the browser cannot tell */ }
  return 'unknown';
}

/**
 * Makes a passkey for the recovery and gets its secret. `rpId`: the site's host. Resolves { credentialId (base64url), prfSalt (base64), secret (32 bytes) }.
 * Some passkeys give the secret as they are made, others only when they are asked again (a second confirmation).
 */
export async function registerRecoveryPasskey({ rpId, userId, userName, excludeCredentialIds = [], nav = globalThis.navigator, cryptoProvider = globalThis.crypto } = {}) {
  const prfSalt = cryptoProvider.getRandomValues(new Uint8Array(32));
  let created;
  const startedAt = Date.now();
  try {
    created = await nav.credentials.create({
      publicKey: {
        rp: { id: rpId, name: 'Noureon' },
        user: { id: userId, name: userName || 'Noureon', displayName: userName || 'Noureon' },
        challenge: cryptoProvider.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: excludeCredentialIds.map((id) => ({ type: 'public-key', id: base64UrlToBytes(id) })),
        extensions: { prf: { eval: { first: prfSalt } } }
      }
    });
  } catch (error) {
    throw failure(error, startedAt);
  }
  if (!created) throw withCode(new Error('No passkey was made.'), 'passkey-failed');
  const extension = created.getClientExtensionResults?.()?.prf;
  if (extension && extension.enabled === false) throw withCode(new Error('This passkey cannot give a secret (no PRF).'), 'passkey-prf-unsupported');
  const credentialId = bytesToBase64Url(new Uint8Array(created.rawId));
  const saltText = bytesToBase64(prfSalt);
  let secret = secretOf(extension?.results);
  if (!secret) secret = await readRecoveryPasskeySecret({ rpId, credentialId, prfSalt: saltText, nav, cryptoProvider });
  return { credentialId, prfSalt: saltText, secret };
}

/** Asks one passkey for its secret (the person confirms). */
export async function readRecoveryPasskeySecret({ rpId, credentialId, prfSalt, nav = globalThis.navigator, cryptoProvider = globalThis.crypto } = {}) {
  const found = await readAnyRecoveryPasskey({ rpId, slots: [{ credentialId, prfSalt }], nav, cryptoProvider });
  return found.secret;
}

/**
 * Asks for any of the passkeys of these slots (the browser lets the person pick one): resolves { slot, secret } for the one that answered.
 * Each passkey is given the salt of its own slot.
 */
export async function readAnyRecoveryPasskey({ rpId, slots, nav = globalThis.navigator, cryptoProvider = globalThis.crypto } = {}) {
  const list = Array.isArray(slots) ? slots.filter((slot) => slot?.credentialId && slot?.prfSalt) : [];
  if (!list.length) throw withCode(new Error('There is no passkey to ask.'), 'passkey-none');
  const evalByCredential = Object.fromEntries(list.map((slot) => [slot.credentialId, { first: base64ToBytes(slot.prfSalt) }]));
  let assertion;
  const startedAt = Date.now();
  try {
    assertion = await nav.credentials.get({
      publicKey: {
        rpId,
        challenge: cryptoProvider.getRandomValues(new Uint8Array(32)),
        allowCredentials: list.map((slot) => ({ type: 'public-key', id: base64UrlToBytes(slot.credentialId) })),
        userVerification: 'required',
        extensions: { prf: { evalByCredential } }
      }
    });
  } catch (error) {
    throw failure(error, startedAt);
  }
  const answered = bytesToBase64Url(new Uint8Array(assertion?.rawId || []));
  const slot = list.find((entry) => entry.credentialId === answered);
  const secret = secretOf(assertion?.getClientExtensionResults?.()?.prf?.results);
  if (!slot) throw withCode(new Error('That passkey is not one of the recovery passkeys.'), 'passkey-unknown');
  if (!secret) throw withCode(new Error('This passkey cannot give a secret (no PRF).'), 'passkey-prf-unsupported');
  return { slot, secret };
}
