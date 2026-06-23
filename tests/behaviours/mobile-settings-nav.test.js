import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './helpers/create-dom.js';

const SETTINGS_MOBILE_RETURN_TEST_MS = 5;

const fixture = `
  <div id="settings-modal">
    <div class="flex flex-1 overflow-hidden">
      <div id="settings-mobile-header">
        <button type="button" id="settings-mobile-back-btn" aria-label="Back">Back</button>
        <h2 id="settings-mobile-title">Settings</h2>
      </div>
      <div id="settings-mobile-list">
        <button
          type="button"
          class="settings-mobile-list-item settings-nav-item"
          data-section="personalization"
          data-mobile-title="Personalization"
        >
          Personalization
        </button>
      </div>
      <section id="personalization-section" class="settings-section"></section>
      <section id="memory-section" class="settings-section"></section>
    </div>
  </div>
`;

const setupMobileSettingsNavFixture = (document, { transitionMs = SETTINGS_MOBILE_RETURN_TEST_MS } = {}) => {
  const settingsModal = document.getElementById('settings-modal');
  const mobileList = document.getElementById('settings-mobile-list');
  const title = document.getElementById('settings-mobile-title');
  const backButton = document.getElementById('settings-mobile-back-btn');
  let transitionTimer = null;

  const clearTransition = () => {
    if (!transitionTimer) return;
    clearTimeout(transitionTimer);
    transitionTimer = null;
  };

  const showSettingsMobileList = ({ animate = true } = {}) => {
    const finishReturn = () => {
      settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
      title.textContent = 'Settings';
      document.querySelectorAll('.settings-section').forEach((section) => section.classList.remove('active'));
      transitionTimer = null;
    };

    clearTransition();
    if (animate && settingsModal.classList.contains('settings-mobile-detail-open')) {
      settingsModal.classList.add('settings-mobile-returning');
      title.textContent = 'Settings';
      transitionTimer = setTimeout(finishReturn, transitionMs);
      return;
    }
    finishReturn();
  };

  const openSettingsMobileSection = (sectionName) => {
    clearTransition();
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (!targetSection) return;
    settingsModal.classList.remove('settings-mobile-returning');
    document.querySelectorAll('.settings-section').forEach((section) => section.classList.remove('active'));
    targetSection.classList.add('active');
    const listItem = Array.from(document.querySelectorAll('#settings-mobile-list [data-section]'))
      .find((item) => item.dataset.section === sectionName);
    title.textContent = listItem?.dataset.mobileTitle || sectionName;
    settingsModal.classList.add('settings-mobile-detail-open');
  };

  mobileList.addEventListener('click', (event) => {
    const item = event.target.closest('.settings-mobile-list-item');
    if (!item?.dataset.section) return;
    openSettingsMobileSection(item.dataset.section);
  });
  backButton.addEventListener('click', () => showSettingsMobileList());

  return {
    clearTransition
  };
};

test('mobile settings nav opens a detail section and returns to the category list', async () => {
  const { window, document, cleanup } = createDom(fixture);
  const nav = setupMobileSettingsNavFixture(document);

  try {
    const settingsModal = document.getElementById('settings-modal');
    const title = document.getElementById('settings-mobile-title');
    const categoryItem = document.querySelector('[data-section="personalization"]');
    const backButton = document.getElementById('settings-mobile-back-btn');
    const personalizationSection = document.getElementById('personalization-section');

    assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), false);

    categoryItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), true);
    assert.equal(title.textContent, 'Personalization');
    assert.equal(personalizationSection.classList.contains('active'), true);

    backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(settingsModal.classList.contains('settings-mobile-returning'), true);
    assert.equal(title.textContent, 'Settings');

    await new Promise((resolve) => setTimeout(resolve, SETTINGS_MOBILE_RETURN_TEST_MS + 5));

    assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), false);
    assert.equal(settingsModal.classList.contains('settings-mobile-returning'), false);
    assert.equal(personalizationSection.classList.contains('active'), false);
  } finally {
    nav.clearTransition();
    cleanup();
  }
});
