import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function projectFile(...segments) {
  return join(projectRoot, ...segments);
}

export function readSource(...segments) {
  return readFileSync(projectFile(...segments), 'utf8');
}

export function readCssSource(path, seen = new Set()) {
  const filePath = projectFile(path);
  if (seen.has(filePath)) return '';
  seen.add(filePath);

  const source = readFileSync(filePath, 'utf8');
  const baseDir = dirname(path);

  return source.replace(/@import\s+['"](.+?)['"];\s*/g, (_match, importPath) => {
    const nextPath = importPath.startsWith('.')
      ? normalize(join(baseDir, importPath)).replace(/\\/g, '/')
      : importPath;
    return readCssSource(nextPath, seen);
  });
}

// A module split into parts that ship together: read as one text, the main file first, so a check of the whole still finds what moved
// into a part.
const MODULE_PARTS = {
  'src/styles/chat.css': [
    'src/styles/chat-streaming.css',
    'src/styles/chat-prose.css',
    'src/styles/chat-generated-image.css',
    'src/styles/chat-reply-layout.css'
  ],
  'src/app/runtime/legacy-core/submit-input-council-lifecycle.js': [
    'src/app/runtime/legacy-core/submit-input-composer.js',
    'src/app/runtime/legacy-core/submit-input-playback.js',
    'src/app/runtime/legacy-core/submit-input-image-reveal.js',
    'src/app/runtime/legacy-core/submit-input-reply-services.js'
  ],
  'src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js': [
    'src/app/runtime/legacy-core/model-request-runtime.js',
    'src/app/runtime/legacy-core/settings-modal-lifecycle.js',
    'src/app/runtime/legacy-core/settings-dialog-parts.js'
  ]
};

export function readUiSource(path) {
  // The page's styles: main.css, then the sheets that load with the settings dialog (each file once).
  if (path === 'src/styles/main.css') {
    const seen = new Set();
    return `${readCssSource(path, seen)}\n${readCssSource('src/styles/settings-dialog.css', seen)}`;
  }
  return [path, ...(MODULE_PARTS[path] || [])].map((part) => readSource(part)).join('\n');
}

export function countLines(source) {
  return source.split(/\r?\n/).length;
}

export function fileStats(...segments) {
  const source = readSource(...segments);
  return {
    bytes: readFileSync(projectFile(...segments)).byteLength,
    lines: countLines(source),
    source
  };
}

export function assertFileWithinBudget(assert, segments, { maxBytes, maxLines }) {
  const relativePath = segments.join('/');
  const stats = fileStats(...segments);
  assert.ok(
    stats.bytes <= maxBytes,
    `${relativePath} should stay under ${maxBytes} bytes, got ${stats.bytes}`
  );
  assert.ok(
    stats.lines <= maxLines,
    `${relativePath} should stay under ${maxLines} lines, got ${stats.lines}`
  );
  return stats;
}

export function assertSourceContains(assert, path, pattern, message) {
  assert.match(readUiSource(path), pattern, message || `${path} should contain ${pattern}`);
}

export function assertSourceDoesNotContain(assert, path, pattern, message) {
  assert.doesNotMatch(readUiSource(path), pattern, message || `${path} should not contain ${pattern}`);
}

export function collectCssSelectorHits(selectorOrPattern, files) {
  return files.filter((file) => {
    const source = readUiSource(file);
    if (typeof selectorOrPattern === 'string') return source.includes(selectorOrPattern);
    return selectorOrPattern.test(source);
  });
}

export function listFilesIfDirExists(...segments) {
  const directory = projectFile(...segments);
  if (!existsSync(directory)) return [];
  return readdirSync(directory);
}

export function assertFileExists(assert, ...segments) {
  const relativePath = segments.join('/');
  assert.ok(existsSync(projectFile(...segments)), `${relativePath} should exist`);
}
