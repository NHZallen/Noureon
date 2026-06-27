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

export function readUiSource(path) {
  return path === 'src/styles/main.css' ? readCssSource(path) : readSource(path);
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
