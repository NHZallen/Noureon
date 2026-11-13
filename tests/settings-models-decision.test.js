import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { addDecisionCard } from '../src/app/runtime/settings/settings-models-decision.js';

const fixture = () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div id="model-management-section"><div class="pz"><section class="pz-card" id="a"></section><section class="pz-card" id="b"></section><section class="pz-card" id="speech-settings-card"></section></div></div>';
  return { document, section: document.querySelector('.pz') };
};
const change = (document, select, value) => {
  select.value = value;
  select.dispatchEvent(new document.defaultView.Event('change'));
};
const options = (select) => [...select.querySelectorAll('option')].map((option) => [option.value, option.textContent]);

test('the card of the decision model sits before the card of speech to text, with a provider and then a model, and shows the ones chosen', () => {
  const { document, section } = fixture();
  addDecisionCard({ document, host: section, language: 'en', decisionModel: 'gemini-decision-1', onChange: () => {} });
  assert.deepEqual([...section.children].map((node) => node.id), ['a', 'b', 'decision-model-card', 'speech-settings-card']);
  assert.match(section.querySelector('#decision-model-card h3').textContent, /Judgement model/);
  const provider = section.querySelector('#decision-provider');
  const model = section.querySelector('#decision-model');
  assert.deepEqual(options(provider), [['openrouter', 'OpenRouter'], ['gemini', 'Google Gemini']]);
  assert.equal(provider.value, 'gemini');
  assert.deepEqual(options(model), [['gemini-decision-1', 'Gemini Decision 1']]);
  assert.equal(model.value, 'gemini-decision-1');
  assert.match(section.querySelector('#decision-model-card .pz-row:last-child .pz-sub').textContent, /straight from Google/);
});

test('choosing a provider offers its models and takes the first one; choosing a model tells the choice', () => {
  const { document, section } = fixture();
  const chosen = [];
  addDecisionCard({ document, host: section, language: 'en', decisionModel: 'gemini-decision-1', onChange: (id) => chosen.push(id) });
  const provider = section.querySelector('#decision-provider');
  const model = section.querySelector('#decision-model');
  change(document, provider, 'openrouter');
  assert.deepEqual(chosen, ['typesafe/jev-1.14']);
  assert.deepEqual(options(model), [['typesafe/jev-1.14', 'Jev 1.14'], ['google/gemini-decision-1', 'Gemini Decision 1']]);
  assert.equal(model.value, 'typesafe/jev-1.14');
  change(document, model, 'google/gemini-decision-1');
  assert.deepEqual(chosen, ['typesafe/jev-1.14', 'google/gemini-decision-1']);
  assert.equal(provider.value, 'openrouter');
  assert.match(section.querySelector('#decision-model-card .pz-row:last-child .pz-sub').textContent, /through OpenRouter/);
  change(document, provider, 'gemini');
  assert.deepEqual(chosen, ['typesafe/jev-1.14', 'google/gemini-decision-1', 'gemini-decision-1']);
});

test('the card is drawn again, not twice, when the language changes; a choice that is not offered shows the default one', () => {
  const { document, section } = fixture();
  addDecisionCard({ document, host: section, language: 'en', decisionModel: 'nothing/offered', onChange: () => {} });
  addDecisionCard({ document, host: section, language: 'fr', decisionModel: 'nothing/offered', onChange: () => {} });
  assert.equal(section.querySelectorAll('#decision-model-card').length, 1);
  assert.match(section.querySelector('#decision-model-card h3').textContent, /Modèle de jugement/);
  assert.equal(section.querySelector('#decision-provider').value, 'openrouter');
  assert.equal(section.querySelector('#decision-model').value, 'typesafe/jev-1.14');
});

test('with no card of speech the card goes last, and with no section there is nothing to draw in', () => {
  const { document, section } = fixture();
  section.querySelector('#speech-settings-card').remove();
  addDecisionCard({ document, host: section, language: 'en', decisionModel: '', onChange: () => {} });
  assert.equal(section.lastElementChild.id, 'decision-model-card');
  assert.equal(addDecisionCard({ document, host: null, language: 'en', decisionModel: '', onChange: () => {} }), null);
});

test('the settings draw it into the section of the models when they open, again when the language changes, and save the choice', async () => {
  const { createDecisionSettings } = await import('../src/app/runtime/settings/settings-models-decision.js');
  const { document, section } = fixture();
  const select = document.createElement('select');
  document.body.appendChild(select);
  const config = { uiLanguage: 'en', decisionModel: 'gemini-decision-1' };
  let saved = 0;
  const parts = createDecisionSettings({ document, elements: { uiLanguageSelect: select }, config, saveConfig: async () => { saved += 1; } });
  parts.mount();
  parts.mount();
  assert.equal(section.querySelectorAll('#decision-model-card').length, 1);
  assert.equal(section.querySelector('#decision-provider').value, 'gemini');
  select.dispatchEvent(Object.assign(new document.defaultView.Event('change'), { }));
  const provider = section.querySelector('#decision-provider');
  provider.value = 'openrouter';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(config.decisionModel, 'typesafe/jev-1.14');
  assert.equal(saved, 1);
});
