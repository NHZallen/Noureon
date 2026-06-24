import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRuntimeRenderCoordinator } from '../src/app/legacy-runtime/runtime/runtime-render-coordinator.js';

const createOrderedCoordinator = (calls, overrides = {}) => createRuntimeRenderCoordinator({
  renderHistorySidebar: () => calls.push('renderHistorySidebar'),
  renderFolders: () => calls.push('renderFolders'),
  renderAstras: () => calls.push('renderAstras'),
  renderChat: () => calls.push('renderChat'),
  renderArchivedChats: () => calls.push('renderArchivedChats'),
  renderBatchActionBar: () => calls.push('renderBatchActionBar'),
  renderFilePreviews: () => calls.push('renderFilePreviews'),
  applyLanguage: () => calls.push('applyLanguage'),
  ...overrides
});

test('renderAll calls legacy render callbacks in order', () => {
  const calls = [];
  createOrderedCoordinator(calls).renderAll();

  assert.deepEqual(calls, [
    'renderHistorySidebar',
    'renderFolders',
    'renderAstras',
    'renderChat',
    'renderArchivedChats',
    'renderBatchActionBar',
    'renderFilePreviews',
    'applyLanguage'
  ]);
});

test('repeated renderAll calls preserve legacy order', () => {
  const calls = [];
  const coordinator = createOrderedCoordinator(calls);

  coordinator.renderAll();
  coordinator.renderAll();

  assert.deepEqual(calls, [
    'renderHistorySidebar',
    'renderFolders',
    'renderAstras',
    'renderChat',
    'renderArchivedChats',
    'renderBatchActionBar',
    'renderFilePreviews',
    'applyLanguage',
    'renderHistorySidebar',
    'renderFolders',
    'renderAstras',
    'renderChat',
    'renderArchivedChats',
    'renderBatchActionBar',
    'renderFilePreviews',
    'applyLanguage'
  ]);
});

test('missing render callback is skipped with explicit warning', () => {
  const calls = [];
  const warnings = [];
  const coordinator = createOrderedCoordinator(calls, {
    renderFolders: undefined,
    logger: { warn: (message) => warnings.push(message) }
  });

  coordinator.renderAll();

  assert.deepEqual(calls, [
    'renderHistorySidebar',
    'renderAstras',
    'renderChat',
    'renderArchivedChats',
    'renderBatchActionBar',
    'renderFilePreviews',
    'applyLanguage'
  ]);
  assert.deepEqual(warnings, ['[runtime-render-coordinator] Missing render callback: renderFolders']);
});

test('callback wrappers can resolve latest backing renderer', () => {
  const calls = [];
  let renderChat = () => calls.push('initialRenderChat');
  const coordinator = createOrderedCoordinator(calls, {
    renderChat: () => renderChat()
  });

  coordinator.renderAll();
  renderChat = () => calls.push('replacementRenderChat');
  coordinator.renderAll();

  assert.deepEqual(
    calls.filter(name => name.endsWith('RenderChat')),
    ['initialRenderChat', 'replacementRenderChat']
  );
});

test('runtime render coordinator source stays render-composition only', () => {
  const source = readFileSync(new URL('../src/app/legacy-runtime/runtime/runtime-render-coordinator.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b|innerHTML|addEventListener|requestAnimationFrame|setTimeout/);
  assert.doesNotMatch(source, /streamApiCall|indexedDB|localStorage|sessionStorage|package\.json|vite\.config/);
  assert.doesNotMatch(source, /DOMPurify|marked|katex|Peer|Html5Qrcode|QRCode/);
});
