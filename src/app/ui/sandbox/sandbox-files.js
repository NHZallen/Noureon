// Files made in Advanced mode. Their bytes live in the reply message as
// parts, the way uploaded attachments do:
//
//   { sandboxFile: { id, name, mimeType, size, data } }     data: base64
//
// so they are saved with the conversation, exported, shared, and synced by
// the cloud asset transport (which uploads any `data` next to a `mimeType`).
// The run record in the reply's text lists them by id; the cards below the
// answer are built from that list and these parts. A part whose data is not
// here (for example a cloud copy that could not be downloaded) shows as
// "not on this device" with a way to run the code again.

import { registerFileBlock, rememberGeneratedFileSize } from '../files/file-block-model.js';
import { sanitizeFileName } from '../files/file-name-policy.js';
import { ARCHIVE_EXTENSIONS, resolveFileType } from '../files/file-type-registry.js';

// Binary types Python can produce that the text-file registry does not know.
const BINARY_TYPES = Object.freeze({
  png: { family: 'image', mime: 'image/png' },
  jpg: { family: 'image', mime: 'image/jpeg' },
  jpeg: { family: 'image', mime: 'image/jpeg' },
  gif: { family: 'image', mime: 'image/gif' },
  webp: { family: 'image', mime: 'image/webp' },
  bmp: { family: 'image', mime: 'image/bmp' },
  zip: { family: 'archive', mime: 'application/zip' },
  gz: { family: 'archive', mime: 'application/gzip' },
  tar: { family: 'archive', mime: 'application/x-tar' },
  xls: { family: 'excel', mime: 'application/vnd.ms-excel' },
  parquet: { family: 'data', mime: 'application/octet-stream' },
  npy: { family: 'data', mime: 'application/octet-stream' },
  pkl: { family: 'data', mime: 'application/octet-stream' },
  mp3: { family: 'data', mime: 'audio/mpeg' },
  wav: { family: 'data', mime: 'audio/wav' },
  mp4: { family: 'data', mime: 'video/mp4' }
});
const TEXT_PREVIEW_BYTES = 1024 * 1024;

const PARTS = new Map();
const BLOBS = new Map();

export const hasFileData = (file) => typeof file?.data === 'string' && file.data.length > 0;

// The type a file made in the sandbox is shown and delivered as.
export function sandboxFileType(name) {
  const type = resolveFileType(name);
  const binary = BINARY_TYPES[type.extension];
  // Archives are blocked only as text a model streams; Python builds real ones.
  const archive = ARCHIVE_EXTENSIONS.includes(type.extension);
  if (binary && (type.policy !== 'block' || archive)) return { ...type, policy: 'allow', ...binary, binary: true };
  if (archive) return { ...type, family: 'archive', mime: 'application/octet-stream', policy: 'allow', binary: true };
  return { ...type, binary: type.family === 'word' || type.family === 'excel' || type.family === 'powerpoint' || type.family === 'pdf' };
}

export function registerSandboxFileParts(parts = []) {
  for (const part of Array.isArray(parts) ? parts : []) {
    const file = part?.sandboxFile;
    if (!file?.id) continue;
    if (PARTS.get(file.id) !== file) BLOBS.delete(file.id);
    PARTS.set(file.id, file);
  }
}

export const getSandboxFilePart = (id) => PARTS.get(id) || null;
export const forgetSandboxFileBlob = (id) => BLOBS.delete(id);

const decodeBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export function encodeBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function sandboxFileBytes(id) {
  const file = PARTS.get(id);
  return hasFileData(file) ? decodeBase64(file.data) : null;
}

export async function loadSandboxFileBlob(id) {
  if (BLOBS.has(id)) return BLOBS.get(id);
  const file = PARTS.get(id);
  if (!hasFileData(file)) throw new Error('the file is not on this device');
  const blob = new Blob([decodeBase64(file.data)], { type: file.mimeType || sandboxFileType(file.name).mime || 'application/octet-stream' });
  BLOBS.set(id, blob);
  return blob;
}

// The newest version of each file the run created, in order of first
// appearance. A name written twice (a revised chart) keeps its last bytes.
export function latestRunFiles(run) {
  const byName = new Map();
  for (const step of run?.steps || []) {
    for (const file of step.files || []) {
      if (!file?.id) continue;
      byName.delete(file.name);
      byName.set(file.name, file);
    }
  }
  return [...byName.values()];
}

