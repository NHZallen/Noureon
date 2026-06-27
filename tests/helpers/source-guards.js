import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function projectFile(...segments) {
  return join(projectRoot, ...segments);
}

export function readSource(...segments) {
  return readFileSync(projectFile(...segments), 'utf8');
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
