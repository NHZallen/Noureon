// Model-authored file names are untrusted input. They are reduced to a single
// safe path segment before they reach the download attribute or a ZIP entry.

const MAX_FILE_NAME_LENGTH = 120;
const DEFAULT_BASE_NAME = 'noureon-file';

// Bidirectional overrides can disguise an extension ("report‮fdp.exe"),
// and zero-width characters make visually identical names differ.
const INVISIBLE_CHARACTERS = /[؜​-‏‪-‮⁠-⁩﻿]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const RESERVED_CHARACTERS = /[<>:"|?*]/g;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$/i;

const truncateCodePoints = (value, maxLength) => Array.from(value).slice(0, maxLength).join('');

function splitExtension(name) {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) return { base: name, extension: '' };
  return { base: name.slice(0, lastDot), extension: name.slice(lastDot + 1) };
}

export function sanitizeFileName(rawName, { fallbackBaseName = DEFAULT_BASE_NAME, defaultExtension = '' } = {}) {
  let name = String(rawName ?? '').normalize('NFC');
  name = name.replace(INVISIBLE_CHARACTERS, '').replace(CONTROL_CHARACTERS, '');
  name = name.split(/[\\/]+/).filter(Boolean).at(-1) || '';
  name = name.replace(RESERVED_CHARACTERS, '_').replace(/\s+/g, ' ').trim();
  // Windows silently drops trailing dots and spaces, which would change the
  // extension that the user sees on disk.
  name = name.replace(/[. ]+$/g, '').replace(/^\.+(?=\.)/, '');
  if (!name || /^\.+$/.test(name)) name = '';

  let { base, extension } = splitExtension(name);
  extension = extension.replace(/\s+/g, '').toLowerCase();
  if (!extension && defaultExtension) extension = String(defaultExtension).toLowerCase();
  base = base.trim();
  if (!base) base = String(fallbackBaseName || DEFAULT_BASE_NAME);

  const extensionSuffix = extension ? `.${extension}` : '';
  const maxBaseLength = Math.max(1, MAX_FILE_NAME_LENGTH - Array.from(extensionSuffix).length);
  base = truncateCodePoints(base, maxBaseLength).trim() || DEFAULT_BASE_NAME;

  let result = `${base}${extensionSuffix}`;
  if (WINDOWS_DEVICE_NAME.test(result)) result = `_${result}`;
  return result;
}

export function dedupeFileNames(names = []) {
  const used = new Set();
  return names.map((name) => {
    const { base, extension } = splitExtension(name);
    const suffix = extension ? `.${extension}` : '';
    let candidate = name;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base} (${counter})${suffix}`;
      counter += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// The names of what Noureon hands over follow one rule: `noureon-` first, then (for a picture) a few words of what it shows, then the day and the minute on the
// person's own clock, then the number it has in its message. A file a model makes keeps the name the model gave it, a research report its title.
const pad2 = (value) => String(value).padStart(2, '0');

/** "20261022-2315": the date and the minute on the clock of the person's device (the time zone of `now`). */
export function nameTimestamp(now = new Date()) {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const KEYWORD_CJK_LETTERS = 14;
const KEYWORD_WORDS = 5;
const KEYWORD_LATIN_LETTERS = 30;

/**
 * A few words of a description for a file name, in its own language: the first clause, at most 14 letters of Chinese, Japanese or Korean, or 5 words (30 letters)
 * of the others, joined with "-". Empty when there is not enough to mean something (less than two letters).
 */
export function nameKeyword(raw) {
  const clause = String(raw ?? '').normalize('NFC').split(/[\r\n]|[,，。.;；!！?？、]/u).map((part) => part.trim()).find(Boolean) || '';
  const words = clause.replace(/[^\p{L}\p{N}_]+/gu, ' ').trim();
  if (!words) return '';
  let kept;
  if (CJK.test(words)) {
    kept = Array.from(words.replace(/\s+/g, '')).slice(0, KEYWORD_CJK_LETTERS).join('');
  } else {
    kept = '';
    for (const word of words.split(/\s+/).slice(0, KEYWORD_WORDS)) {
      const next = kept ? `${kept}-${word}` : word;
      if (Array.from(next).length > KEYWORD_LATIN_LETTERS) break;
      kept = next;
    }
    if (!kept) kept = Array.from(words.split(/\s+/)[0]).slice(0, KEYWORD_LATIN_LETTERS).join('');
  }
  return Array.from(kept.replace(/-/g, '')).length >= 2 ? kept : '';
}

const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/png': 'png' };

/** The name a picture is downloaded under: noureon-<words>-<date>-<time>-<number>.<png|jpg|…>. `description` is its summary or the prompt it was drawn from. */
export function createImageFileName({ description = '', createdAt = null, number = 1, mediaType = 'image/png', now = new Date() } = {}) {
  const made = createdAt ? new Date(createdAt) : null;
  const stamp = nameTimestamp(made && !Number.isNaN(made.getTime()) ? made : now);
  const sequence = Number.isInteger(number) && number >= 1 ? number : 1;
  const keyword = nameKeyword(description);
  const extension = IMAGE_EXTENSIONS[mediaType] || 'png';
  return sanitizeFileName(`noureon-${keyword ? `${keyword}-` : ''}${stamp}-${sequence}.${extension}`);
}

export function createBundleFileName(now = new Date()) {
  return `noureon-files-${nameTimestamp(now)}.zip`;
}

/** The name of the backup of a workspace. */
export function createBackupFileName(username = '', now = new Date()) {
  const owner = nameKeyword(username).toLowerCase();
  return `noureon-backup-${owner ? `${owner}-` : ''}${nameTimestamp(now)}.zip`;
}
