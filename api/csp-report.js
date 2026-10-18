// Where the browser tells what the page's Content-Security-Policy would have blocked. The policy is only reported for now
// (Content-Security-Policy-Report-Only in vercel.json); what is reported here, in the function logs, says what has to be allowed
// before it can be enforced (security audit of 2026-10-18, L-3). Only the kind of each report is kept: the directive, the source that
// was blocked and the page, each without its path or query, so nothing a person wrote or opened is in the logs.

export const config = {
  api: { bodyParser: false }
};

const MAX_BYTES = 64 * 1024;
const MAX_REPORTS = 20;

const originOf = (value) => {
  const text = String(value || '');
  if (!text) return '';
  if (/^(inline|eval|wasm-eval|trusted-types-[a-z-]+|data|blob)$/.test(text)) return text;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'wss:' ? url.origin : url.protocol;
  } catch {
    return text.slice(0, 40);
  }
};

const pathOf = (value) => {
  try {
    return new URL(String(value || '')).pathname.slice(0, 80);
  } catch {
    return '';
  }
};

/** The reports in a body of either kind (report-uri sends one `csp-report`, report-to sends a list), cut down to what is kept. */
export function readReports(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed.map((entry) => entry?.body) : [parsed?.['csp-report']];
  return items.filter((item) => item && typeof item === 'object').slice(0, MAX_REPORTS).map((item) => ({
    directive: String(item['effective-directive'] || item.effectiveDirective || item['violated-directive'] || '').slice(0, 40),
    blocked: originOf(item['blocked-uri'] ?? item.blockedURL),
    page: pathOf(item['document-uri'] ?? item.documentURL),
    disposition: String(item.disposition || '').slice(0, 10)
  }));
}

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      req.destroy();
      resolve('');
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', () => resolve(''));
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }
  for (const report of readReports(await readBody(req))) console.log('csp-violation', JSON.stringify(report));
  res.status(204).end();
}
