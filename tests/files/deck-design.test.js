import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamApiCall } from '../../src/app/legacy-runtime/features/stream-api-call.js';
import { createDeckDesignControl, normalizeDeckDesign } from '../../src/app/runtime/features/deck-design-control.js';
import { DESIGN_PARAM_KEYS } from '../../src/app/ui/files/design/design-params.js';
import { DESIGN_PRESET_IDS, getPresetText } from '../../src/app/ui/files/design/design-presets.js';
import { renderDeckDesignPicker } from '../../src/app/ui/files/design/deck-design-picker.js';
import { getFileAuthoringGuidance } from '../../src/app/ui/files/file-authoring-guidance.js';
import { getFileText } from '../../src/app/ui/files/file-texts.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];

test('AI adaptive guidance asks the model to set every design parameter', async () => {
  const guidance = await getFileAuthoringGuidance();
  assert.match(guidance, /AI adaptive/);
  for (const key of DESIGN_PARAM_KEYS) assert.match(guidance, new RegExp(`- ${key}:`), key);
  assert.equal(guidance, await getFileAuthoringGuidance({ deckDesign: 'not-a-preset' }), 'unknown choices fall back to AI adaptive');
  assert.doesNotMatch(guidance, /"designs"/);
});

test('a chosen template is written as that preset, without the parameter list', async () => {
  const guidance = await getFileAuthoringGuidance({ deckDesign: 'consulting' });
  assert.match(guidance, /the user chose the "consulting" template/);
  assert.match(guidance, /"design": \{ "preset": "consulting" \}/);
  assert.doesNotMatch(guidance, /AI adaptive/);
  assert.doesNotMatch(guidance, /- typeScale:/);
});

test('the conversation\'s design choice reaches the model with the file guidance', async () => {
  const requests = [];
  const conversation = { model: 'm', deckDesign: 'poster', messages: [{ role: 'user', parts: [{ text: '幫我做一份簡報 pptx' }] }] };
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => ({ id: 'm', apiId: 'or/m', name: 'M', provider: 'openrouter' }),
    getModelApiId: (model) => model.apiId,
    getApiKeyForProvider: () => 'key',
    getDefaultGenConfig: () => ({ temperature: null, topP: null, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'zh-TW', isLearningMode: false, memoryEnabled1: false }),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'));
            controller.close();
          }
        })
      };
    },
    warn: () => {}
  });
  await streamApiCall([{ text: '幫我做一份簡報 pptx' }], () => {}, undefined, false, { conversation });
  const system = requests[0].messages.find((message) => message.role === 'system')?.content || '';
  assert.match(system, /the user chose the "poster" template/);
});

test('the composer control shows and saves the conversation\'s choice', async () => {
  const { document, cleanup } = createDom('<div id="file-input-container"><button id="add-file-btn"></button></div>');
  try {
    let conversation = { id: 'a', messages: [] };
    let saves = 0;
    const control = createDeckDesignControl({
      document,
      getActiveConversation: () => conversation,
      saveAppData: async () => { saves += 1; },
      getUiLanguage: () => 'en',
      loadPicker: async () => ({ renderDeckDesignPicker: () => ({ setCurrent() {} }) })
    });
    control.render();
    const button = document.getElementById('deck-design-btn');
    assert.equal(button.parentElement.parentElement.id, 'file-input-container', 'sits next to the attachment button');
    assert.equal(document.querySelector('.deck-design-label').textContent, 'Presentation design', 'the button always reads Presentation design');
    assert.equal(button.title, 'Presentation design: AI adaptive');
    assert.equal(button.querySelector('svg:not(.deck-design-chevron)'), null, 'no icon before the label');
    assert.equal(button.disabled, false);

    await control.choose('neon');
    assert.equal(conversation.deckDesign, 'neon');
    assert.equal(saves, 1);
    assert.equal(document.querySelector('.deck-design-label').textContent, 'Presentation design');
    assert.equal(button.title, `Presentation design: ${getPresetText('neon', 'en').name}`);

    conversation = { id: 'b', messages: [] };
    control.render();
    assert.equal(button.title, 'Presentation design: AI adaptive', 'each conversation keeps its own choice');
    conversation = null;
    control.render();
    assert.equal(button.disabled, true);
    assert.equal(document.querySelectorAll('#deck-design-control').length, 1, 'rendering again reuses the control');
    assert.equal(normalizeDeckDesign('office'), 'office');
    assert.equal(normalizeDeckDesign(undefined), 'auto');
  } finally {
    cleanup();
  }
});

