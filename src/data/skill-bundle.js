// A skill added as a zip (docs/superpowers/specs/2026-10-09-skills-design.md, §14): SKILL.md at the top, and files in folders such as references/ and scripts/. Shared by the
// page (the window that takes an uploaded zip) and the server (it opens the stored copy again before it gives a model a file), so both judge the same way. The zip a
// person uploads is read, every file is checked, and a clean copy is built from what passed: that copy is what is kept, so what is kept has SKILL.md at the top and
// nothing that was refused or skipped. Nothing here runs a file.

import { parseSkillMarkdown } from './skill-format.js';

export const SKILL_BUNDLE_BUCKET = 'user-skill-bundles';
export const SKILL_BUNDLE_LIMITS = Object.freeze({
  /** The zip as it is uploaded (and as it is kept). */
  zipBytes: 5 * 1024 * 1024,
  /** Everything in it once opened. */
  totalBytes: 10 * 1024 * 1024,
  /** The files, SKILL.md not counted. */
  files: 60,
  fileBytes: 2 * 1024 * 1024,
  pathChars: 200,
  /** What a model is given of one text file at a time. */
  readChars: 20_000
});

/** Where the clean copy of a skill is kept: the folder of the person, the name of the skill. */
export const skillBundlePath = (userId, name) => `${userId}/${name}.zip`;

// Files a model can run: Python and shell scripts, in the sandbox on the server. Everything else is read (text) or only kept (pictures and the like).
const SCRIPT_EXTENSIONS = new Set(['py', 'sh']);
// Programs and installers: not kept at all (a skill is instructions and helper scripts, never a program to run on a machine).
const BLOCKED_EXTENSIONS = new Set(['exe', 'dll', 'so', 'dylib', 'bat', 'cmd', 'com', 'msi', 'scr', 'app', 'apk', 'jar', 'bin', 'ps1', 'vbs', 'lnk']);
const SYMLINK_MODE = 0o120000;
const MODE_MASK = 0o170000;

const extensionOf = (path) => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** 'script' (.py, .sh), 'text' (decodes as UTF-8), or 'binary'. */
export function classifyFile(path, bytes) {
  if (SCRIPT_EXTENSIONS.has(extensionOf(path))) return 'script';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'text';
  } catch {
    return 'binary';
  }
}

const fail = (error, detail = '') => ({ ok: false, error, ...(detail ? { detail } : {}) });

const toBytes = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return null;
};

/**
 * A path inside the zip, cleaned: forward slashes, no empty or "." parts. Returns { path } for a file to keep, { skip: true } for what is left out without a word
 * (macOS leftovers, hidden files and folders such as .git or .env), or { error }.
 */
export function cleanBundlePath(raw) {
  const text = String(raw ?? '');
  if (!text || text.includes('\0') || text.includes('\\') || text.startsWith('/') || /^[A-Za-z]:/.test(text)) return { error: 'bad_path' };
  const parts = text.split('/').filter((part) => part && part !== '.');
  if (!parts.length) return { error: 'bad_path' };
  if (parts.includes('..')) return { error: 'bad_path' };
  if (parts[0] === '__MACOSX' || parts.some((part) => part.startsWith('.'))) return { skip: true };
  const path = parts.join('/');
  if (path.length > SKILL_BUNDLE_LIMITS.pathChars) return { error: 'bad_path' };
  return { path };
}

/**
 * Reads a zip. Returns
 *   { ok: true, skill: { name, description, body, license?, compatibility? }, files: [{ path, size, kind, bytes }], bundle: Uint8Array }
 * where `files` are the files other than SKILL.md and `bundle` is the clean zip to keep; or { ok: false, error, detail? } with one of:
 * not_a_zip, zip_too_large, bad_path, blocked_file, symlink, duplicate_path, too_many_files, file_too_large, bundle_too_large, skill_md_missing, or an error of
 * parseSkillMarkdown (name_missing, description_too_long, ...). `detail` is the path the error is about, when there is one.
 * `buildBundle: false` leaves out the clean copy (reading a stored one again does not need it).
 */
