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

export function createBundleFileName(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `noureon-files-${stamp}.zip`;
}
