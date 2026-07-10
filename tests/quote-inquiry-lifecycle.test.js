import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuotedUserParts,
  getQuoteReferenceFromMessage,
  getVisibleUserText
} from '../src/app/legacy-runtime/features/quote-inquiry-lifecycle.js';
import * as quoteInquiryLifecycle from '../src/app/legacy-runtime/features/quote-inquiry-lifecycle.js';
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

test('temporary source highlight changes text color without creating a browser selection', () => {
  assert.equal(typeof quoteInquiryLifecycle.highlightRangeTemporarily, 'function');

  const sourceRange = {};
  let timerId = 0;
  const timers = new Map();
  const clearedTimers = [];
  const highlights = new Map();
  let selectionCalls = 0;
  class FakeHighlight {
    constructor(...ranges) {
      this.ranges = ranges;
    }
  }
  const fakeWindow = {
    CSS: { highlights },
    Highlight: FakeHighlight,
    getSelection: () => { selectionCalls += 1; },
    setTimeout: (callback, duration) => {
      timerId += 1;
      timers.set(timerId, { callback, duration });
      return timerId;
    },
    clearTimeout: id => { clearedTimers.push(id); timers.delete(id); }
  };

  const cancelFirst = quoteInquiryLifecycle.highlightRangeTemporarily({
    window: fakeWindow,
    range: sourceRange
  });
  const firstHighlight = highlights.get('quote-source-flash');
  assert.ok(firstHighlight);
  assert.equal(firstHighlight.ranges[0], sourceRange);
  assert.equal(timers.get(1).duration, 1200);
  assert.equal(selectionCalls, 0);
  timers.get(1).callback();
  assert.equal(highlights.has('quote-source-flash'), false);

  const cancelSecond = quoteInquiryLifecycle.highlightRangeTemporarily({
    window: fakeWindow,
    range: sourceRange
  });
  const newerHighlight = { ranges: [{}] };
  highlights.set('quote-source-flash', newerHighlight);
  timers.get(2).callback();
  assert.equal(highlights.get('quote-source-flash'), newerHighlight);

  cancelFirst();
  cancelSecond();
  assert.equal(highlights.get('quote-source-flash'), newerHighlight);
  assert.deepEqual(clearedTimers, [1, 2]);
});

test('desktop quote UI uses curved SVG arrows and turns the action blue only on hover', () => {
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
  assert.match(lifecycle, /highlightRangeTemporarily/);
  assert.doesNotMatch(lifecycle, /addRange/);
  assert.match(lifecycle, /quote-inquiry-icon/);
  assert.doesNotMatch(lifecycle, /↳/);
  assert.match(lifecycle, /M6 4v4\.5A4\.5 4\.5 0 0 0 10\.5 13H18/);
  assert.match(lifecycle, /stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(lifecycle, /quoteTextElement\.textContent = text \? `“ \$\{text\} ”` : '';/);
  assert.match(selectionMenuSource, /button\.textContent = getText\('quoteInquiry'/);
  assert.doesNotMatch(selectionMenuSource, /<svg|button\.innerHTML/);
  assert.match(lifecycle, /elements\.chatContainer\.scrollTo/);
  assert.match(css, /\.quote-inquiry-text,\s*\.sent-message-quote-text[^{]*\{[^}]*-webkit-line-clamp:\s*3;/s);
  assert.match(css, /\.quote-inquiry-menu-button[^{]*\{[^}]*background:\s*var\(--modal-bg\);[^}]*color:\s*var\(--text-primary\);/s);
  assert.match(css, /\.quote-inquiry-menu-button:hover,\s*\.quote-inquiry-menu-button:focus-visible[^{]*\{[^}]*background:\s*var\(--modal-bg\);[^}]*color:\s*var\(--button-primary-bg\);/s);
  assert.match(css, /\.quote-inquiry-menu-button:active[^{]*\{[^}]*background:\s*var\(--modal-bg\);/s);
  assert.match(css, /\.quote-inquiry-bar[^{]*\{[^}]*color:\s*#8b9098;/s);
  assert.match(css, /\.sent-message-quote[^{]*\{[^}]*width:\s*fit-content;[^}]*margin-left:\s*auto;[^}]*color:\s*#8b9098;[^}]*display:\s*grid;/s);
  assert.match(css, /\.sent-message-quote:hover,\s*\.sent-message-quote:focus-visible[^{]*\{[^}]*color:\s*#111827;/s);
  assert.match(css, /\.quote-inquiry-icon[^{]*\{[^}]*color:\s*#8b9098;/s);
  assert.match(css, /\.sent-message-quote-icon[^{]*\{[^}]*color:\s*#8b9098;/s);
  assert.match(css, /\.sent-message-quote:hover \.sent-message-quote-icon,\s*\.sent-message-quote:focus-visible \.sent-message-quote-icon[^{]*\{[^}]*color:\s*#111827;/s);
  assert.match(css, /::highlight\(quote-source-flash\)[^{]*\{[^}]*color:\s*var\(--button-primary-bg\);[^}]*background-color:\s*transparent;/s);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quote-inquiry-menu,[\s\S]*\.quote-inquiry-bar[^{]*\{[^}]*display:\s*none;/s);
});

test('localized quote instructions require direct answers without citation prefaces', () => {
  const zhTW = readUiSource('src/data/i18n/zh-TW.js');
  const english = readUiSource('src/data/i18n/en.js');
  const french = readUiSource('src/data/i18n/fr.js');

  assert.doesNotMatch(zhTW, /請根據這段引用內容回答/);
  assert.match(zhTW, /不要以「根據引用內容」/);
  assert.match(english, /Do not mention the quote or begin with a phrase that describes the source/);
  assert.match(french, /Ne mentionnez pas la citation et ne commencez pas par une phrase décrivant la source/);
});
