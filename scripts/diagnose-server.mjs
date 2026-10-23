#!/usr/bin/env node
// Checks the servers from the outside, the way a browser reaches them, and says where it breaks: the name, the certificate, the proxy, the
// application, or the Python sandbox behind it. Run it on your own computer (it needs Node 22 and no packages):
//
//   node scripts/diagnose-server.mjs                      both servers and both sites
//   node scripts/diagnose-server.mjs https://api.noureon.com
//   node scripts/diagnose-server.mjs --token <access token of a signed-in person>   also asks /v1/whoami (the sign-in path through Supabase)
//
// Exit code 0 when everything answers, 1 when something does not.

import dns from 'node:dns/promises';
import { connect } from 'node:tls';

const DEFAULTS = [
  { name: 'server (real)', url: 'https://api.noureon.com', origin: 'https://noureon.com' },
  { name: 'server (test)', url: 'https://api-staging.noureon.com', origin: 'https://staging.noureon.com' }
];
const SITES = ['https://noureon.com', 'https://staging.noureon.com'];
const TIMEOUT_MS = 12_000;

const args = process.argv.slice(2);
const tokenAt = args.indexOf('--token');
const token = tokenAt >= 0 ? args.splice(tokenAt, 2)[1] : '';
const targets = args.length ? args.map((url) => ({ name: url, url: url.replace(/\/$/, ''), origin: 'https://noureon.com' })) : DEFAULTS;

const mark = { ok: '✓', bad: '✗', warn: '!' };
let failed = 0;
const say = (kind, text) => { if (kind === 'bad') failed += 1; console.log(`  ${mark[kind]} ${text}`); };

const withTimeout = (promise, label) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`${label}: no answer in ${TIMEOUT_MS / 1000} s`), { code: 'ETIMEDOUT' })), TIMEOUT_MS))]);

const explain = (error) => {
  const code = error?.cause?.code || error?.cause?.errors?.[0]?.code || error?.code || '';
  const table = {
    ENOTFOUND: 'the name does not resolve: DNS record missing or wrong (Cloudflare)',
    EAI_AGAIN: 'the name server did not answer: try again, or check DNS',
    ECONNREFUSED: 'nothing listens on that port: the proxy (Coolify/Traefik) or the machine is down',
    ECONNRESET: 'the connection was cut: the proxy or the machine is restarting or overloaded',
    ETIMEDOUT: 'no answer: the machine is off or unreachable, a firewall blocks it, or it is overloaded',
    UND_ERR_CONNECT_TIMEOUT: 'no answer: the machine is off or unreachable, a firewall blocks it, or it is overloaded',
    CERT_HAS_EXPIRED: 'the certificate has expired: the proxy could not renew it',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'the proxy answers with its own default certificate: no application is registered for this name',
    ERR_TLS_CERT_ALTNAME_INVALID: 'the certificate is for another name: no application is registered for this name'
  };
  return `${code || error?.name || 'error'}${table[code] ? ` — ${table[code]}` : ` — ${error?.message || ''}`}`;
};

const certificateOf = (host) => new Promise((resolve, reject) => {
  const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
    const certificate = socket.getPeerCertificate();
    const info = { subject: certificate.subject?.CN || '', issuer: certificate.issuer?.O || certificate.issuer?.CN || '', validTo: new Date(certificate.valid_to), authorized: socket.authorized, reason: socket.authorizationError || '' };
    socket.end();
    resolve(info);
  });
  socket.on('timeout', () => { socket.destroy(); reject(Object.assign(new Error('tls: no answer'), { code: 'ETIMEDOUT' })); });
  socket.on('error', reject);
});

const timed = async (fn) => {
  const began = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - began };
};

