import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMessageRenderView } from '../src/app/legacy-runtime/features/message-markup-renderer.js';
import { renderUserText } from '../src/app/runtime/legacy-core/legacy-core-utilities.js';
import { readSource } from './helpers/source-guards.js';

test('table-like user input stays escaped text in the normal user bubble', () => {
  const tableText = 'Analyze this data:\n| Month | Value |\n| --- | ---: |\n| Jan | 120 |';
  const view = buildMessageRenderView({
    message: { role: 'user', parts: [{ text: tableText }] },
    renderUserText,
    renderMarkdownWithFormulas: () => '<div class="ac-chart">unexpected</div>',
    buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }),
    formatTimestamp: () => '',
    copyTitle: 'Copy'
  });

  assert.match(view.messageClassName, /user-message/);
  assert.match(view.messageHTML, /message-stack-user/);
  assert.match(view.messageHTML, /\| Month \| Value \|/);
  assert.doesNotMatch(view.messageHTML, /<table|ac-chart/);
});

test('user message bubble keeps content-sized rounded layout for long table-like text', () => {
  const css = readSource('src/styles/modals.css');

  assert.match(css, /\.user-message \.message-bubble::before\s*\{[\s\S]*?border-radius:\s*1\.25rem;/);
  assert.doesNotMatch(css, /\.user-message \.message-bubble::before\s*\{[\s\S]*?border-radius:\s*9999px;/);
  assert.match(css, /\.user-message \.message-bubble\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?max-width:\s*min\(34rem, 88vw\);/);
  assert.match(css, /\.user-message \.message-content\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/);
  assert.match(css, /\.user-message \.message-content \.table-scroll-container\s*\{[\s\S]*?overflow-x:\s*auto;/);
});

test('chart CSS selectors are scoped to model messages only', () => {
  const css = readSource('src/styles/charts.css');
  const selectorLines = css.split(/\r?\n/).filter((line) => line.trimStart().startsWith('.ac-chart'));

  assert.deepEqual(selectorLines, []);
  assert.match(css, /\.model-message \.ac-chart\s*\{/);
  assert.doesNotMatch(css, /\.user-message \.ac-chart/);
  assert.doesNotMatch(css, /dark|data-theme/i);
});
