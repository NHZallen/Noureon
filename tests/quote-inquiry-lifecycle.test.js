import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuotedUserParts,
  getQuoteReferenceFromMessage,
  getVisibleUserText
} from '../src/app/legacy-runtime/features/quote-inquiry-lifecycle.js';
import { readUiSource } from './helpers/source-guards.js';

const getText = (key, fallback) => ({
  quoteInquiryReferenceLabel: 'Reference',
  quoteInquiryContextInstruction: 'Use the reference to answer.',
  quoteInquiryDefaultQuestion: 'Explain it.'
})[key] || fallback;

test('quoted user parts keep display text separate from persistent model context', () => {
  const parts = buildQuotedUserParts({
    question: 'What does it mean?',
    quoteReference: {
      text: '  A\nselected\tresponse.  ',
      sourceMessageIndex: 4,
      sourceMessageId: 'message-4',
      sourceTextOffset: 120
    },
    getText
  });

  assert.deepEqual(parts[0], {
    text: 'What does it mean?',
    displayText: 'What does it mean?'
  });
  assert.equal(parts[1].text, 'Reference:\n「A selected response.」\n\nUse the reference to answer.');
  assert.equal(parts[1].quoteContext, true);
  assert.deepEqual(parts[1].quoteReference, {
    text: 'A selected response.',
    sourceMessageIndex: 4,
    sourceMessageId: 'message-4',
    sourceTextOffset: 120
  });
  assert.equal(getVisibleUserText({ parts }), 'What does it mean?');
  assert.deepEqual(getQuoteReferenceFromMessage({ parts }), parts[1].quoteReference);
});

test('quote-only submission receives a visible default question', () => {
  const parts = buildQuotedUserParts({
    quoteReference: { text: 'Selected model text', sourceMessageIndex: 1 },
    getText
  });

  assert.equal(parts[0].displayText, 'Explain it.');
  assert.doesNotMatch(getVisibleUserText({ parts }), /Selected model text/);
});

test('desktop quote UI keeps the action blue on white and quote previews gray with arrows', () => {
  const lifecycle = readUiSource('src/app/legacy-runtime/features/quote-inquiry-lifecycle.js');
  const css = readUiSource('src/styles/main.css');
  const selectionMenuSource = lifecycle.slice(
    lifecycle.indexOf('const createSelectionMenu = () => {'),
    lifecycle.indexOf('const bind = () => {')
  );

  assert.match(lifecycle, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(lifecycle, /\.model-message \.message-content/);
  assert.doesNotMatch(lifecycle, /\.user-message \.message-content/);
  assert.match(lifecycle, /sourceMessage\?\.role !== 'model'/);
  assert.doesNotMatch(lifecycle, /addRange/);
  assert.match(lifecycle, /quote-inquiry-icon/);
  assert.match(lifecycle, /icon\.textContent = '↳'/);
  assert.match(lifecycle, /quoteTextElement\.textContent = text \? `“ \$\{text\} ”` : '';/);
  assert.match(selectionMenuSource, /button\.textContent = getText\('quoteInquiry'/);
  assert.doesNotMatch(selectionMenuSource, /↳|<svg|button\.innerHTML/);
  assert.match(lifecycle, /elements\.chatContainer\.scrollTo/);
  assert.match(css, /\.quote-inquiry-text,\s*\.sent-message-quote-text[^{]*\{[^}]*-webkit-line-clamp:\s*3;/s);
  assert.match(css, /\.quote-inquiry-menu-button[^{]*\{[^}]*background:\s*var\(--modal-bg\);[^}]*color:\s*var\(--button-primary-bg\);/s);
  assert.match(css, /\.quote-inquiry-menu-button:hover,\s*\.quote-inquiry-menu-button:focus-visible,\s*\.quote-inquiry-menu-button:active[^{]*\{[^}]*background:\s*var\(--modal-bg\);/s);
  assert.match(css, /\.quote-inquiry-bar[^{]*\{[^}]*color:\s*#8b9098;/s);
  assert.match(css, /\.sent-message-quote[^{]*\{[^}]*width:\s*fit-content;[^}]*margin-left:\s*auto;[^}]*color:\s*#8b9098;[^}]*display:\s*grid;/s);
  assert.match(css, /\.sent-message-quote:hover,\s*\.sent-message-quote:focus-visible[^{]*\{[^}]*color:\s*#111827;/s);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quote-inquiry-menu,[\s\S]*\.quote-inquiry-bar[^{]*\{[^}]*display:\s*none;/s);
});
