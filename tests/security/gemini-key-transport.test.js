import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectFile = (path) => new URL(`../../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const requestBuilderPaths = [
  'src/app/legacy-runtime/features/stream-api-call.js',
  'src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js',
  'src/app/runtime/legacy-core/settings-provider-structured-helpers.js',
  'src/app/runtime/legacy-core/settings-title-summary-helpers.js'
];

test('Gemini request builders keep API keys out of request URLs', () => {
  for (const path of requestBuilderPaths) {
    const source = readSource(path);

    assert.doesNotMatch(source, /:generateContent\?key=/, `${path} must not put Gemini keys in generateContent URLs`);
    assert.doesNotMatch(source, /:streamGenerateContent\?key=/, `${path} must not put Gemini keys in stream URLs`);
    assert.doesNotMatch(source, /\?key=\$\{apiKey\}/, `${path} must not interpolate apiKey into URLs`);
    assert.doesNotMatch(source, /generateContent\?key/, `${path} must not build query-key Gemini URLs`);
  }
});

test('Gemini request builders use x-goog-api-key header transport', () => {
  const streamSource = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  const structuredHelperSource = readSource('src/app/runtime/legacy-core/settings-provider-structured-helpers.js');

  assert.match(streamSource, /'x-goog-api-key':\s*apiKey/);
  assert.match(structuredHelperSource, /'x-goog-api-key':\s*apiKey/);
  assert.match(streamSource, /:streamGenerateContent`/);
  assert.match(structuredHelperSource, /:generateContent`/);
});