// The card descriptor for one file of the run (registered for the card's
// buttons). `canRerun`: the run's code is known, so it can be run again.
export function describeSandboxFile(entry, { canRerun = false } = {}) {
  const file = PARTS.get(entry.id);
  const name = sanitizeFileName(entry.name || file?.name || '', { defaultExtension: 'bin' });
  const type = sandboxFileType(name);
  const available = hasFileData(file);
  let content = '';
  // Text files keep their text for the source and table views.
  if (available && !type.binary && type.generator === 'text' && (file.size || 0) <= TEXT_PREVIEW_BYTES) {
    try {
      content = new TextDecoder().decode(decodeBase64(file.data)).replace(/^﻿/, '');
    } catch {
      content = '';
    }
  }
  const size = Number(entry.size || file?.size) || 0;
  if (size) rememberGeneratedFileSize(`sandbox-${entry.id}`, size);
  return registerFileBlock({
    id: `sandbox-${entry.id}`,
    sandboxFileId: entry.id,
    name,
    extension: type.extension,
    family: type.family,
    generator: 'stored',
    mime: file?.mimeType || type.mime,
    policy: type.policy,
    language: type.language || '',
    content,
    binary: type.binary,
    complete: true,
    state: type.policy === 'block' ? 'blocked' : available ? 'ready' : 'missing',
    stats: null,
    size,
    canRerun,
    // A deck Python drew itself cannot be laid out by the slide preview.
    pagePreview: type.family !== 'powerpoint'
  });
}

// After a reply: the files the run created become message parts, and the
// run record refers to them by id. Returns the parts to add to the message.
export function createSandboxFileParts(run, { createId = () => crypto.randomUUID() } = {}) {
  if (!run?.steps?.length) return [];
  const newest = new Map();
  run.steps.forEach((step, stepIndex) => {
    (step.outputs || []).forEach((output) => {
      newest.delete(output.name);
      newest.set(output.name, { output, stepIndex });
    });
  });
  const parts = [];
  for (const [name, { output, stepIndex }] of newest) {
    const bytes = output.bytes instanceof Uint8Array ? output.bytes : new Uint8Array(output.bytes || 0);
    const id = createId();
    const file = { id, name, mimeType: sandboxFileType(name).mime || 'application/octet-stream', size: bytes.byteLength, data: encodeBase64(bytes) };
    parts.push({ sandboxFile: file });
    const listed = run.steps[stepIndex].files.find((entry) => entry.name === name && !entry.id);
    if (listed) listed.id = id;
  }
  registerSandboxFileParts(parts);
  return parts;
}

// What goes into /input: the conversation's attachments and the files made
// earlier in it, newest last (a later file with the same name wins).
export function collectSandboxInputs(conversation, extraParts = []) {
  const byName = new Map();
  const add = (name, mimeType, data) => {
    if (typeof data !== 'string' || !data) return;
    const key = String(name || 'file');
    byName.delete(key);
    byName.set(key, { name: key, type: mimeType || '', data });
  };
  const seen = new Set();
  for (const part of [...(conversation?.messages || []).flatMap((message) => message.parts || []), ...extraParts]) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    if (part.inlineData) add(part.inlineData.name || `attachment.${String(part.inlineData.mimeType || '').split('/')[1] || 'bin'}`, part.inlineData.mimeType, part.inlineData.data);
    if (part.sandboxFile) add(part.sandboxFile.name, part.sandboxFile.mimeType, part.sandboxFile.data);
  }
  return [...byName.values()].map((file) => ({
    name: file.name,
    type: file.type,
    size: Math.floor((file.data.length * 3) / 4),
    bytes: () => decodeBase64(file.data)
  }));
}

// Hooks the app sets: where rerun inputs come from and how to save.
const hooks = { inputs: () => [], save: async () => {} };
export function setSandboxFileHooks({ inputs, save } = {}) {
  if (typeof inputs === 'function') hooks.inputs = inputs;
  if (typeof save === 'function') hooks.save = save;
}
export const getSandboxFileHooks = () => hooks;
