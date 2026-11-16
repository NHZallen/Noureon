#!/usr/bin/env node
// Sends one signed request to browser-host, the way the main server will (for tests by hand, the acceptance script and the smoke test).
//   node call.mjs METHOD /v1/path [--json '{"a":1}'] [--file archive.tar.gz] [--out answer.bin] [--url http://172.29.0.1:40010]
// The secret comes from the environment (BROWSER_HOST_SECRET, the first one if there are two); the address from --url or BROWSER_HOST_BIND and BROWSER_HOST_PORT.
// Prints "HTTP <status>" and the JSON answer; a binary answer is written to --out (default: only its size is printed).
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { signRequest } from './auth.mjs';

const args = process.argv.slice(2);
const [method, pathWithQuery] = args;
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (!method || !pathWithQuery?.startsWith('/')) { console.error('usage: node call.mjs METHOD /v1/path [--json TEXT] [--file PATH] [--out PATH] [--url URL]'); process.exit(2); }
const secret = String(process.env.BROWSER_HOST_SECRET || '').split(',')[0].trim();
if (!secret) { console.error('BROWSER_HOST_SECRET is not set (source /etc/noureon-browser/host.env first)'); process.exit(2); }
const base = new URL(option('--url') || `http://${process.env.BROWSER_HOST_BIND || '127.0.0.1'}:${process.env.BROWSER_HOST_PORT || 40010}`);
const file = option('--file'); const text = option('--json');
const body = file ? fs.readFileSync(file) : text !== undefined ? Buffer.from(text) : undefined;
const headers = { ...signRequest({ secret, method, pathWithQuery, body }), ...(body ? { 'content-length': body.length, 'content-type': file ? 'application/gzip' : 'application/json' } : {}) };
const client = base.protocol === 'https:' ? https : http;
const request = client.request({ host: base.hostname, port: base.port, method, path: pathWithQuery, headers }, (response) => {
  const chunks = []; response.on('data', (chunk) => chunks.push(chunk)); response.on('end', () => {
    const data = Buffer.concat(chunks);
    console.log(`HTTP ${response.statusCode}`);
    if ((response.headers['content-type'] || '').startsWith('application/json')) {
      const parsed = JSON.parse(data.toString('utf8') || '{}');
      if (typeof parsed.base64 === 'string') { const out = option('--out'); if (out) fs.writeFileSync(out, Buffer.from(parsed.base64, 'base64')); parsed.base64 = `<${parsed.base64.length} characters${out ? `, written to ${out}` : ''}>`; }
      console.log(JSON.stringify(parsed));
    } else if (option('--out')) { fs.writeFileSync(option('--out'), data); console.log(`<${data.length} bytes written to ${option('--out')}>`); } else console.log(`<${data.length} bytes>`);
    process.exit(response.statusCode < 400 ? 0 : 1);
  });
});
request.on('error', (error) => { console.error(`could not reach ${base.origin}: ${error.code || error.message}`); process.exit(3); });
if (body) request.write(body);
request.end();
