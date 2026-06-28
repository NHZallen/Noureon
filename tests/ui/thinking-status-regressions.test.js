import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectFile = (path) => new URL(`../../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('thinking status uses a boundary-free shimmer with reduced-motion support', () => {
  const chatCSS = readSource('src/styles/chat.css');
  const indicatorRule = chatCSS.match(/\.assistant-thinking-indicator\s*\{[^}]*\}/s)?.[0] || '';

  assert.match(indicatorRule, /display:\s*inline-flex/);
  assert.doesNotMatch(indicatorRule, /border|box-shadow|background/);
  assert.match(chatCSS, /\.assistant-thinking-text[^{]*\{[^}]*background:[^;]*linear-gradient[^}]*animation:\s*thinking-highlight/s);
  assert.match(chatCSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.assistant-thinking-text[^{]*\{[^}]*animation:\s*none/s);
  assert.doesNotMatch(chatCSS, /\.assistant-thinking-(?:indicator|text)[^{]*\{[^}]*!important/s);
});

test('council status groups stay boundary-free and animate disclosure height', () => {
  const councilCSS = readSource('src/styles/model-council.css');
  const statusRule = councilCSS.match(/\.council-status\s*\{[^}]*\}/s)?.[0] || '';
  const groupRule = councilCSS.match(/\.council-status-group\s*\{[^}]*\}/s)?.[0] || '';

  assert.ok(statusRule);
  assert.ok(groupRule);
  assert.doesNotMatch(`${statusRule}\n${groupRule}`, /border|box-shadow|background/);
  assert.match(councilCSS, /\.council-status-body-shell[^{]*\{[^}]*grid-template-rows:\s*0fr[^}]*transition:[^}]*grid-template-rows/s);
  assert.match(councilCSS, /\.council-status-group\.is-open\s+\.council-status-body-shell[^{]*\{[^}]*grid-template-rows:\s*1fr/s);
  assert.doesNotMatch(councilCSS, /\.council-status(?:-|\s)[^{]*\{[^}]*!important/s);
});
