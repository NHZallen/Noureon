// The server runs in Node with no page: it must not reach for the browser, and it may use the app's modules only from a list of
// shared ones that were looked at (docs/superpowers/specs/2026-10-03-server-runtime-design.md, §9). This checks every file under
// server/ for (1) browser globals, (2) imports of anything outside server/ and the reviewed list, and (3) that the list is exactly
// what the server reaches, imports of imports included (scripts/server-shared-modules.json): a module added to what the server
// uses must be read for browser use first, and one no longer used is taken off the list.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LIST_FILE = join(root, 'scripts', 'server-shared-modules.json');
const readList = () => JSON.parse(readFileSync(LIST_FILE, 'utf8')).modules.map((entry) => entry.path);
// Shared app modules the server may import (paths from the project root).
export const ALLOWED_SHARED = Object.freeze(readList());

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

/** Every module of src/ (and public/) the server reaches, through any number of imports, from the project root, sorted. */
export function sharedClosure() {
  const seen = new Set();
  const found = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const code = stripComments(readFileSync(path, 'utf8'));
    for (const match of code.matchAll(IMPORT)) {
      const specifier = match[1] || match[2] || match[3];
      if (!specifier || specifier.startsWith('node:') || !/^[./]/.test(specifier)) continue;
      const target = specifier.startsWith('/') ? join(root, specifier) : resolve(dirname(path), specifier);
      const inProject = relative(root, target).split('\\').join('/');
      if (!existsSync(target)) continue;
      if (inProject.startsWith('src/') || inProject.startsWith('public/')) found.add(inProject);
      visit(target);
    }
  };
  for (const path of filesUnder(join(root, 'server'))) visit(path);
  return [...found].sort();
}

/** The npm packages the server and the modules it reaches import (the first part of each bare specifier), with the file that does. */
export function packagesReached() {
  const found = new Map();
  const files = [...filesUnder(join(root, 'server')), ...sharedClosure().map((path) => join(root, path))];
  for (const path of files) {
    for (const match of stripComments(readFileSync(path, 'utf8')).matchAll(IMPORT)) {
      const specifier = match[1] || match[2] || match[3];
      if (!specifier || specifier.startsWith('node:') || /^[./]/.test(specifier) || !/^@?[\w-]/.test(specifier)) continue;
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (!found.has(name)) found.set(name, relative(root, path));
    }
  }
  return found;
}

// What the container image installs next to the server (Dockerfile): a package the server reaches that is not there would stop it at start.
const installedInImage = () => {
  const line = readFileSync(join(root, 'Dockerfile'), 'utf8').split('\n').filter((text) => /npm install/.test(text)).join(' ');
  return new Set([...line.matchAll(/(?:^|\s)((?:@[\w.-]+\/)?[\w.-]+)@[\w.^~-]+/g)].map((match) => match[1]));
};

export function checkServer() {
  const problems = filesUnder(join(root, 'server')).flatMap((path) => checkServerSource(path, readFileSync(path, 'utf8')));
  const listed = new Set(ALLOWED_SHARED);
  const reached = sharedClosure();
  for (const path of reached) if (!listed.has(path)) problems.push(`${path}: is reached by the server (through its imports) but is not on the reviewed list, scripts/server-shared-modules.json`);
  for (const path of listed) if (!reached.includes(path)) problems.push(`${path}: is on the reviewed list but the server no longer uses it; take it off`);
  const installed = installedInImage();
  for (const [name, from] of packagesReached()) if (!installed.has(name)) problems.push(`${name}: is imported (by ${from}) but the container image does not install it (Dockerfile)`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--list')) {
    console.log(sharedClosure().join('\n'));
    process.exit(0);
  }
  const problems = checkServer();
  if (problems.length) {
    console.error(`Server boundary check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Server boundary check passed.');
}
