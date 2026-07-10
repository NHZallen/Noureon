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

test('desktop quote UI is limited to model output, clamps both previews, and restores the source range', () => {
  const lifecycle = readUiSource('src/app/legacy-runtime/features/quote-inquiry-lifecycle.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(lifecycle, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(lifecycle, /\.model-message \.message-content/);
  assert.doesNotMatch(lifecycle, /\.user-message \.message-content/);
  assert.match(lifecycle, /sourceMessage\?\.role !== 'model'/);
  assert.match(lifecycle, /selection\?\.addRange\?\.\(range\)/);
  assert.match(lifecycle, /elements\.chatContainer\.scrollTo/);
  assert.match(css, /\.quote-inquiry-text,\s*\.sent-message-quote-text[^{]*\{[^}]*-webkit-line-clamp:\s*3;/s);
  assert.match(css, /\.sent-message-quote:hover,\s*\.sent-message-quote:focus-visible[^{]*\{[^}]*color:\s*#111827;/s);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quote-inquiry-menu,[\s\S]*\.quote-inquiry-bar[^{]*\{[^}]*display:\s*none;/s);
});
