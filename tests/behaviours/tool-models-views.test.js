import assert from 'node:assert/strict';
import test from 'node:test';

import { TOOL_MODEL_TEXTS, toolModelText } from '../../src/app/runtime/tool-models/tool-models-texts.js';
import { PERMISSION_TEXTS } from '../../src/app/runtime/cli/permission-texts.js';
import { renderToolModelsView } from '../../src/app/ui/tool-models/tool-models-view.js';
import { imagePermissionCard } from '../../src/app/ui/tool-models/image-permission-card.js';
import { createDom } from './helpers/create-dom.js';

const MODELS = [
  { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter', name: 'GPT Image 2.5 Flare', providerLabel: 'OpenRouter' },
  { id: 'gemini-image', provider: 'gemini', name: 'Gemini Image', providerLabel: 'Gemini' }
];
const fire = (window, node) => node.dispatchEvent(new window.Event('change', { bubbles: true }));

test('the tab lists none and every picture model, and choosing one changes and saves the setting', () => {
  const dom = createDom('<div id="root"></div>');
  try {
    const root = dom.document.getElementById('root');
    let chosen = null;
    const saves = [];
    const draw = () => renderToolModelsView({
      document: dom.document, root, getLanguage: () => 'en', models: MODELS,
      getImageModel: () => chosen,
      setImageModel: (model) => { const changed = JSON.stringify(model) !== JSON.stringify(chosen); chosen = model; return changed; },
      hasKey: (provider) => provider === 'openrouter',
      save: async () => { saves.push(chosen); }
    });
    draw();
    const radios = () => [...root.querySelectorAll('input[type="radio"]')];
    assert.equal(radios().length, 3, 'none and two models');
    assert.equal(radios()[0].checked, true, 'none is chosen at first');
    assert.match(root.textContent, /Needs an API key for Gemini/, 'a model whose provider has no key says so');
    assert.doesNotMatch(root.textContent, /Needs an API key for OpenRouter/);

    radios()[1].checked = true;
    fire(dom.window, radios()[1]);
    assert.deepEqual(chosen, { provider: 'openrouter', id: 'openai/gpt-image-2.5-flare' });
    assert.equal(radios()[1].checked, true, 'it is drawn again with the choice');
    assert.equal(saves.length, 1);

    radios()[0].checked = true;
    fire(dom.window, radios()[0]);
    assert.equal(chosen, null);
    assert.equal(saves.length, 2);
  } finally {
    dom.cleanup();
  }
});

test('the permission card asks every time at first and saves an "always allow" at once', () => {
  const dom = createDom('<div id="root"></div>');
  try {
    const root = dom.document.getElementById('root');
    const config = {};
    const changes = [];
    const card = imagePermissionCard({
      document: dom.document, t: (key) => toolKey(key), getConfig: () => config,
      change: (mutate) => { changes.push(mutate()); }
    });
    root.append(card);
    const [ask, always] = [...root.querySelectorAll('input[type="radio"]')];
    assert.equal(ask.checked, true);
    assert.equal(always.checked, false);
    always.checked = true;
    fire(dom.window, always);
    assert.deepEqual(config.permissions, { imageGeneration: 'always' });
    assert.deepEqual(changes, [true]);
  } finally {
    dom.cleanup();
  }
});
const toolKey = (key) => PERMISSION_TEXTS.en[key];

test('every word of the tab and of the permission card is in the five languages', () => {
  const languages = ['zh-TW', 'en', 'fr', 'ru', 'es'];
  const keys = Object.keys(TOOL_MODEL_TEXTS.en);
  for (const language of languages) {
    assert.deepEqual(Object.keys(TOOL_MODEL_TEXTS[language]), keys, language);
    for (const key of keys) assert.ok(toolModelText(language, key).length > 0 && toolModelText(language, key) !== key, `${language} ${key}`);
    for (const key of ['imageTitle', 'imageDesc', 'imageAsk', 'imageAskDesc', 'imageAlways', 'imageAlwaysDesc']) {
      assert.ok(PERMISSION_TEXTS[language][key], `${language} ${key}`);
    }
  }
  assert.match(toolModelText('en', 'needsKey', { provider: 'Gemini' }), /Gemini/);
});
