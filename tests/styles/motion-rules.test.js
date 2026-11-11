import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

// The rules of motion (docs/superpowers/specs/2026-11-11-interaction-overhaul-design.md §3) that a style file must keep, so the hand-typed curves, the slow starts and the sticky hover of a
// touch screen do not grow back one file at a time.

const DIR = new URL('../../src/styles/', import.meta.url);
const files = readdirSync(DIR).filter((name) => name.endsWith('.css') && name !== 'tokens.css');
const parse = (name) => postcss.parse(readFileSync(new URL(name, DIR), 'utf8'));

test('a style names its curves from tokens.css and never writes one of its own', () => {
  for (const name of files) {
    assert.doesNotMatch(readFileSync(new URL(name, DIR), 'utf8'), /cubic-bezier\(/, `${name} has a hand-typed curve: use var(--ease-out), var(--ease-in-out) or var(--ease-drawer)`);
  }
  const tokens = readFileSync(new URL('tokens.css', DIR), 'utf8');
  assert.match(tokens, /--ease-out:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  assert.match(tokens, /--ease-in-out:\s*cubic-bezier\(0\.77, 0, 0\.175, 1\)/);
  assert.match(tokens, /--ease-drawer:\s*cubic-bezier\(0\.32, 0\.72, 0, 1\)/);
});

test('nothing transitions "all" and nothing starts slowly (ease-in) in the interface', () => {
  for (const name of files) {
    const css = readFileSync(new URL(name, DIR), 'utf8');
    assert.doesNotMatch(css, /transition:\s*all\b/, `${name} transitions all`);
    assert.doesNotMatch(css, /(^|[\s,:])ease-in(?![-\w])/m, `${name} uses ease-in`);
  }
});

test('a :hover rule only applies where the device can hover, so a tap on a touch screen leaves nothing lit', () => {
  // A rule that shows something that is hidden until it is pointed at is left as it is (it has no other way to be shown on a touch screen).
  const REVEALS = new Set(['chat.css']);
  const loose = [];
  for (const name of files) {
    if (REVEALS.has(name)) continue;
    parse(name).walkRules((rule) => {
      if (!rule.selector.includes(':hover')) return;
      for (let node = rule.parent; node; node = node.parent) {
        if (node.type === 'atrule' && /hover:\s*(hover|none)/.test(node.params)) return;
        if (node.type === 'atrule' && /keyframes/.test(node.name)) return;
      }
      loose.push(`${name}: ${rule.selector.slice(0, 80)}`);
    });
  }
  assert.deepEqual(loose, []);
});

test('the shortcut flag, the reduced-motion rule and the floor of a phone are in the global style', () => {
  const layout = readFileSync(new URL('layout.css', DIR), 'utf8');
  assert.match(layout, /html\.is-instant \*/);
  assert.match(layout, /prefers-reduced-motion: reduce/);
  assert.match(layout, /-webkit-tap-highlight-color:\s*transparent/);
  assert.match(layout, /touch-action:\s*manipulation/);
});

test('the store of the Nouras scrolls, and the action sheet of the projects keeps coming after the rule of every sheet (order decides between rules of one weight)', () => {
  const base = readFileSync(new URL('base.css', DIR), 'utf8');
  assert.match(base, /main#store-main-content\.flex-1\s*\{[^}]*overflow-y:\s*auto/);
  const projects = readFileSync(new URL('projects.css', DIR), 'utf8');
  assert.doesNotMatch(projects, /@import/, 'a rule moved to another file lands before the rules that used to be above it');
  assert.ok(projects.indexOf('.pj-sheet {') < projects.indexOf('.pj-action-sheet {'));
});

test('the page cannot be zoomed by an input: the viewport keeps maximum-scale=1 and the pinch guard stays', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /name="viewport"[^>]*maximum-scale=1\.0/);
  const guards = readFileSync(new URL('../../src/pwa/touch-guards.js', import.meta.url), 'utf8');
  assert.match(guards, /gesturestart/);
});
