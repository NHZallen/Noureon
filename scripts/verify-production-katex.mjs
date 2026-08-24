import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

const assetsUrl = new URL('../dist/assets/', import.meta.url);
const assetNames = await readdir(assetsUrl);
const katexAssets = assetNames.filter((name) => /^katex\.min-[A-Za-z0-9_-]+\.js$/.test(name));

assert.equal(
  katexAssets.length,
  1,
  `Expected one raw KaTeX production asset, found: ${katexAssets.join(', ') || 'none'}`
);

const source = await readFile(new URL(katexAssets[0], assetsUrl), 'utf8');
const browserGlobal = { console };
browserGlobal.self = browserGlobal;
browserGlobal.window = browserGlobal;
vm.runInNewContext(source, browserGlobal, { filename: katexAssets[0] });

const katex = browserGlobal.katex;
assert.equal(typeof katex?.renderToString, 'function', 'Production KaTeX asset did not expose renderToString.');

const formula = String.raw`D(N)=\sum_{p_1+p_2=N}\Lambda(p_1)\Lambda(p_2),\quad \mathfrak{S}(N)\frac{N}{\ln^2 N}`;
const html = katex.renderToString(formula, { displayMode: true, throwOnError: false });

assert.doesNotMatch(html, /katex-error|color:#cc0000/);
assert.match(html, /<annotation encoding="application\/x-tex">/);
assert.match(html, /∑|sum/);

console.log(`Verified production KaTeX renderer: ${katexAssets[0]}`);
