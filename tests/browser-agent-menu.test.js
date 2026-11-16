// The "Browser agent" row of the "＋" menu: a switch for the open conversation, greyed for a model that cannot see, and a way to the settings for someone with no place yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createBrowserAgentMenu, startBrowserAgentMenu, BROWSER_MENU_BUTTON_ID } from '../src/app/ui/browser-agent/browser-agent-menu.js';
import { isBrowserOn } from '../src/app/runtime/server-reply/browser-switch.js';
import browserAgentTexts from '../src/data/i18n/parts/browser-agent.js';

const en = browserAgentTexts.en;
const text = (key) => en[key] ?? key;

const setup = ({ conversation = { id: 'c1' }, vision = true, access = { ok: true, allowed: true, codes: [] } } = {}) => {
  const window = new Window({ url: 'https://noureon.test/' });
  globalThis.localStorage = window.localStorage; // the switch keeps its list here
  const { document } = window;
  document.body.innerHTML = '<button id="add-file-btn"></button><div id="file-options-popover"><button id="learning-mode-btn"></button></div>';
  const notes = [];
  const asked = [];
  let current = conversation;
  const menu = createBrowserAgentMenu({
    document,
    getActiveConversation: () => current,
    normalizeConversationModel: () => (vision ? { provider: 'gemini', id: 'gemini-2.5-flash', name: 'Gemini' } : { provider: 'openrouter', id: 'some/text-only-model', name: 'Text only' }),
    text,
    client: { getAccess: async () => { asked.push(1); return access; } },
    showNotification: (message, kind) => notes.push([message, kind])
  });
  return { window, document, menu, notes, asked, set: (value) => { current = value; } };
};

test('the row is in the menu before the learning button, with its words and its icon', () => {
  const t = setup();
  t.menu.sync();
  const button = t.document.getElementById(BROWSER_MENU_BUTTON_ID);
  assert.equal(button.nextElementSibling.id, 'learning-mode-btn');
  assert.equal(button.querySelector('.composer-menu-label').textContent, 'Browser agent');
  assert.ok(button.querySelector('svg'));
  assert.equal(button.style.display, 'flex');
  assert.equal(button.classList.contains('is-active'), false);
});

test('pressing it switches the conversation on after asking the server once, and off again without asking', async () => {
  const t = setup();
  const button = t.menu.sync();
  button.click(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(isBrowserOn('c1'), true);
  assert.equal(button.classList.contains('is-active'), true);
  assert.deepEqual(t.notes.at(-1), [en.baMenuOn, 'info']);
  button.click(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(isBrowserOn('c1'), false);
  assert.equal(button.classList.contains('is-active'), false);
  button.click(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(t.asked.length, 1, 'the answer is kept for a minute');
});

test('a model that cannot see keeps the row greyed and says why; someone with no place is told to redeem a code; a server that cannot be reached says so', async () => {
  const blind = setup({ vision: false });
  const b1 = blind.menu.sync();
  assert.equal(b1.style.opacity, '0.5');
  b1.click(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(blind.notes.at(-1), [en.baMenuNoVision, 'warning']);
  assert.equal(isBrowserOn('c1'), false);

  const stranger = setup({ access: { ok: true, allowed: false, codes: [] } });
  const b2 = stranger.menu.sync();
  b2.click(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(stranger.notes.at(-1), [en.baMenuNeedInvite, 'warning']);
  assert.equal(isBrowserOn('c1'), false);

  const down = setup({ access: { ok: false } });
  const b3 = down.menu.sync();
  b3.click(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(down.notes.at(-1), [en.baMenuUnavailable, 'warning']);
});

test('a temporary chat has no row, a new chat that has no message yet has it, and it follows the conversation that is open', () => {
  const t = setup({ conversation: { id: 'c1', retentionMode: 'ephemeral' } });
  assert.equal(t.menu.sync().style.display, 'none');
  t.set({ id: 'c0', isTemporary: true });
  assert.equal(t.menu.sync().style.display, 'flex', 'a new chat with no message yet');
  t.set({ id: 'c2' });
  assert.equal(t.menu.sync().style.display, 'flex');
});

test('the row is brought up to date when the plus button is pressed, before the menu opens', () => {
  const t = setup();
  const menu = startBrowserAgentMenu({ document: t.document, configAccess: { getConfig: () => ({ uiLanguage: 'en' }) }, i18n: { en }, getActiveConversation: () => ({ id: 'c1' }), normalizeConversationModel: () => ({ provider: 'gemini', id: 'gemini-2.5-flash', name: 'Gemini' }), showNotification: () => {}, client: { getAccess: async () => ({ ok: true, allowed: true }) } });
  assert.ok(menu.toggle);
  t.document.getElementById(BROWSER_MENU_BUTTON_ID).remove();
  // The sheet of a phone stops the press at the container of the button: the row is still made ready first.
  const container = t.document.createElement('div');
  container.id = 'file-input-container';
  const opener = t.document.getElementById('add-file-btn');
  opener.replaceWith(container); container.append(opener);
  container.addEventListener('click', (event) => event.stopPropagation(), true);
  opener.click();
  assert.ok(t.document.getElementById(BROWSER_MENU_BUTTON_ID), 'made again when the plus is pressed');
});

test('the five languages have the words of the row', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) for (const key of ['baMenuLabel', 'baMenuDescription', 'baMenuNoVision', 'baMenuNeedInvite', 'baMenuOn', 'baMenuOff', 'baMenuUnavailable']) assert.ok(browserAgentTexts[language][key], `${language} ${key}`);
});
