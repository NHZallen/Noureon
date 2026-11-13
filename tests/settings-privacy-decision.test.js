import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { addDecisionCard } from '../src/app/runtime/settings/settings-privacy-decision.js';

const fixture = () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div id="privacy-section"><section class="pz-card" id="a"></section><section class="pz-card" id="b"></section><section class="pz-card" id="c"></section></div>';
  return { document, section: document.getElementById('privacy-section') };
};

test('the card of the decision model sits after the second card, offers each model, checks the one chosen, and tells the choice', () => {
  const { document, section } = fixture();
  const chosen = [];
  addDecisionCard({ document, section, language: 'en', decisionModel: 'google/gemini-decision-1', onChange: (id) => chosen.push(id) });
  assert.deepEqual([...section.children].map((node) => node.id), ['a', 'b', 'decision-model-card', 'c']);
  const radios = [...section.querySelectorAll('input[name="decision-model"]')];
  assert.deepEqual(radios.map((radio) => [radio.value, radio.checked]), [['typesafe/jev-1.14', false], ['google/gemini-decision-1', true]]);
  assert.match(section.querySelector('#decision-model-card h3').textContent, /Judgement model/);
  radios[0].checked = true;
  radios[0].dispatchEvent(new document.defaultView.Event('change'));
  assert.deepEqual(chosen, ['typesafe/jev-1.14']);
});

test('the card is drawn again, not twice, when the language changes; a choice that is not offered shows the default one', () => {
  const { document, section } = fixture();
  addDecisionCard({ document, section, language: 'en', decisionModel: 'nothing/offered', onChange: () => {} });
  addDecisionCard({ document, section, language: 'fr', decisionModel: 'nothing/offered', onChange: () => {} });
  assert.equal(section.querySelectorAll('#decision-model-card').length, 1);
  assert.match(section.querySelector('#decision-model-card h3').textContent, /Modèle de jugement/);
  assert.equal(section.querySelector('input[name="decision-model"]:checked').value, 'typesafe/jev-1.14');
});

test('with no card in the tab there is nothing to put it after', () => {
  const { document } = fixture();
  const empty = document.createElement('div');
  assert.equal(addDecisionCard({ document, section: empty, language: 'en', decisionModel: '', onChange: () => {} }), null);
});