test('the picker offers AI adaptive and every template, in all five languages', () => {
  for (const language of LANGUAGES) {
    const { document, window, cleanup } = createDom('<div id="picker"></div>');
    try {
      const chosen = [];
      const container = document.getElementById('picker');
      const picker = renderDeckDesignPicker(container, { document, window, language, current: 'auto', onChoose: (value) => chosen.push(value) });
      const options = container.querySelectorAll('[data-deck-design]');
      assert.equal(options.length, DESIGN_PRESET_IDS.length + 1);
      assert.equal(container.querySelector('[aria-pressed="true"]').dataset.deckDesign, 'auto');
      assert.equal(container.querySelector('.deck-design-auto-name').textContent, getFileText(language, 'deckDesignAuto'));
      container.querySelector('[data-deck-design="bauhaus"]').click();
      assert.deepEqual(chosen, ['bauhaus']);
      picker.setCurrent('bauhaus');
      assert.equal(container.querySelector('[aria-pressed="true"]').dataset.deckDesign, 'bauhaus');
      for (const key of ['deckDesign', 'deckDesignAuto', 'deckDesignAutoHint', 'deckDesignIntro', 'deckDesignTemplates', 'deckSampleTitle']) {
        const value = getFileText(language, key);
        assert.ok(value && value !== key, `${key} ${language}`);
      }
    } finally {
      cleanup();
    }
  }
});

test('a spec with only offered "designs" uses the first one', async () => {
  const { parseDocumentSpec } = await import('../../src/app/ui/files/design/document-spec.js');
  const { normalizeDesign } = await import('../../src/app/ui/files/design/design-params.js');
  const slides = [{ layout: 'cover', title: 'x' }];
  const { spec } = parseDocumentSpec(JSON.stringify({ designs: [{ preset: 'neon' }, { preset: 'office' }], slides }));
  assert.deepEqual({ ...spec.design }, { ...normalizeDesign({ preset: 'neon' }).design });
  const chosen = parseDocumentSpec(JSON.stringify({ design: { preset: 'office' }, designs: [{ preset: 'neon' }], slides })).spec;
  assert.deepEqual({ ...chosen.design }, { ...normalizeDesign({ preset: 'office' }).design });
});

test('the picker never takes layout space and always fits on screen', async () => {
  const { document, window, cleanup } = createDom('<div id="file-input-container"></div>');
  try {
    const control = createDeckDesignControl({
      document,
      window,
      getActiveConversation: () => ({ id: 'a', messages: [] }),
      saveAppData: async () => {},
      getUiLanguage: () => 'zh-TW',
      loadPicker: async () => ({ renderDeckDesignPicker: () => ({ setCurrent() {} }) })
    });
    control.render();
    const button = document.getElementById('deck-design-btn');
    const popover = document.getElementById('deck-design-popover');
    assert.equal(popover.style.position, 'absolute', 'positioned before the picker stylesheet loads');
    assert.equal(document.getElementById('deck-design-control').style.alignItems, 'center');

    const open = async (top) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1046 });
      button.getBoundingClientRect = () => ({ top, bottom: top + 36, left: 540, right: 640, width: 100, height: 36 });
      popover.classList.remove('visible');
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { bottom: popover.style.bottom, top: popover.style.top, maxHeight: Number.parseFloat(popover.style.maxHeight), visible: popover.classList.contains('visible') };
    };
    const centred = await open(517);
    assert.equal(centred.visible, true);
    assert.equal(centred.bottom, '100%', 'opens above a centred composer');
    assert.ok(centred.maxHeight <= 517 - 20, 'and fits in the space above it');
    const nearTop = await open(120);
    assert.equal(nearTop.top, '100%', 'opens below when there is little room above');
    assert.ok(nearTop.maxHeight <= 1046 - 156 - 20);
  } finally {
    cleanup();
  }
});
