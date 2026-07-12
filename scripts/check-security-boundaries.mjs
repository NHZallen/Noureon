import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), 'utf8');

function fail(message) {
  console.error(`Security boundary check failed: ${message}`);
  process.exitCode = 1;
}

const vercel = JSON.parse(await readProjectFile('vercel.json'));
const globalHeaders = new Map(
  (vercel.headers || [])
    .find(entry => entry.source === '/(.*)')
    ?.headers
    ?.map(({ key, value }) => [key.toLowerCase(), value]) || []
);

const exactHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY'
};
for (const [name, expected] of Object.entries(exactHeaders)) {
  if (globalHeaders.get(name) !== expected) fail(`${name} must equal ${expected}`);
}

const permissionsPolicy = globalHeaders.get('permissions-policy') || '';
for (const directive of ['camera=(self)', 'microphone=(self)', 'geolocation=()', 'payment=()']) {
  if (!permissionsPolicy.includes(directive)) fail(`Permissions-Policy is missing ${directive}`);
}

const enforcedCsp = globalHeaders.get('content-security-policy') || '';
for (const directive of ["base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'"]) {
  if (!enforcedCsp.includes(directive)) fail(`enforced CSP is missing ${directive}`);
}

const reportOnlyCsp = globalHeaders.get('content-security-policy-report-only') || '';
for (const directive of ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'frame-src', 'worker-src']) {
  if (!reportOnlyCsp.includes(`${directive} `)) fail(`Report-Only CSP is missing ${directive}`);
}
if (!reportOnlyCsp.includes('report-uri /api/csp-report')) fail('Report-Only CSP has no reporting endpoint');

const migrationDirectory = new URL('supabase/migrations/', root);
const migrationNames = (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort();
const migrations = (await Promise.all(migrationNames.map(name => readFile(new URL(name, migrationDirectory), 'utf8')))).join('\n');
const tables = [...migrations.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi)]
  .map(match => match[1]);

for (const table of new Set(tables)) {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`alter\\s+table\\s+public\\.${escapedTable}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(migrations)) {
    fail(`public.${table} does not enable RLS`);
  }
  if (!new RegExp(`revoke\\s+all\\s+on(?:\\s+table)?\\s+public\\.${escapedTable}\\s+from[^;]*\\banon\\b`, 'i').test(migrations)) {
    fail(`public.${table} does not revoke anon privileges`);
  }
  const policies = [...migrations.matchAll(new RegExp(`create\\s+policy[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?;`, 'gi'))]
    .map(match => match[0]);
  if (!policies.some(policy => /auth\.uid\s*\(\s*\)/i.test(policy))) {
    fail(`public.${table} has no owner-scoped auth.uid() policy`);
  }
}

if (/create\s+policy[\s\S]{0,500}\bto\s+anon\b/i.test(migrations)) {
  fail('an application table policy grants access to anon');
}
if (/\b(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(migrations)) {
  fail('an application table policy contains an unconditional true predicate');
}

const recoveryApi = await readProjectFile('api/sync-vault-recovery.js');
if (/SYNC_VAULT_RECOVERY_KEY|createDecipheriv|decryptRecoveryPayload/.test(recoveryApi)) {
  fail('the recovery API regained a shared server decryption capability');
}

if (!process.exitCode) {
  console.log(`Security boundaries verified: ${globalHeaders.size} headers, ${new Set(tables).size} RLS tables, no anonymous table policy.`);
}
