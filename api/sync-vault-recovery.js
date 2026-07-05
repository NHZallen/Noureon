import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const config = {
  api: { bodyParser: { sizeLimit: '64kb' } }
};

const parseBody = (body) => {
  if (typeof body === 'string') return JSON.parse(body || '{}');
  return body && typeof body === 'object' ? { ...body } : {};
};

const getServerConfig = () => ({
  supabaseUrl: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim(),
  publishableKey: (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim(),
  recoveryKey: (process.env.SYNC_VAULT_RECOVERY_KEY || '').trim()
});

const readRecoveryKey = (encodedKey) => {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('SYNC_VAULT_RECOVERY_KEY must be a base64-encoded 32-byte key');
  return key;
};

export function encryptRecoveryPayload(payload, encodedKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', readRecoveryKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

export function decryptRecoveryPayload(payload, encodedKey) {
  if (!payload || payload.version !== 1 || payload.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported recovery payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    readRecoveryKey(encodedKey),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function authenticateUser({ token, supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

function hasFreshEmailVerification(token, now = Date.now()) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const recent = Number(payload.iat) * 1000 >= now - (10 * 60 * 1000);
    const methods = Array.isArray(payload.amr) ? payload.amr.map(entry => entry?.method) : [];
    return recent && methods.some(method => method === 'otp' || method === 'magiclink');
  } catch {
    return false;
  }
}

async function readStoredRecovery({ userId, token, supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const url = new URL(`${supabaseUrl}/rest/v1/user_vault_recovery`);
  url.searchParams.set('select', 'recovery_payload');
  url.searchParams.set('user_id', `eq.${userId}`);
  const response = await fetchImpl(url, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Recovery lookup failed with HTTP ${response.status}`);
  return (await response.json())?.[0]?.recovery_payload || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const serverConfig = getServerConfig();
  if (!serverConfig.supabaseUrl || !serverConfig.publishableKey || !serverConfig.recoveryKey) {
    res.status(503).json({ error: 'Sync vault recovery is not configured' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await authenticateUser({ token, ...serverConfig });
    if (!user?.id) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const body = parseBody(req.body);
    if (body.action === 'store') {
      if (typeof body.password !== 'string' || body.password.length < 10 || !body.record) {
        res.status(400).json({ error: 'A valid password and vault record are required' });
        return;
      }
      const recoveryPayload = encryptRecoveryPayload({ password: body.password, record: body.record }, serverConfig.recoveryKey);
      const response = await fetch(`${serverConfig.supabaseUrl}/rest/v1/user_vault_recovery?on_conflict=user_id`, {
        method: 'POST',
        headers: {
          apikey: serverConfig.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ user_id: user.id, recovery_payload: recoveryPayload })
      });
      if (!response.ok) throw new Error(`Recovery storage failed with HTTP ${response.status}`);
      res.status(200).json({ stored: true });
      return;
    }
    if (body.action === 'recover') {
      if (!hasFreshEmailVerification(token)) {
        res.status(403).json({ error: 'A recent Email Magic Link verification is required' });
        return;
      }
      const stored = await readStoredRecovery({ userId: user.id, token, ...serverConfig });
      if (!stored) {
        res.status(404).json({ error: 'No recovery data is available' });
        return;
      }
      res.status(200).json(decryptRecoveryPayload(stored, serverConfig.recoveryKey));
      return;
    }
    if (body.action === 'delete') {
      const response = await fetch(`${serverConfig.supabaseUrl}/rest/v1/user_vault_recovery?user_id=eq.${user.id}`, {
        method: 'DELETE',
        headers: { apikey: serverConfig.publishableKey, Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`Recovery deletion failed with HTTP ${response.status}`);
      res.status(200).json({ deleted: true });
      return;
    }
    res.status(400).json({ error: 'Unsupported recovery action' });
  } catch (error) {
    res.status(502).json({ error: error?.message || 'Sync vault recovery failed' });
  }
}
