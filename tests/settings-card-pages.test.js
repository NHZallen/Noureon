import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { mountCardPages } from '../src/app/runtime/settings/settings-card-pages.js';
import { tryHandleSettingsBack } from '../src/app/runtime/settings/settings-section-back.js';

const cardsMarkup = '<div class="pz"><section class="pz-card"><div class="pz-head"><h3>One</h3></div></section><section class="pz-card"><div class="pz-head"><h3>Two</h3></div></section></div>';

function fixture(id = 'privacy-section') {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `<h2 id="settings-mobile-title">Privacy</h2><div id="${id}" class="settings-section active">${cardsMarkup}</div>`;
  const section = document.getElementById(id);
  mountCardPages({ document, window, section });
  return { window, document, section, wait: () => new Promise((resolve) => setTimeout(resolve, 20)) };
}

test('a card opens as a page when its title is pressed; the back arrow goes to the list and then leaves', () => {
  const { document, section } = fixture();
  assert.equal(section.dataset.cp, 'on');
  section.querySelectorAll('.pz-head')[1].click();
  assert.equal(section.dataset.cpPage, 'open');
  assert.equal(section.querySelectorAll('.pz-card')[1].classList.contains('cp-open'), true);
  assert.equal(document.getElementById('settings-mobile-title').textContent, 'Two');
  assert.equal(tryHandleSettingsBack('privacy-section'), true);
  assert.equal(section.dataset.cpPage, '');
  assert.equal(document.getElementById('settings-mobile-title').textContent, 'Privacy');
  assert.equal(tryHandleSettingsBack('privacy-section'), false);
});

test('a page that is drawn again keeps its open card, and a section that is not listed is left alone', async () => {
  const { section, wait } = fixture();
  section.querySelectorAll('.pz-head')[0].click();
  section.innerHTML = cardsMarkup;
  await wait();
  assert.equal(section.dataset.cpPage, 'open');
  assert.equal(section.querySelectorAll('.pz-card')[0].classList.contains('cp-open'), true);
  const other = fixture('about-section');
  assert.equal(other.section.dataset.cp, undefined);
});
