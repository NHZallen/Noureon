import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createPickerChoices } from '../src/app/runtime/council/council-controls-choices.js';

// The button of the thinking depth says its level in its text, its title and its label: all three follow the slider (the title stayed "Thinking: Medium" after the level was changed).

const setup = () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `<div id="model-council-control">
    <button id="model-depth-btn" title="Thinking: Medium" aria-label="Thinking: Medium"><span class="mp-depth-trigger-label"><span class="mp-depth-trigger-value">Medium</span></span></button>
    <div data-mp-depth data-mp-labels='["Fast","Medium","High"]'><div data-mp-slider><input type="range" data-mp-depth-input min="0" max="2" value="1"><span data-mp-depth-value>Medium</span></div></div>
  </div>`;
  const choices = createPickerChoices({
    document, models: [], getActiveConversation: () => null, getConfig: () => ({}), getI18n: () => ({}), showCustomDialog: async () => true,
    getModelReasoningConfig: () => null, normalizeReasoningEffort: () => null, normalizeConversationModel: () => null,
    renderSidebar() {}, renderInputIndicators() {}, saveAppData: async () => {}, saveConfig: async () => {}, afterPaint: (fn) => fn()
  });
  return { window, document, choices, input: document.querySelector('[data-mp-depth-input]'), button: document.getElementById('model-depth-btn') };
};

test('moving the slider changes the level in the button\'s text, title and label', () => {
  const { choices, input, button } = setup();
  assert.equal(choices.paintDepth(input, 0), 'Fast');
  assert.equal(button.querySelector('.mp-depth-trigger-value').textContent, 'Fast');
  assert.equal(button.getAttribute('title'), 'Thinking: Fast');
  assert.equal(button.getAttribute('aria-label'), 'Thinking: Fast');
  choices.paintDepth(input, 2);
  assert.equal(button.getAttribute('title'), 'Thinking: High');
});

test('only the level is replaced: the words around it (any language) stay', () => {
  const { choices, input, button } = setup();
  button.setAttribute('title', 'Réflexion : Medium');
  button.setAttribute('aria-label', 'Réflexion : Medium');
  choices.paintDepth(input, 0);
  assert.equal(button.getAttribute('title'), 'Réflexion : Fast');
});
