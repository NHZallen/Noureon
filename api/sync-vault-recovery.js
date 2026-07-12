export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } }
};

const RECENT_VERIFICATION_MS = 10 * 60 * 1000;
const RECOVERY_ACTIONS = new Set(['store', 'recover', 'delete']);
const RECOVERY_METHODS = new Set(['otp', 'magiclink']);

const getServerConfig = () => ({
  supabaseUrl: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim(),
  publishableKey: (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
});

function parseBody(body) {
  const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid request body');
  return { ...parsed };
}

function validateRecoveryPayload(payload) {
  const allowed = new Set(['version', 'algorithm', 'iterations', 'salt', 'iv', 'ciphertext']);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (Object.keys(payload).some(key => !allowed.has(key))) return false;
  return payload.version === 2
    && payload.algorithm === 'PBKDF2-SHA256+A256GCM'
    && payload.iterations === 310_000
    && typeof payload.salt === 'string' && payload.salt.length > 0 && payload.salt.length <= 64
    && typeof payload.iv === 'string' && payload.iv.length > 0 && payload.iv.length <= 64
    && typeof payload.ciphertext === 'string' && payload.ciphertext.length > 0 && payload.ciphertext.length <= 32_768;
}

export function hasFreshEmailVerification(token, now = Date.now()) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!Array.isArray(payload.amr)) return false;
    return payload.amr.some(entry => {
      const verifiedAt = Number(entry?.timestamp) * 1000;
      return RECOVERY_METHODS.has(entry?.method)
        && Number.isFinite(verifiedAt)
        && verifiedAt <= now
        && verifiedAt >= now - RECENT_VERIFICATION_MS;
    });
  } catch {
    return false;
  }
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

async function readStoredRecovery({ userId, token, supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const url = new URL(`${supabaseUrl}/rest/v1/user_vault_recovery`);
  url.searchParams.set('select', 'recovery_payload');
  url.searchParams.set('user_id', `eq.${userId}`);
  const response = await fetchImpl(url, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('Recovery lookup failed');
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
  if (!serverConfig.supabaseUrl || !serverConfig.publishableKey) {
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
    let body;
    try {
      body = parseBody(req.body);
    } catch {
      res.status(400).json({ error: 'Invalid recovery request' });
      return;
    }
    if (!RECOVERY_ACTIONS.has(body.action) || Object.keys(body).some(key => !['action', 'payload'].includes(key))) {
      res.status(400).json({ error: 'Invalid recovery request' });
      return;
    }
    if (body.action !== 'store' && Object.hasOwn(body, 'payload')) {
      res.status(400).json({ error: 'Invalid recovery request' });
      return;
    }
    if (body.action === 'store') {
      if (!validateRecoveryPayload(body.payload)) {
        res.status(400).json({ error: 'A valid client-encrypted recovery payload is required' });
        return;
      }
      const response = await fetch(`${serverConfig.supabaseUrl}/rest/v1/user_vault_recovery?on_conflict=user_id`, {
        method: 'POST',
        headers: {
          apikey: serverConfig.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ user_id: user.id, recovery_payload: body.payload })
      });
      if (!response.ok) throw new Error('Recovery storage failed');
      res.status(200).json({ stored: true });
      return;
    }
    if (body.action === 'recover') {
      if (!hasFreshEmailVerification(token)) {
        res.status(403).json({ error: 'A recent Email OTP or Magic Link verification is required' });
        return;
      }
      const payload = await readStoredRecovery({ userId: user.id, token, ...serverConfig });
      if (!payload) {
        res.status(404).json({ error: 'No recovery data is available' });
        return;
      }
      if (!validateRecoveryPayload(payload)) {
        res.status(409).json({ error: 'Legacy recovery data must be recreated after unlocking with the current sync password' });
        return;
      }
      res.status(200).json({ payload });
      return;
    }
    const response = await fetch(`${serverConfig.supabaseUrl}/rest/v1/user_vault_recovery?user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: { apikey: serverConfig.publishableKey, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Recovery deletion failed');
    res.status(200).json({ deleted: true });
  } catch {
    res.status(502).json({ error: 'Sync vault recovery failed' });
  }
}
