import assert from 'node:assert/strict';
import test from 'node:test';

import { createSingleModelResponseLifecycle } from '../src/app/legacy-runtime/features/single-model-response-lifecycle.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';
import { liftSandboxRunBlock, summarizeSandboxRunText } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { createSandboxRunElement } from '../src/app/ui/sandbox/sandbox-run-view.js';
import { createThinkingBlock } from '../src/app/ui/thinking/thinking-block.js';
import { fillThinkingText } from '../src/app/ui/thinking/thinking-text.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const bubble = (document) => {
  const host = document.createElement('div');
  const answer = document.createElement('div');
  answer.className = 'message-content';
  host.append(answer);
  document.body.append(host);
  return { host, answer };
};

test('thought summaries show their headings in bold, and nothing else is treated as markup', () => {
  const { window, cleanup } = createDom('');
  try {
    const node = window.document.createElement('pre');
    fillThinkingText(window.document, node, '**Plan**\nDo <b>this</b> then **that**');
    assert.deepEqual([...node.querySelectorAll('strong')].map((item) => item.textContent), ['Plan', 'that']);
    assert.equal(node.querySelector('b'), null);
    assert.equal(node.textContent, 'Plan\nDo <b>this</b> then that');
  } finally {
    cleanup();
  }
});

test('the thinking line streams open above the answer and folds to how long it took', () => {
  const { window, cleanup } = createDom('');
  try {
    const { document } = window;
    const { host, answer } = bubble(document);
    let clock = 0;
    const block = createThinkingBlock({ document, host, before: answer, language: 'en', now: () => clock });
    assert.equal(host.firstElementChild.classList.contains('ledger'), true, 'above the answer');
    assert.equal(host.querySelector('.ledger-label').textContent, sandboxText('en', 'thinkingLive'));
    block.add('**Plan**\n', 'summary');
    block.add('Read the file.', 'summary');
    assert.equal(host.querySelector('.ledger-thought').textContent, 'Plan\nRead the file.');
    assert.equal(host.querySelector('.ledger-body').hidden, false, 'open while it thinks');
    clock = 12_400;
    block.collapse();
    assert.equal(host.querySelector('.ledger-label').textContent, sandboxText('en', 'thinkingDoneSummary', { s: 12 }));
    assert.equal(host.querySelector('.ledger-body').hidden, true, 'folded when the answer starts');
    block.add('late', 'raw');
    assert.equal(host.querySelector('.ledger-thought').textContent, 'Plan\nRead the file.', 'nothing more is added afterwards');
    block.remove();
    assert.equal(host.querySelector('.ledger'), null);
  } finally {
    cleanup();
  }
});

test('an ordinary reply keeps the model\'s thinking in its run record and shows it after a reload', async () => {
  const { window, cleanup } = createDom('');
  try {
    const { document } = window;
    const { host, answer } = bubble(document);
    let clock = 1000;
    const seen = [];
    const lifecycle = createSingleModelResponseLifecycle({
      now: () => (clock += 1000),
      getOutputMode: () => 'playback',
      renderSingleModelProgress: () => '',
      startProgressTicker: () => 1,
      stopProgressTicker: () => {},
      buildSingleModelTranslatedRequestParts: async (parts) => parts,
      streamApiCall: async (parts, onChunk, signal, forced, options) => {
        options.onReasoning('**Plan**\n', 'summary');
        seen.push(host.querySelector('.ledger-thought')?.textContent);
        options.onReasoning('Read it.', 'summary');
        onChunk('Answer');
        seen.push(host.querySelector('.ledger-body')?.hidden);
        return 'Answer';
      },
      streamMarkdownResponse: async () => '',
      playbackStreamingMarkdownResponse: async () => {},
      renderIncrementalResponse: () => {},
      getOpenCouncilDetailKeys: () => new Set(),
      restoreOpenCouncilDetails: () => {},
      getDocument: () => document
    });
    const result = await lifecycle.run({
      targetElement: answer,
      userParts: [{ text: 'Hi' }],
      modelInfo: { id: 'm', name: 'M' },
      conversation: { model: 'm' },
      signal: new AbortController().signal,
      uiLanguage: 'en'
    });
    assert.deepEqual(seen, ['Plan\n', true], 'streamed live, then folded once the answer began');
    assert.equal(host.querySelector('.ledger'), null, 'the live line is replaced by the saved one');
    const { run, text } = liftSandboxRunBlock(result.fullResponse);
    assert.equal(text, 'Answer');
    assert.equal(run.thought, '**Plan**\nRead it.');
    assert.equal(run.thoughtKind, 'summary');
    assert.ok(run.thoughtMs >= 1000);
    assert.deepEqual(run.steps, []);
    assert.equal(summarizeSandboxRunText(result.fullResponse), 'Answer', 'the model never reads its own thinking back');
    // After a reload the saved line is drawn from the run record.
    const view = createSandboxRunElement(document, run, { language: 'en' });
    assert.equal(view.querySelector('summary').textContent, sandboxText('en', 'thinkingDoneSummary', { s: Math.round(run.thoughtMs / 1000) }));
    assert.equal(view.querySelector('.sandbox-run-thought-text').textContent, 'Plan\nRead it.');
    assert.equal(view.querySelector('strong').textContent, 'Plan');
  } finally {
    cleanup();
  }
});
