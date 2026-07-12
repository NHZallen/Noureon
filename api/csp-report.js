export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } }
};

function readBody(body) {
  if (typeof body === 'string') return JSON.parse(body || '{}');
  return body && typeof body === 'object' ? body : {};
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol;
  } catch {
    return 'invalid';
  }
}

function safeToken(value, maximumLength = 120) {
  const token = String(value || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, maximumLength);
  return token || 'unknown';
}

export function normalizeCspReport(body) {
  const parsed = readBody(body);
  const source = parsed['csp-report'] || parsed.body || parsed;
  return {
    event: 'csp_violation',
    effectiveDirective: safeToken(source['effective-directive'] || source.effectiveDirective),
    violatedDirective: safeToken(source['violated-directive'] || source.violatedDirective),
    disposition: safeToken(source.disposition),
    documentOrigin: safeOrigin(source['document-uri'] || source.documentURL),
    blockedOrigin: safeOrigin(source['blocked-uri'] || source.blockedURL)
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    console.info(JSON.stringify(normalizeCspReport(req.body)));
    res.status(204).end();
  } catch {
    res.status(400).json({ error: 'Invalid CSP report' });
  }
}
