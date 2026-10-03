// The parts of a reply that runs Python (Advanced mode) that belong to the server: which files the code is given, what is told of the
// steps while they run, and how the files the code made are kept and listed in the message. The tool loop itself is the browser's
// (src/app/runtime/sandbox/sandbox-reply.js); the server only gives it a sandbox that runs on the sandbox host.

import { formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { DOCUMENT_PREFIX, sandboxDocumentBlocks, sandboxDocumentNames, sandboxFileType, withoutDuplicatedFileBlocks, withoutEmptyDocumentBlocks } from '../src/app/ui/sandbox/sandbox-files.js';

// A file the store could not take is still handed over in the message when it is this small; larger ones are listed as not saved.
const INLINE_FALLBACK_BYTES = 5 * 1024 * 1024;
// Pictures are shown while the step runs: they travel in the live event when they are this small (all of a step together too).
const LIVE_IMAGE_BYTES = 1024 * 1024;
const LIVE_IMAGES_PER_STEP_BYTES = 3 * 1024 * 1024;
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|bmp|svg)$/i;
const MAX_INPUT_FILES = 40;

const isMarker = (value) => Boolean(value && typeof value === 'object' && value.__astraCloudAsset?.path);

/**
 * The files the code finds in /input: the attachments of the conversation and the files earlier replies made (a later file of the same
 * name wins), then the ones sent with this message. A file kept in the cloud (a marker) is fetched when the sandbox is given it.
 * Resolves [{ name, type, size, bytes: () => Promise<Uint8Array> }].
 */
export function collectInputFiles({ history = [], current = [], sent = [], userId, files }) {
  const byName = new Map();
  const add = (name, mimeType, data, size) => {
    const key = String(name || 'file').slice(0, 300);
    let bytes = null;
    let length = 0;
    if (typeof data === 'string' && data) {
      length = Math.floor((data.length * 3) / 4);
      bytes = async () => new Uint8Array(Buffer.from(data, 'base64'));
    } else if (isMarker(data) && files?.load && String(data.__astraCloudAsset.path).startsWith(`${userId}/`)) {
      length = Number(size) || 0;
      bytes = async () => files.load({ userId, marker: data });
    } else return;
    byName.delete(key);
    byName.set(key, { name: key, type: String(mimeType || ''), size: length, bytes });
  };
  const parts = [...history.flatMap((message) => (Array.isArray(message?.parts) ? message.parts : [])), ...current];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.inlineData) add(part.inlineData.name || `attachment.${String(part.inlineData.mimeType || '').split('/')[1] || 'bin'}`, part.inlineData.mimeType, part.inlineData.data, part.inlineData.size);
    if (part.sandboxFile) add(part.sandboxFile.name, part.sandboxFile.mimeType, part.sandboxFile.data, part.sandboxFile.size);
  }
  for (const file of sent) add(file?.name, file?.mimeType, file?.data, 0);
  return [...byName.values()].slice(-MAX_INPUT_FILES);
}

/**
 * What goes to the watchers of a reply for each thing the steps do (the event the page's step list takes), made small: a program that
 * is written arrives whole each time it grows, so it is sent at most this often, and the bytes of a file stay out (a small picture
 * is given as `data`, so it is shown while the step runs).
 */
export function createStepEvents({ send, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, codeEveryMs = 150 }) {
  let pendingCode = null;
  let timer = null;
  let lastCodeAt = -Infinity;
  const flushCode = () => {
    if (timer) clearTimer(timer);
    timer = null;
    if (pendingCode) {
      const event = pendingCode;
      pendingCode = null;
      lastCodeAt = now();
      send(event);
    }
  };
  const compact = (event) => {
    if (event.type !== 'step-end') return event;
    let images = 0;
    const files = (event.files || []).map((file) => {
      const base = { name: file.name, size: file.size };
      if (IMAGE_EXTENSIONS.test(file.name) && file.bytes?.length && file.bytes.length <= LIVE_IMAGE_BYTES && images + file.bytes.length <= LIVE_IMAGES_PER_STEP_BYTES) {
        images += file.bytes.length;
        return { ...base, data: Buffer.from(file.bytes).toString('base64') };
      }
      return base;
    });
    return { ...event, files };
  };
  return {
    event(event) {
      if (!event || typeof event.type !== 'string') return;
      if (event.type === 'code') {
        pendingCode = event;
        const wait = Math.max(0, lastCodeAt + codeEveryMs - now());
        if (wait === 0) flushCode();
        else if (!timer) timer = setTimer(flushCode, wait);
        return;
      }
      // The program as written so far comes before what follows it.
      flushCode();
      send(compact(event));
    },
    flush: flushCode
  };
}

/**
 * The reply as it is saved. Keeps the files the code made (the newest of each name) in the person's storage and lists them in the
 * message as parts, the way the browser does, and puts the run record, the answer and the documents handed to the design system
 * into the text. Mutates `run` (the listed files get their ids). Resolves { text, parts }.
 */
export async function finishAdvancedReply({ result, run, userId, files, createId = () => crypto.randomUUID() }) {
  const newest = new Map();
  run.steps.forEach((step, stepIndex) => {
    (step.outputs || []).forEach((output) => {
      if (output.name.startsWith(DOCUMENT_PREFIX)) return;
      newest.delete(output.name);
      newest.set(output.name, { output, stepIndex });
    });
  });
  const parts = [];
  for (const [name, { output, stepIndex }] of newest) {
    const bytes = output.bytes instanceof Uint8Array ? output.bytes : new Uint8Array(output.bytes || 0);
    const mimeType = sandboxFileType(name).mime || 'application/octet-stream';
    let data = null;
    try {
      data = await files.save({ userId, bytes, mimeType });
    } catch {
      if (bytes.byteLength <= INLINE_FALLBACK_BYTES) data = Buffer.from(bytes).toString('base64');
    }
    const step = run.steps[stepIndex];
    if (data === null) {
      // Not saved: the file is not offered, and the step says so.
      step.skipped = [...(step.skipped || []), { name, reason: 'not-saved' }];
      step.files = step.files.filter((entry) => entry.name !== name);
      continue;
    }
    const id = createId();
    parts.push({ sandboxFile: { id, name, mimeType, size: bytes.byteLength, data } });
    const listed = step.files.find((entry) => entry.name === name && !entry.id);
    if (listed) listed.id = id;
  }
  const documents = sandboxDocumentBlocks(run);
  // A block the model also wrote under the name of a file it made is a second, empty card.
  const answer = withoutEmptyDocumentBlocks(withoutDuplicatedFileBlocks(result.text, [...parts.map((part) => part.sandboxFile.name), ...sandboxDocumentNames(run)]));
  return { text: `${formatSandboxRunBlock(run)}${answer || ''}${documents ? `\n\n${documents}` : ''}`, parts };
}
