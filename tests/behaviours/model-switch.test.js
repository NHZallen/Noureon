import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './helpers/create-dom.js';

const fixture = `
  <section id="model-switcher">
    <button
      type="button"
      id="current-model-btn"
      aria-expanded="false"
      aria-controls="model-list"
    >
      <span id="current-model-label">Astra Flash</span>
    </button>
    <div id="model-list" class="model-switcher-popover hidden" data-state="closed">
      <button type="button" class="model-option active selected" data-model-id="astra-flash" data-model-name="Astra Flash">
        Astra Flash
      </button>
      <button type="button" class="model-option" data-model-id="astra-pro" data-model-name="Astra Pro">
        Astra Pro
      </button>
      <button type="button" class="model-option" data-model-id="astra-lite" data-model-name="Astra Lite">
        Astra Lite
      </button>
    </div>
  </section>
`;

const setupModelSwitcherFixture = (document) => {
  const toggleButton = document.getElementById('current-model-btn');
  const currentLabel = document.getElementById('current-model-label');
  const modelList = document.getElementById('model-list');

  const closeList = () => {
    modelList.classList.add('hidden');
    modelList.dataset.state = 'closed';
    toggleButton.setAttribute('aria-expanded', 'false');
  };

  const openList = () => {
    modelList.classList.remove('hidden');
    modelList.dataset.state = 'open';
    toggleButton.setAttribute('aria-expanded', 'true');
  };

  toggleButton.addEventListener('click', () => {
    if (modelList.dataset.state === 'open') {
      closeList();
      return;
    }
    openList();
  });

  modelList.addEventListener('click', (event) => {
    const option = event.target.closest('.model-option');
    if (!option) return;

    modelList.querySelectorAll('.model-option').forEach((item) => {
      item.classList.remove('active', 'selected');
    });
    option.classList.add('active', 'selected');
    currentLabel.textContent = option.dataset.modelName;
    closeList();
  });
};

test('model switcher updates the visible label and selected option in a minimal DOM fixture', () => {
  // Harness-level behaviour proof:
  // this locks the user-visible model switch DOM contract pattern.
  // It is not a production runtime function extraction. The production
  // model switcher still lives in the legacy runtime, and future migrations
  // need broader coverage before moving this behavior.
  const { window, document, cleanup } = createDom(fixture);

  try {
    setupModelSwitcherFixture(document);

    const toggleButton = document.getElementById('current-model-btn');
    const currentLabel = document.getElementById('current-model-label');
    const modelList = document.getElementById('model-list');
    const flashOption = document.querySelector('[data-model-id="astra-flash"]');
    const proOption = document.querySelector('[data-model-id="astra-pro"]');
    const liteOption = document.querySelector('[data-model-id="astra-lite"]');

    assert.equal(currentLabel.textContent, 'Astra Flash');
    assert.equal(flashOption.classList.contains('active'), true);
    assert.equal(modelList.dataset.state, 'closed');

    toggleButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(modelList.dataset.state, 'open');
    assert.equal(modelList.classList.contains('hidden'), false);
    assert.equal(toggleButton.getAttribute('aria-expanded'), 'true');

    proOption.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(proOption.classList.contains('active'), true);
    assert.equal(proOption.classList.contains('selected'), true);
    assert.equal(flashOption.classList.contains('active'), false);
    assert.equal(flashOption.classList.contains('selected'), false);
    assert.equal(currentLabel.textContent, 'Astra Pro');
    assert.equal(modelList.dataset.state, 'closed');
    assert.equal(modelList.classList.contains('hidden'), true);
    assert.equal(toggleButton.getAttribute('aria-expanded'), 'false');

    toggleButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    liteOption.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(liteOption.classList.contains('active'), true);
    assert.equal(liteOption.classList.contains('selected'), true);
    assert.equal(proOption.classList.contains('active'), false);
    assert.equal(proOption.classList.contains('selected'), false);
    assert.equal(currentLabel.textContent, 'Astra Lite');
    assert.equal(modelList.dataset.state, 'closed');
  } finally {
    cleanup();
  }
});