export async function readSkillBundle(input, { buildBundle = true, loadZip = null } = {}) {
  const bytes = toBytes(input);
  if (!bytes || !bytes.byteLength) return fail('not_a_zip');
  if (bytes.byteLength > SKILL_BUNDLE_LIMITS.zipBytes) return fail('zip_too_large');
  const JSZip = loadZip ? await loadZip() : (await import('jszip')).default;
  let archive;
  try {
    archive = await JSZip.loadAsync(bytes);
  } catch {
    return fail('not_a_zip');
  }

  const found = [];
  const seen = new Set();
  let declared = 0;
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;
    const cleaned = cleanBundlePath(entry.name);
    if (cleaned.error) return fail(cleaned.error, String(entry.name).slice(0, 80));
    if (cleaned.skip) continue;
    if ((Number(entry.unixPermissions) & MODE_MASK) === SYMLINK_MODE) return fail('symlink', cleaned.path);
    if (BLOCKED_EXTENSIONS.has(extensionOf(cleaned.path))) return fail('blocked_file', cleaned.path);
    // The size the zip declares is looked at before anything is opened, so a small zip that opens into gigabytes is refused without opening it.
    const size = Number(entry._data?.uncompressedSize);
    if (Number.isFinite(size)) {
      if (size > SKILL_BUNDLE_LIMITS.fileBytes) return fail('file_too_large', cleaned.path);
      declared += size;
      if (declared > SKILL_BUNDLE_LIMITS.totalBytes) return fail('bundle_too_large');
    }
    found.push({ entry, path: cleaned.path });
  }

  // One folder around everything ("my-skill/SKILL.md", "my-skill/scripts/x.py") is taken off.
  let prefix = '';
  if (!found.some((file) => file.path.toLowerCase() === 'skill.md')) {
    const tops = new Set(found.map((file) => (file.path.includes('/') ? file.path.slice(0, file.path.indexOf('/')) : '')));
    if (tops.size === 1 && !tops.has('') && found.some((file) => file.path.toLowerCase().endsWith('/skill.md') && file.path.split('/').length === 2)) prefix = `${[...tops][0]}/`;
  }

  const files = [];
  let skillText = null;
  let total = 0;
  for (const { entry, path: fullPath } of found) {
    const path = prefix ? fullPath.slice(prefix.length) : fullPath;
    const key = path.toLowerCase();
    if (seen.has(key)) return fail('duplicate_path', path);
    seen.add(key);
    const content = await entry.async('uint8array');
    if (content.byteLength > SKILL_BUNDLE_LIMITS.fileBytes) return fail('file_too_large', path);
    total += content.byteLength;
    if (total > SKILL_BUNDLE_LIMITS.totalBytes) return fail('bundle_too_large');
    if (key === 'skill.md') {
      skillText = new TextDecoder('utf-8').decode(content);
      continue;
    }
    files.push({ path, size: content.byteLength, kind: classifyFile(path, content), bytes: content });
  }
  if (skillText === null) return fail('skill_md_missing');
  if (files.length > SKILL_BUNDLE_LIMITS.files) return fail('too_many_files');
  const parsed = parseSkillMarkdown(skillText);
  if (!parsed.ok) return parsed;
  files.sort((a, b) => a.path.localeCompare(b.path));

  let bundle = null;
  if (buildBundle) {
    const clean = new JSZip();
    clean.file('SKILL.md', skillText);
    for (const file of files) clean.file(file.path, file.bytes);
    bundle = await clean.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    if (bundle.byteLength > SKILL_BUNDLE_LIMITS.zipBytes) return fail('zip_too_large');
  }
  return { ok: true, skill: parsed.skill, files, bundle };
}

/** What is kept in the row of the skill for each file (no content): [{ path, size, kind }]. */
export const bundleFileList = (files) => (Array.isArray(files) ? files : []).slice(0, SKILL_BUNDLE_LIMITS.files).map((file) => ({ path: String(file.path), size: Number(file.size) || 0, kind: file.kind === 'script' || file.kind === 'binary' ? file.kind : 'text' }));

/** The text of a file for a model or for the details, or null when it is not text or is not in the bundle. Cut at `limit` characters (`cut` says so). */
export function bundleFileText(files, path, limit = SKILL_BUNDLE_LIMITS.readChars) {
  const file = (Array.isArray(files) ? files : []).find((entry) => entry.path === path);
  if (!file || file.kind === 'binary' || !file.bytes) return null;
  const text = new TextDecoder('utf-8').decode(file.bytes);
  return text.length > limit ? { text: text.slice(0, limit), cut: true } : { text, cut: false };
}

/** Whether a stored list says the skill has a script a model could run. */
export const hasRunnableScript = (list) => (Array.isArray(list) ? list : []).some((file) => file?.kind === 'script');
