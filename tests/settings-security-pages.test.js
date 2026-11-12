import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { mountSecurityPages } from '../src/app/runtime/settings/settings-security-pages.js';
import { tryHandleSettingsBack } from '../src/app/runtime/settings/settings-section-back.js';

function fixture() {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `
    <h2 id="settings-mobile-title"></h2>
    <div id="security-section" class="settings-section active"><div class="us">
      <div id="security-pages"></div>
      <section id="security-login-card" class="us-card"><span class="us-mark"><i>k</i></span></section>
      <section id="security-sync-card" class="us-card"><span class="us-mark"><i>c</i></span></section>
      <section id="security-passkey-card" class="us-card hidden"><span class="us-mark"><i>p</i></span></section>
      <section id="security-totp-card" class="us-card hidden"></section>
      <section id="security-devices-card" class="us-card hidden"><button id="security-devices-toggle" aria-expanded="false"></button></section>
    </div></div>`;
  const section = document.getElementById('security-section');
  mountSecurityPages({ document, window, text: (_key, fallback) => fallback, section });
  const rows = () => [...section.querySelectorAll('.sp-row:not(.hidden)')].map((row) => row.dataset.page);
  return { window, document, section, rows, wait: () => new Promise((resolve) => setTimeout(resolve, 20)) };
}

test('the security list has a row for each card that is shown, and a heading only when it has a row', async () => {
  const { section, rows, wait } = fixture();
  assert.deepEqual(rows(), ['login', 'sync']);
  assert.equal(section.querySelectorAll('.sp-group:not(.hidden)').length, 1);
  section.querySelector('#security-passkey-card').classList.remove('hidden');
  await wait();
  assert.deepEqual(rows(), ['login', 'sync', 'passkey']);
  assert.equal(section.querySelector('.sp-row[data-page="passkey"] .us-mark i').textContent, 'p');
});

test('a row opens its card as a page with its own title; the back arrow goes to the list, then leaves the section', () => {
  const { document, section } = fixture();
  section.querySelector('.sp-row[data-page="sync"]').click();
  assert.equal(section.dataset.page, 'sync');
  assert.equal(document.getElementById('settings-mobile-title').textContent, '雲端同步');
  assert.equal(tryHandleSettingsBack('security-section'), true);
  assert.equal(section.dataset.page, '');
  assert.equal(document.getElementById('settings-mobile-title').textContent, '安全性與登入');
  assert.equal(tryHandleSettingsBack('security-section'), false);
});

test('the list of devices is opened for the person when its page opens, and leaving the section starts it on the list again', async () => {
  const { document, section, wait } = fixture();
  section.querySelector('#security-devices-card').classList.remove('hidden');
  await wait();
  let clicks = 0;
  document.getElementById('security-devices-toggle').addEventListener('click', () => { clicks += 1; });
  section.querySelector('.sp-row[data-page="devices"]').click();
  assert.equal(clicks, 1);
  section.classList.remove('active');
  await wait();
  assert.equal(section.dataset.page, '');
});
