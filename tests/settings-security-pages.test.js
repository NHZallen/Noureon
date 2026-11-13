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
  assert.equal(document.getElementById('settings-mobile-title').textContent, '同步密碼');
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

test('every page of the security list has a rule in the stylesheet that shows its card (otherwise the page opens blank on a phone)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/app/runtime/settings/settings-security-pages.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles/user-settings.css', import.meta.url), 'utf8');
  const pages = [...source.matchAll(/\{ id: '([a-z]+)', card: '([a-z-]+)'/g)].map((match) => ({ id: match[1], card: match[2] }));
  assert.ok(pages.length >= 6);
  for (const { id, card } of pages) {
    assert.ok(css.includes(`#security-section[data-page="${id}"] #${card}`), `user-settings.css has no rule that shows #${card} on page "${id}"`);
  }
});

test('a card whose parts are all hidden (the login password of a local account) has no row, and gets one back when a part is shown', async () => {
  const { document, section, rows, wait } = fixture();
  const login = section.querySelector('#security-login-card');
  login.innerHTML = '<div id="login-password-row" class="us-row hidden"></div><div id="login-password-unavailable" class="us-note hidden"></div><div class="hidden"></div>';
  await wait();
  assert.deepEqual(rows(), ['sync']);
  document.getElementById('login-password-unavailable').classList.remove('hidden');
  await wait();
  assert.deepEqual(rows(), ['login', 'sync']);
});

test('a page that is open when its card goes away goes back to the list instead of staying blank', async () => {
  const { section, wait } = fixture();
  section.querySelector('#security-passkey-card').classList.remove('hidden');
  await wait();
  section.querySelector('.sp-row[data-page="passkey"]').click();
  assert.equal(section.dataset.page, 'passkey');
  section.querySelector('#security-passkey-card').classList.add('hidden');
  await wait();
  assert.equal(section.dataset.page, '');
});

test('each row has a dot that follows its card: green set up, amber to prove again, red not set up; the devices row has none', async () => {
  const { section, wait } = fixture();
  section.querySelector('#security-sync-card').insertAdjacentHTML('beforeend', '<span id="sync-vault-state" class="us-state"></span>');
  for (const id of ['security-passkey-card', 'security-totp-card', 'security-devices-card']) section.querySelector(`#${id}`).classList.remove('hidden');
  section.querySelector('#security-passkey-card').insertAdjacentHTML('beforeend', '<ul id="security-passkey-list"></ul>');
  section.querySelector('#security-totp-card').insertAdjacentHTML('beforeend', '<span id="security-totp-on" class="hidden"></span><span id="security-totp-off"></span>');
  await wait();
  const dot = (page) => section.querySelector(`.sp-row[data-page="${page}"] .sp-dot`);
  assert.equal(dot('login').dataset.status, 'off', 'no login password row: not set up');
  assert.equal(dot('sync').dataset.status, 'off');
  assert.equal(dot('passkey').dataset.status, 'off');
  assert.equal(dot('totp').dataset.status, 'off');
  assert.equal(dot('devices').hidden, true);
  assert.equal(dot('sync').getAttribute('aria-label'), '尚未設定');

  section.querySelector('#sync-vault-state').classList.add('is-on');
  section.querySelector('#security-passkey-list').insertAdjacentHTML('beforeend', '<li></li>');
  section.querySelector('#security-totp-on').classList.remove('hidden');
  await wait();
  assert.equal(dot('sync').dataset.status, 'on');
  assert.equal(dot('passkey').dataset.status, 'on');
  assert.equal(dot('totp').dataset.status, 'on');
  assert.equal(dot('sync').getAttribute('aria-label'), '已設定');

  section.querySelector('#sync-vault-state').classList.replace('is-on', 'is-warn');
  await wait();
  assert.equal(dot('sync').dataset.status, 'warn');
  assert.equal(dot('sync').title, '需要重新認證');

});
