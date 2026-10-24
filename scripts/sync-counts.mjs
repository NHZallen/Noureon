#!/usr/bin/env node
// Writes the number of models and of vendors into the words that say them: the home page (src/data/home-texts.js, HOME_FACTS and the five languages)
// and the Help Center and privacy policy (src/data/legal/<language>.js). tests/home-page.test.js and tests/legal-texts.test.js fail when these differ
// from the registries; run this after a model is added or removed, then look at `git diff`.
//
//   npm run sync:counts            writes the files
//   npm run sync:counts -- --check says what would change and writes nothing (exit code 1 when something would)
//
// Only the models and the vendors are rewritten: they change often and their numbers (here 70 to 80 and 15 to 25) stand apart from the other numbers of
// the texts. The other facts of HOME_FACTS (decks, styles, skills, tools, the council) are small numbers that also appear elsewhere in the words: change
// them by hand when the tests say so.

import { readFileSync, writeFileSync } from 'node:fs';
import { computeAppCounts } from './app-counts.mjs';

const HOME_FILE = new URL('../src/data/home-texts.js', import.meta.url);
const LEGAL_FILES = ['zh-TW', 'en', 'fr', 'ru', 'es'].map((language) => new URL(`../src/data/legal/${language}.js`, import.meta.url));
const check = process.argv.includes('--check');

const home = readFileSync(HOME_FILE, 'utf8');
const facts = home.match(/export const HOME_FACTS = Object\.freeze\(\{ models: (\d+), vendors: (\d+),/);
if (!facts) {
  console.error('HOME_FACTS was not found in src/data/home-texts.js (the line must start with `models: N, vendors: N,`).');
  process.exit(2);
}
const written = { models: Number(facts[1]), vendors: Number(facts[2]) };
const now = await computeAppCounts();
if (written.models === now.models && written.vendors === now.vendors) {
  console.log(`The numbers are right already: ${now.models} models, ${now.vendors} vendors.`);
  process.exit(0);
}
console.log(`models ${written.models} -> ${now.models}, vendors ${written.vendors} -> ${now.vendors}`);

// The number of models is found by its value; the number of vendors only when it stands next to a number of models (within 45 characters: "74 models
// from 18 vendors", "['74', ...], ['18', ...]"), because a number like 18 also stands elsewhere in the documents (an age, a version).
const NEAR = 45;
const rewrite = (text) => {
  const numbers = new RegExp(`\\b(${written.models}|${written.vendors})\\b`, 'g');
  const found = [...text.matchAll(numbers)].map((match) => ({ at: match.index, value: match[1] }));
  const modelsAt = found.filter((entry) => entry.value === String(written.models)).map((entry) => entry.at);
  let models = 0;
  let vendors = 0;
  // One pass over the original text, so the places found are the places changed.
  // A number that stands beside the port 443 is a port (80), whatever the count of models is.
  const isPort = (offset, match) => /^\D{1,8}443\b/.test(text.slice(offset + match.length, offset + match.length + 14)) || /\b443\D{1,8}$/.test(text.slice(Math.max(0, offset - 14), offset));
  const result = text.replace(numbers, (match, value, offset) => {
    if (isPort(offset, match)) return match;
    if (value === String(written.models)) {
      models += 1;
      return String(now.models);
    }
    if (!modelsAt.some((at) => Math.abs(at - offset) <= NEAR)) return match;
    vendors += 1;
    return String(now.vendors);
  });
  return { models, vendors, text: result };
};

let changed = false;
for (const file of [HOME_FILE, ...LEGAL_FILES]) {
  const before = readFileSync(file, 'utf8');
  const { models, vendors, text } = rewrite(before);
  if (text === before) continue;
  changed = true;
  console.log(`${file.pathname.split('/Noureon/').pop()}: ${models} places of the models, ${vendors} of the vendors`);
  if (!check) writeFileSync(file, text);
}
if (check) {
  console.log(changed ? 'Run `npm run sync:counts` to write them.' : 'Nothing to change.');
  process.exit(changed ? 1 : 0);
}
console.log('Written. Look at `git diff`, then run the tests.');
