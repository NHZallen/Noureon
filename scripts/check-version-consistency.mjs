#!/usr/bin/env node
// Guards the single product version source.
//
// src/data/version.js is authoritative. package.json, package-lock.json and the newest
// update-log entry must agree with it, and no locale file may carry its own copy of the
// number. PWA cache, memory/sync schema and API versions are deliberately out of scope.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(projectFile(path), 'utf8'));

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: found ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

const { PRODUCT_VERSION } = await import(new URL('../src/data/version.js', import.meta.url));

if (!/^\d+\.\d+\.\d+$/.test(PRODUCT_VERSION || '')) {
  console.error(`PRODUCT_VERSION must be a three-part semantic version, found ${JSON.stringify(PRODUCT_VERSION)}.`);
  process.exit(1);
}

check('package.json version', readJson('package.json').version, PRODUCT_VERSION);

const lock = readJson('package-lock.json');
check('package-lock.json version', lock.version, PRODUCT_VERSION);
check('package-lock.json packages[""].version', lock.packages?.['']?.version, PRODUCT_VERSION);

const { updateLogEntries } = await import(new URL('../src/data/update-logs/entries.js', import.meta.url));
check('newest update-log entry version', updateLogEntries?.[0]?.version, PRODUCT_VERSION);

// Locale files must hold the label only. A bare version number there would be a second source.
const localeDir = projectFile('src/data/i18n');
for (const name of readdirSync(localeDir).filter((file) => file.endsWith('.js')).sort()) {
  const source = readFileSync(`${localeDir}/${name}`, 'utf8');
  const stray = source.match(/\d+\.\d+\.\d+/g);
  if (stray) {
    failures.push(`src/data/i18n/${name} still contains a version literal: ${[...new Set(stray)].join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error(`Product version is ${PRODUCT_VERSION} but these disagree:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nUpdate src/data/version.js and the listed sources together.');
  process.exit(1);
}

console.log(`Version consistency check passed (product version ${PRODUCT_VERSION}).`);
