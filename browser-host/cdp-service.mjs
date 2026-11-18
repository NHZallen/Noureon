// The long-lived DevTools service of one browser (it runs in a throw-away sidecar container that joins the browser's network, see sidecarServiceArgs in docker-args.mjs). Until now
// every action started a container of its own and a new node process (about 2.4 s each on the real host, measured 2026-11-18); this one container is started once and gets one
// action per line on standard input: {"id": 3, "action": {...}}. It answers one line per action on standard output: {"id": 3, "result": {...}}, in the order the actions finish,
// up to six at the same time (a look and its picture go together). The actions themselves are those of cdp-actions.mjs, each with a DevTools connection of its own, so nothing
// is kept between two actions. A body with a secret in it arrives here on standard input as before (never as an argument) and is never quoted in an error. When the host closes
// standard input, or goes away, this ends and the container with it.
import readline from 'node:readline';
import { runAction } from './cdp-actions.mjs';

const MAX_PARALLEL = 6;
const ACTION_LIMIT_MS = 50_000;
const devtools = process.env.DEVTOOLS || 'http://127.0.0.1:9222';

// The guard: every few seconds the fields that hold a secret (a card, a code, a login) of every tab are drawn as dots, so that the live screen of the person and the pictures of the model show dots whoever typed.
// BROWSER_MASK_MS=0 switches it off (the tools still mark the fields they fill, and every look of the model marks the page before it takes its picture).
const MASK_EVERY_MS = Number.isFinite(Number(process.env.BROWSER_MASK_MS)) && process.env.BROWSER_MASK_MS !== undefined && process.env.BROWSER_MASK_MS !== '' ? Math.max(0, Number(process.env.BROWSER_MASK_MS)) : 2000;
let guarding = false;
if (MASK_EVERY_MS > 0) {
  setInterval(() => {
    if (guarding) return;
    guarding = true;
    runAction({ type: 'mask' }, devtools).catch(() => {}).finally(() => { guarding = false; });
  }, MASK_EVERY_MS).unref();
}

const queue = [];
let running = 0;

const answer = (id, result) => new Promise((resolve) => { process.stdout.write(`${JSON.stringify({ id, result })}\n`, resolve); });

async function handle(message) {
  const started = Date.now();
  let timer;
  const watchdog = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, error: 'the action took more than 50 s' }), ACTION_LIMIT_MS); });
  let result;
  try { result = await Promise.race([runAction(message.action || {}, devtools), watchdog]); } catch (error) { result = { ok: false, error: String(error?.message || error).slice(0, 300) }; }
  clearTimeout(timer);
  if (result && typeof result === 'object') result.scriptMs = Date.now() - started;
  await answer(message.id, result);
}

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const message = queue.shift();
    running += 1;
    handle(message).catch(() => {}).finally(() => { running -= 1; pump(); });
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; } // a line that cannot be read has no number to answer to
  if (!message || !Number.isInteger(message.id)) return;
  queue.push(message);
  pump();
});
lines.on('close', () => process.exit(0));
