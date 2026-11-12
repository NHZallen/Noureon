// A temporary test page (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §15): what this browser allows for passkeys. To be deleted.
const out = document.getElementById('out');
const log = (text) => { out.textContent += `${text}\n`; };
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const hex = (buffer) => Array.from(new Uint8Array(buffer)).slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');

log(`Address: ${location.href}`);
log(`Browser: ${navigator.userAgent}`);
log(`Secure context: ${window.isSecureContext}; PublicKeyCredential: ${typeof window.PublicKeyCredential}`);

async function attempt(label, publicKey) {
  const started = performance.now();
  try {
    const created = await navigator.credentials.create({ publicKey });
    const extensions = created.getClientExtensionResults?.() || {};
    const prf = extensions.prf;
    log(`${label}: OK after ${Math.round(performance.now() - started)} ms; id ${hex(created.rawId)}...; extensions ${JSON.stringify({ prf: prf ? { enabled: prf.enabled, hasResults: Boolean(prf.results?.first) } : null })}`);
  } catch (error) {
    log(`${label}: FAILED after ${Math.round(performance.now() - started)} ms; ${error.name}: ${error.message}`);
  }
}

const base = () => ({
  rp: { id: location.hostname, name: 'Noureon probe' },
  user: { id: rand(16), name: 'probe', displayName: 'probe' },
  challenge: rand(32),
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }]
});

document.getElementById('b1').addEventListener('click', () => attempt('1 plain', base()));
document.getElementById('b2').addEventListener('click', () => attempt('2 app options', { ...base(), authenticatorSelection: { residentKey: 'required', userVerification: 'required' } }));
document.getElementById('b3').addEventListener('click', () => attempt('3 with PRF', {
  ...base(), authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, extensions: { prf: { eval: { first: rand(32) } } }
}));
document.getElementById('b4').addEventListener('click', async () => {
  try {
    const capabilities = window.PublicKeyCredential?.getClientCapabilities ? await window.PublicKeyCredential.getClientCapabilities() : 'getClientCapabilities is not there';
    const platform = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable ? await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() : 'unknown';
    log(`4: platform authenticator ${platform}; capabilities ${JSON.stringify(capabilities)}`);
  } catch (error) {
    log(`4: FAILED ${error.name}: ${error.message}`);
  }
});
