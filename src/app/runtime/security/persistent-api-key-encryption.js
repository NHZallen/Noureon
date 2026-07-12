const LOCAL_ENCRYPTION_CONTEXT = new TextEncoder().encode('Noureon local API keys v2');

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export async function createPersistentApiKeyEncryptionKey(cryptoImpl = globalThis.crypto) {
  return cryptoImpl.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPersistentApiKeys(apiKeys, key, cryptoImpl = globalThis.crypto) {
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ apiKeys }));
  const ciphertext = await cryptoImpl.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: LOCAL_ENCRYPTION_CONTEXT
  }, key, plaintext);
  return JSON.stringify({
    version: 2,
    algorithm: 'AES-GCM',
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext))
  });
}

export async function decryptPersistentApiKeys(saved, key, cryptoImpl = globalThis.crypto) {
  const envelope = typeof saved === 'string' ? JSON.parse(saved) : saved;
  if (envelope?.version !== 2 || envelope?.algorithm !== 'AES-GCM') {
    throw new Error('Unsupported encrypted API key payload');
  }
  const iv = decodeBase64Url(envelope.iv);
  const ciphertext = decodeBase64Url(envelope.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 131_072) {
    throw new Error('Invalid encrypted API key payload');
  }
  const plaintext = await cryptoImpl.subtle.decrypt({
    name: 'AES-GCM',
    iv,
    additionalData: LOCAL_ENCRYPTION_CONTEXT
  }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!parsed?.apiKeys || typeof parsed.apiKeys !== 'object' || Array.isArray(parsed.apiKeys)) {
    throw new Error('Invalid encrypted API key payload');
  }
  return parsed.apiKeys;
}
