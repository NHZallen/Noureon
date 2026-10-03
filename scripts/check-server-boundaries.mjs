// The server runs in Node with no page: it must not reach for the browser, and it may use the app's modules only from a list of
// shared ones that were looked at (docs/superpowers/specs/2026-10-03-server-runtime-design.md, §9). This checks every file under
// server/ for (1) browser globals, (2) imports from src/ that are not on the list, (3) imports of the browser-only parts of src/.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Shared app modules the server may import (paths from the project root). Add one only after reading it for browser use.
export const ALLOWED_SHARED = Object.freeze([]);

const BROWSER_GLOBAL = /\b(?:window|document|localStorage|sessionStorage|indexedDB|navigator|location|self)\s*(?:\.|\[)|\b(?:localStorage|sessionStorage|indexedDB)\b|\bglobalThis\.(?:window|document)\b/;
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
const stripStrings = (source) => source.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (match) => match[0] + ' '.repeat(Math.max(0, match.length - 2)) + match[0]);

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.(?:js|mjs)$/.test(name) ? [path] : [];
  });
}

export function checkServerSource(path, source, allowed = ALLOWED_SHARED) {
  const problems = [];
  const code = stripComments(source);
  const bare = stripStrings(code);
  const global = BROWSER_GLOBAL.exec(bare);
  if (global) problems.push(`${relative(root, path)}: uses a browser global (${global[0].trim()})`);
  for (const match of code.matchAll(IMPORT)) {
    const specifier = match[1] || match[2] || match[3];
    if (!specifier || specifier.startsWith('node:') || !/^[./]/.test(specifier)) continue;
    const target = specifier.startsWith('/') ? join(root, specifier) : resolve(dirname(path), specifier);
    const inProject = relative(root, target).split('\\').join('/');
    if (inProject.startsWith('src/') || inProject.startsWith('public/')) {
      if (!allowed.includes(inProject)) problems.push(`${relative(root, path)}: imports ${inProject}, which is not on the list of shared modules`);
    } else if (!inProject.startsWith('server/') ) {
      problems.push(`${relative(root, path)}: imports ${inProject}, outside server/`);
    }
  }
  return problems;
}

export function checkServer() {
  return filesUnder(join(root, 'server')).flatMap((path) => checkServerSource(path, readFileSync(path, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkServer();
  if (problems.length) {
    console.error(`Server boundary check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Server boundary check passed.');
}