async function checkServer({ name, url, origin }) {
  console.log(`\n${name}  ${url}`);
  const { hostname, protocol } = new URL(url);

  if (protocol === 'https:') {
    try {
      const addresses = await withTimeout(dns.resolve4(hostname), 'dns');
      say('ok', `name resolves to ${addresses.join(', ')}`);
    } catch (error) {
      say('bad', `name: ${explain(error)}`);
      return;
    }
    try {
      const info = await certificateOf(hostname);
      const days = Math.round((info.validTo - Date.now()) / 86_400_000);
      if (!info.authorized) say('bad', `certificate is not accepted (${info.reason}); issued to ${info.subject || 'nobody'} — ${explain({ code: info.reason })}`);
      else if (days < 7) say('warn', `certificate from ${info.issuer} runs out in ${days} days`);
      else say('ok', `certificate from ${info.issuer}, valid for ${days} more days`);
    } catch (error) {
      say('bad', `tls: ${explain(error)}`);
      return;
    }
  }

  let health;
  try {
    const { value: response, ms } = await timed(() => withTimeout(fetch(`${url}/healthz`), 'healthz'));
    const text = await response.text();
    if (response.status !== 200) {
      const hint = response.status === 502 || response.status === 503 || response.status === 504
        ? 'the proxy is up but the application behind it is not: look at the application in Coolify (stopped, crashed, or still building)'
        : response.status === 404 ? 'the proxy has no application for this name' : '';
      say('bad', `/healthz answered ${response.status} in ${ms} ms${hint ? ` — ${hint}` : ''}`);
      return;
    }
    try { health = JSON.parse(text); } catch { health = null; }
    if (!health?.ok) { say('bad', `/healthz answered 200 but not like the server (${text.slice(0, 80)}) — another program answers on this name`); return; }
    say('ok', `/healthz ok in ${ms} ms, up ${Math.round(health.uptimeSeconds / 60)} min, build ${health.build ?? '?'}, protocol ${health.protocol}`);
    if (health.uptimeSeconds < 120) say('warn', 'the server started less than two minutes ago: it was restarted or redeployed just now, and replies running on it were cut');
    if (!health.runs) say('warn', 'replies on the server are off (service key or encryption key not set)');
    else if (health.sandbox === 'down') say('bad', 'the Python sandbox host is down (runner container stopped, or SANDBOX_RUNNER_URL / token wrong): Python replies fall back to the browser');
    else if (health.sandbox === 'off') say('warn', 'the Python sandbox is not configured on this server');
    else say('ok', `Python sandbox: ${health.sandbox}`);
  } catch (error) {
    say('bad', `/healthz: ${explain(error)}`);
    return;
  }

  try {
    const response = await withTimeout(fetch(`${url}/v1/whoami`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } }), 'cors');
    const allowed = response.headers.get('access-control-allow-origin');
    if (allowed === origin || allowed === '*') say('ok', `the browser from ${origin} is allowed (CORS)`);
    else say('bad', `CORS: ${origin} is not allowed (answer: ${allowed || 'none'}) — ALLOWED_ORIGINS of this application does not list it, so the browser blocks every call`);
  } catch (error) {
    say('bad', `CORS check: ${explain(error)}`);
  }

  if (token) {
    try {
      const response = await withTimeout(fetch(`${url}/v1/whoami`, { headers: { Authorization: `Bearer ${token}` } }), 'whoami');
      if (response.status === 200) say('ok', 'sign-in check passed (/v1/whoami): the server reaches Supabase');
      else say('bad', `/v1/whoami answered ${response.status} ${(await response.text()).slice(0, 100)} — ${response.status === 401 ? 'the token is old or Supabase does not accept it' : 'the server cannot check tokens (Supabase unreachable or its keys wrong)'}`);
    } catch (error) {
      say('bad', `/v1/whoami: ${explain(error)}`);
    }
  }
}

async function checkSite(url) {
  try {
    const { value: response, ms } = await timed(() => withTimeout(fetch(url, { method: 'HEAD' }), 'site'));
    if (response.ok) say('ok', `${url} answers ${response.status} in ${ms} ms`);
    else say('bad', `${url} answers ${response.status}`);
  } catch (error) {
    say('bad', `${url}: ${explain(error)}`);
  }
}

console.log(`Noureon server check, ${new Date().toISOString()}`);
for (const target of targets) await checkServer(target);
if (!args.length) {
  console.log('\nsites');
  for (const site of SITES) await checkSite(site);
}
console.log(failed ? `\n${failed} problem${failed > 1 ? 's' : ''} found.` : '\nEverything answers.');
console.log('If the servers answer here but not in the app, open the browser console on the site and look for CORS or "Refused to" lines.');
process.exitCode = failed ? 1 : 0;
