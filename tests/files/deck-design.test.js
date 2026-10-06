import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamApiCall } from '../../src/app/legacy-runtime/features/stream-api-call.js';
import { createDeckDesignControl, normalizeDeckDesign } from '../../src/app/runtime/features/deck-design-control.js';
import { DESIGN_PARAM_KEYS } from '../../src/app/ui/files/design/design-params.js';
import { DESIGN_PRESET_IDS, getPresetText } from '../../src/app/ui/files/design/design-presets.js';
import { DOCUMENT_PRESET_IDS, getDocumentPresetText } from '../../src/app/ui/files/design/document-presets.js';
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
  const deckPart = guidance.slice(guidance.indexOf('## PowerPoint'));
  assert.doesNotMatch(deckPart, /Design \(AI adaptive/);
  assert.doesNotMatch(deckPart, /- motifs:/);
  assert.match(guidance, /even if earlier files in this conversation used another design/);
  assert.match(guidance, /add "accent"/);
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

test('a temporary chat gets no file guidance, whatever design was chosen', async () => {
  const requests = [];
  const conversation = { model: 'm', deckDesign: 'poster', retentionMode: 'ephemeral', messages: [{ role: 'user', parts: [{ text: '幫我做一份簡報 pptx' }] }] };
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
  assert.doesNotMatch(system, /the user chose the "poster" template/);
  assert.doesNotMatch(system, /PowerPoint/, 'no file guidance at all');
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
    assert.equal(document.querySelector('.deck-design-label').textContent, 'Design', 'the button always reads Design');
    assert.equal(button.title, 'Design: Presentations AI adaptive · Word and PDF AI adaptive');
    assert.equal(button.querySelector('svg:not(.deck-design-chevron)'), null, 'no icon before the label');
    assert.equal(button.disabled, false);

    await control.choose('neon');
    assert.equal(conversation.deckDesign, 'neon');
    assert.equal(saves, 1);
    assert.equal(document.querySelector('.deck-design-label').textContent, 'Design');
    assert.equal(button.title, `Design: Presentations ${getPresetText('neon', 'en').name} · Word and PDF AI adaptive`);
    await control.choose('document', 'academic');
    assert.equal(conversation.documentDesign, 'academic');
    assert.equal(conversation.deckDesign, 'neon', 'each kind keeps its own choice');
    assert.match(button.title, /Word and PDF Academic$/);
    await control.choose('document', 'not-a-template');
    assert.equal(conversation.documentDesign, 'auto');

    conversation = { id: 'b', messages: [] };
    control.render();
    assert.equal(button.title, 'Design: Presentations AI adaptive · Word and PDF AI adaptive', 'each conversation keeps its own choice');
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

test('the design control is hidden while an image model is chosen or in a temporary chat, and comes back with a text model', () => {
  const { document, cleanup } = createDom('<div id="file-input-container"><button id="add-file-btn"></button></div>');
  try {
    const conversation = { id: 'a', messages: [] };
    let image = true;
    const control = createDeckDesignControl({
      document,
      getActiveConversation: () => conversation,
      saveAppData: async () => {},
      getUiLanguage: () => 'en',
      isImageChat: () => image,
      loadPicker: async () => ({ renderDeckDesignPicker: () => ({ setCurrent() {} }) })
    });
    control.render();
    assert.equal(document.getElementById('deck-design-control').style.display, 'none');
    image = false;
    control.render();
    assert.equal(document.getElementById('deck-design-control').style.display, 'inline-flex');
    conversation.retentionMode = 'ephemeral';
    control.render();
    assert.equal(document.getElementById('deck-design-control').style.display, 'none', 'a temporary chat makes no files');
    conversation.retentionMode = 'persistent';
    control.render();
    assert.equal(document.getElementById('deck-design-control').style.display, 'inline-flex');
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
      const picker = renderDeckDesignPicker(container, { document, window, language, current: { deck: 'auto' }, onChoose: (kind, value) => chosen.push(`${kind}:${value}`) });
      picker.show('deck');
      const options = container.querySelectorAll('[data-deck-design]');
      assert.equal(options.length, DESIGN_PRESET_IDS.length + 1);
      assert.equal(container.querySelector('[aria-pressed="true"]').dataset.deckDesign, 'auto');
      assert.equal(container.querySelector('.deck-design-auto-name').textContent, getFileText(language, 'deckDesignAuto'));
      container.querySelector('[data-deck-design="bauhaus"]').click();
      assert.deepEqual(chosen, ['deck:bauhaus']);
      picker.setCurrent({ deck: 'bauhaus' });
      assert.equal(container.querySelector('[aria-pressed="true"]').dataset.deckDesign, 'bauhaus');

      // The Word tab: AI adaptive and the 9 document templates.
      container.querySelector('[data-design-kind="document"]').click();
      assert.equal(container.querySelector('[role="tab"][aria-selected="true"]').dataset.designKind, 'document');
      assert.equal(container.querySelectorAll('[data-deck-design]').length, DOCUMENT_PRESET_IDS.length + 1);
      assert.equal(container.querySelector('[aria-pressed="true"]').dataset.deckDesign, 'auto', 'the document choice is separate');
      container.querySelector('[data-deck-design="academic"]').click();
      assert.deepEqual(chosen, ['deck:bauhaus', 'document:academic']);
      for (const id of DOCUMENT_PRESET_IDS) {
        const presetText = getDocumentPresetText(id, language);
        assert.ok(presetText.name && presetText.feature && presetText.fit, id + ' ' + language);
      }
      for (const key of ['design', 'designTabDeck', 'designTabDocument', 'documentDesignAutoHint', 'documentDesignIntro', 'documentSampleHeading', 'deckDesignAuto', 'deckDesignAutoHint', 'deckDesignIntro', 'deckDesignTemplates', 'deckSampleTitle']) {
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

test('a chosen template is enforced on the reply: only its accent colours can change', async () => {
  const { enforceDeckTemplate } = await import('../../src/app/ui/files/design/deck-template-enforcer.js');
  const { parseDocumentSpec } = await import('../../src/app/ui/files/design/document-spec.js');
  const { normalizeDesign } = await import('../../src/app/ui/files/design/design-params.js');
  const fence = '`'.repeat(4);
  const spec = { preset: 'neon', design: { preset: 'playful', mode: 'dark', accent: '#2f6b4f', fonts: 'condensed', tracking: 'wide' }, designs: [{ preset: 'noir' }], title: '鄉村慢旅', slides: [{ layout: 'cover', title: '鄉村慢旅' }] };
  const reply = `童趣版：\n\n${fence}file 鄉村慢旅簡報.pptx\n${JSON.stringify(spec)}\n${fence}\n\n內容不變。`;
  const out = enforceDeckTemplate(reply, 'playful');
  assert.ok(out.startsWith('童趣版：\n\n') && out.endsWith('\n\n內容不變。'));
  const content = out.slice(out.indexOf('\n', out.indexOf('file ')) + 1, out.lastIndexOf(`\n${fence}`));
  const parsed = parseDocumentSpec(content).spec;
  assert.deepEqual({ ...parsed.design }, { ...normalizeDesign({ preset: 'playful', accent: '#2F6B4F' }).design });
  assert.equal(parsed.designs.length, 0, 'offered directions are dropped');
  assert.equal(parsed.slides[0].title, '鄉村慢旅', 'the content is untouched');

  const markdown = `${fence}file a.pptx\n---\ntitle: 年度\nmode: dark\naccent2: "#123456"\nfonts: kai\n---\n# 年度\n\n## 頁\n\n- a\n- b\n${fence}`;
  const mdOut = enforceDeckTemplate(markdown, 'bauhaus');
  assert.match(mdOut, /---\ntitle: 年度\npreset: bauhaus\naccent2: #123456\n---/);
  assert.doesNotMatch(mdOut, /mode: dark|fonts: kai/);
  const exact = `${fence}file b.pptx\n${JSON.stringify({ design: { preset: 'bauhaus' }, slides: [{ layout: 'cover', title: 'x' }] }, null, 2)}\n${fence}`;
  assert.equal(enforceDeckTemplate(exact, 'bauhaus'), exact, 'an exact spec is left alone');
  assert.equal(enforceDeckTemplate('no files here', 'bauhaus'), 'no files here');
});

test('the reply is saved with the template applied and redrawn', async () => {
  const { finalizeAssistantResponse } = await import('../../src/app/legacy-runtime/features/assistant-response-finalization.js');
  const fence = '`'.repeat(4);
  const reply = `好的\n${fence}file deck.pptx\n${JSON.stringify({ design: { preset: 'playful', mode: 'dark' }, slides: [{ layout: 'cover', title: 'x' }] })}\n${fence}`;
  const run = async (deckDesign) => {
    const conversation = { messages: [], deckDesign };
    const targetElement = { dataset: { streamRendered: 'true' }, closest: () => null };
    let rendered = null;
    const message = {};
    await finalizeAssistantResponse({
      fullResponse: reply,
      finalAiMessage: message,
      conversation,
      signal: { aborted: true },
      responseUsesCouncil: false,
      responseRenderedInRealtime: true,
      targetElement,
      uiLanguage: 'zh-TW',
      persistAppData: async () => {},
      completeSingleModelView: async ({ fullResponse }) => { rendered = fullResponse; },
      queueBackgroundTask: () => {}
    });
    return { saved: message.parts[0].text, rendered, flag: targetElement.dataset.streamRendered };
  };
  const templated = await run('playful');
  assert.doesNotMatch(templated.saved, /"mode"/);
  assert.equal(templated.rendered, templated.saved);
  assert.equal(templated.flag, 'false', 'the streamed view is redrawn with the saved spec');
  const adaptive = await run('auto');
  assert.equal(adaptive.saved, reply, 'AI adaptive keeps what the model wrote');
  assert.equal(adaptive.flag, 'true');
});

test('on a phone the picker stays inside the screen horizontally', async () => {
  const { document, window, cleanup } = createDom('<div id="file-input-container"></div>');
  try {
    const control = createDeckDesignControl({
      document,
      window,
      getActiveConversation: () => ({ id: 'a', messages: [] }),
      saveAppData: async () => {},
      loadPicker: async () => ({ renderDeckDesignPicker: () => ({ setCurrent() {} }) })
    });
    control.render();
    const button = document.getElementById('deck-design-btn');
    const popover = document.getElementById('deck-design-popover');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    // The control sits right of the attachment button, 60px from the left edge.
    document.getElementById('deck-design-control').getBoundingClientRect = () => ({ top: 780, bottom: 812, left: 60, right: 160, width: 100, height: 32 });
    Object.defineProperty(popover, 'offsetParent', { configurable: true, get: () => document.getElementById('deck-design-control') });
    button.getBoundingClientRect = () => ({ top: 780, bottom: 812, left: 60, right: 160, width: 100, height: 32 });
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const width = Number.parseFloat(popover.style.width);
    const left = 60 + Number.parseFloat(popover.style.left);
    assert.equal(width, 390 - 24);
    assert.equal(left, 12, 'shifted left to the screen edge');
    assert.ok(left + width <= 390 - 12, 'and ends inside the right edge');
  } finally {
    cleanup();
  }
});

// The Design button felt slow: the picker's code was fetched on the first click and every template was
// drawn again at every opening. It is now fetched ahead, drawn once, and the click always answers.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const pickerControl = (extra = {}) => {
  const { document, window, cleanup } = createDom('<div id="file-input-container"></div>');
  const drawn = [];
  const current = [];
  let language = extra.language || 'en';
  const control = createDeckDesignControl({
    document,
    window,
    getActiveConversation: () => ({ id: 'a', messages: [] }),
    saveAppData: async () => {},
    getUiLanguage: () => language,
    closeAllPopovers: () => document.querySelectorAll('.popover.visible').forEach((node) => node.classList.remove('visible')),
    logError: extra.logError || (() => {}),
    loadPicker: extra.loadPicker || (async () => ({
      renderDeckDesignPicker: (popover, options) => {
        drawn.push(options.language);
        popover.replaceChildren(document.createElement('div'));
        return { setCurrent: (choices) => current.push(choices), setMode() {} };
      }
    }))
  });
  control.render();
  return { control, cleanup, current, document, drawn, setLanguage: (value) => { language = value; }, window };
};

test('the picker is fetched before the click: when the browser is idle, and when the pointer or a finger reaches the button', async () => {
  const idle = pickerControl();
  try {
    assert.equal(idle.drawn.length, 0);
  } finally {
    idle.cleanup();
  }
  const { document, window, cleanup } = createDom('<div id="file-input-container"></div>');
  try {
    const idleWork = [];
    window.requestIdleCallback = (callback) => idleWork.push(callback);
    let loads = 0;
    const control = createDeckDesignControl({
      document,
      window,
      getActiveConversation: () => ({ id: 'a', messages: [] }),
      saveAppData: async () => {},
      getUiLanguage: () => 'en',
      loadPicker: async () => { loads += 1; return { renderDeckDesignPicker: () => ({ setCurrent() {} }) }; }
    });
    control.render();
    assert.equal(loads, 0, 'nothing is fetched while the page starts');
    idleWork.shift()();
    await tick();
    assert.equal(loads, 1, 'fetched once the browser is idle');
    document.getElementById('deck-design-btn').click();
    await tick();
    assert.equal(loads, 1, 'and not again for the click');
  } finally {
    cleanup();
  }
  for (const type of ['pointerenter', 'focus', 'touchstart']) {
    const hover = pickerControl();
    try {
      const button = hover.document.getElementById('deck-design-btn');
      button.dispatchEvent(new hover.window.Event(type));
      await tick();
      assert.equal(hover.drawn.length, 1, `${type}: drawn before any click`);
      assert.equal(hover.document.getElementById('deck-design-popover').classList.contains('visible'), false, 'but not shown');
      button.click();
      await tick();
      assert.equal(hover.drawn.length, 1, `${type}: the click does not draw it again`);
      assert.equal(hover.document.getElementById('deck-design-popover').classList.contains('visible'), true);
    } finally {
      hover.cleanup();
    }
  }
});

test('opening the picker again only brings its choices up to date; a new language draws it again', async () => {
  const harness = pickerControl();
  try {
    const button = harness.document.getElementById('deck-design-btn');
    const popover = harness.document.getElementById('deck-design-popover');
    button.click();
    await tick();
    assert.equal(harness.drawn.length, 1);
    button.click();
    await tick();
    assert.equal(popover.classList.contains('visible'), false, 'the second click closes it');
    const before = harness.current.length;
    button.click();
    await tick();
    assert.equal(popover.classList.contains('visible'), true);
    assert.equal(harness.drawn.length, 1, 'not drawn again');
    assert.ok(harness.current.length > before, 'its choices were refreshed');
    button.click();
    harness.setLanguage('fr');
    button.click();
    await tick();
    assert.deepEqual(harness.drawn, ['en', 'fr']);
  } finally {
    harness.cleanup();
  }
});

test('a click answers at once with a turning ring while the picker is still arriving, and the ring gives way to the picker', async () => {
  let arrive;
  const late = new Promise((resolve) => { arrive = resolve; });
  const harness = pickerControl({
    loadPicker: () => late
  });
  try {
    const button = harness.document.getElementById('deck-design-btn');
    const popover = harness.document.getElementById('deck-design-popover');
    button.click();
    assert.equal(popover.classList.contains('visible'), true, 'open before anything has loaded');
    assert.ok(popover.querySelector('[role="status"][aria-busy="true"] svg animateTransform'), 'a ring that needs no stylesheet');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    arrive({
      renderDeckDesignPicker: (target, options) => {
        target.replaceChildren(harness.document.createElement('section'));
        return { setCurrent() {}, setMode() {} };
      }
    });
    await tick();
    await tick();
    assert.equal(popover.querySelector('[role="status"]'), null, 'the ring is replaced');
    assert.ok(popover.querySelector('section'));
    assert.equal(popover.classList.contains('visible'), true);
  } finally {
    harness.cleanup();
  }
});

test('when the picker cannot be loaded the ring goes away, the button closes and the failure is logged', async () => {
  const errors = [];
  const harness = pickerControl({
    logError: (...args) => errors.push(args),
    loadPicker: async () => { throw new Error('offline'); }
  });
  try {
    const button = harness.document.getElementById('deck-design-btn');
    const popover = harness.document.getElementById('deck-design-popover');
    button.click();
    await tick();
    await tick();
    assert.equal(popover.classList.contains('visible'), false);
    assert.equal(popover.childElementCount, 0);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(errors.length, 1);
  } finally {
    harness.cleanup();
  }
});
