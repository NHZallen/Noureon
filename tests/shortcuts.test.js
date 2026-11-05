import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { comboFromEvent, formatCombo, isValidShape, matchesCombo, validateCombo } from '../src/app/ui/shortcuts/shortcut-combo.js';
import { FIXED_SHORTCUTS, SHORTCUTS, SHORTCUT_GROUPS } from '../src/app/ui/shortcuts/shortcut-registry.js';
import { normalizeKeyboardShortcuts } from '../src/app/ui/shortcuts/shortcut-config.js';
import { createShortcutStore } from '../src/app/ui/shortcuts/shortcut-store.js';
import { registerShortcutAction, runShortcutAction } from '../src/app/ui/shortcuts/shortcut-actions.js';
import { startShortcutDispatcher } from '../src/app/ui/shortcuts/shortcut-dispatcher.js';
import { registerPageActions } from '../src/app/ui/shortcuts/shortcut-page-actions.js';
import { mountShortcutsSection } from '../src/app/ui/shortcuts/shortcut-settings.js';
import { setActiveShortcutStore, shortcutLabelFor } from '../src/app/ui/shortcuts/shortcut-hints.js';
import { digestSettings, mergeSettings, stampChangedSettings } from '../src/data/settings-merge.js';
import shortcutTexts from '../src/data/i18n/parts/shortcuts.js';

// The keyboard shortcuts of a computer: the combinations, the list, the choice (a setting that goes to the cloud), the one key listener and the tab of the settings.

const ev = (init) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init });

test('a combination is read from where the key is, with Mod for Ctrl (Command on a Mac)', () => {
  assert.deepEqual(comboFromEvent(ev({ code: 'KeyS', key: 'S', ctrlKey: true, shiftKey: true }), 'Win32'), { combo: 'Mod+Shift+S' });
  assert.deepEqual(comboFromEvent(ev({ code: 'KeyS', key: 'ß', metaKey: true, altKey: true }), 'MacIntel'), { combo: 'Mod+Alt+S' }, 'Alt on a Mac types other letters: the key is read by its place');
  assert.deepEqual(comboFromEvent(ev({ code: 'Comma', key: ',', ctrlKey: true }), 'Win32'), { combo: 'Mod+,' });
  assert.deepEqual(comboFromEvent(ev({ code: 'Escape', key: 'Escape', shiftKey: true }), 'Win32'), { combo: 'Shift+Escape' });
  assert.deepEqual(comboFromEvent(ev({ code: 'ControlLeft', key: 'Control', ctrlKey: true }), 'Win32'), { empty: true }, 'a modifier alone is not a combination');
  assert.deepEqual(comboFromEvent(ev({ code: 'KeyK', key: 'k', metaKey: true }), 'Win32'), { unsupported: true }, 'the Windows key is not used');
  assert.deepEqual(comboFromEvent(ev({ code: 'KeyK', key: 'k', ctrlKey: true }), 'MacIntel'), { unsupported: true }, 'Ctrl on a Mac is not used');
  assert.equal(matchesCombo(ev({ key: 's', ctrlKey: true, shiftKey: true }), 'Mod+Shift+S', 'Win32'), true, 'an event with no code is read by its key');
});

test('a combination is written as the person reads it', () => {
  assert.equal(formatCombo('Mod+Shift+S', 'Win32'), 'Ctrl+Shift+S');
  assert.equal(formatCombo('Mod+Shift+S', 'MacIntel'), '⌘⇧S');
  assert.equal(formatCombo('Mod+Enter', 'Win32'), 'Ctrl+⏎');
  assert.equal(formatCombo('Shift+Escape', 'Win32'), 'Shift+Esc');
  assert.equal(formatCombo('', 'Win32'), '');
});

test('which combinations can be a shortcut', () => {
  assert.equal(isValidShape('Mod+Shift+S'), true);
  assert.equal(isValidShape('Shift+Mod+S'), false, 'the modifiers have their order');
  assert.equal(isValidShape('Mod+'), false);
  assert.equal(isValidShape('Mod+ab'), false);
  assert.deepEqual(validateCombo('Mod+K'), { ok: true });
  assert.deepEqual(validateCombo('Shift+Escape'), { ok: true });
  assert.deepEqual(validateCombo('K'), { ok: false, reason: 'modifier' });
  assert.deepEqual(validateCombo('Shift+K'), { ok: false, reason: 'modifier' });
  assert.deepEqual(validateCombo('Enter'), { ok: false, reason: 'fixed' });
  assert.deepEqual(validateCombo('Mod+T'), { ok: false, reason: 'browser' });
  assert.deepEqual(validateCombo('Mod+3'), { ok: false, reason: 'browser' });
  assert.deepEqual(validateCombo('Mod+C'), { ok: false, reason: 'editing' });
  assert.deepEqual(validateCombo('nope'), { ok: false, reason: 'shape' });
});

test('every shortcut of the list has a group, words in the five languages and a combination that can be used, and no two share one', () => {
  const groups = new Set(SHORTCUT_GROUPS.map((group) => group.id));
  const seen = new Set();
  for (const shortcut of SHORTCUTS) {
    assert.ok(groups.has(shortcut.group) && shortcut.group !== 'fixed', `${shortcut.id} has a group`);
    assert.deepEqual(validateCombo(shortcut.combo), { ok: true }, `${shortcut.id} has a usable combination`);
    assert.ok(!seen.has(shortcut.combo), `${shortcut.combo} is used once`);
    seen.add(shortcut.combo);
    for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) assert.ok(shortcutTexts[language][shortcut.textKey], `${shortcut.id} is named in ${language}`);
  }
  for (const group of SHORTCUT_GROUPS) for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) assert.ok(shortcutTexts[language][group.textKey], `${group.id} in ${language}`);
  for (const shortcut of FIXED_SHORTCUTS) for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) assert.ok(shortcutTexts[language][shortcut.textKey]);
  // the keys the settings and the panel had before the list existed
  const byId = Object.fromEntries(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.combo]));
  assert.equal(byId.togglePanel, 'Mod+Shift+S');
  assert.equal(byId.openSettings, 'Mod+,');
  assert.equal(byId.dictate, 'Mod+Shift+D');
});

test('what is saved is checked: only known shortcuts, only combinations of the right form, only what differs', () => {
  assert.deepEqual(normalizeKeyboardShortcuts(null), {});
  assert.deepEqual(normalizeKeyboardShortcuts({
    newChat: { combo: 'Mod+Alt+N', enabled: false },
    searchChats: { combo: 'Mod+K' },
    openSettings: { combo: '' },
    dictate: { combo: 'garbage' },
    nothing: { combo: 'Mod+X' }
  }), { newChat: { combo: 'Mod+Alt+N', enabled: false }, openSettings: { combo: '' } });
});

const settingsHolder = (initial = {}) => {
  const config = { keyboardShortcuts: initial };
  const saved = [];
  return { config, saved, store: createShortcutStore({ getConfig: () => config, update: (patch) => Object.assign(config, patch), save: async () => { saved.push(JSON.stringify(config.keyboardShortcuts)); } }) };
};

test('the choice is a setting: it is changed, kept with the settings, and read again when it comes from another device', async () => {
  const { config, saved, store } = settingsHolder();
  assert.deepEqual(store.binding('searchChats'), { id: 'searchChats', combo: 'Mod+K', enabled: true, changed: false });
  let told = 0;
  store.subscribe(() => { told += 1; });
  assert.equal(store.set('searchChats', { combo: 'Mod+Alt+F' }), true);
  assert.deepEqual(config.keyboardShortcuts, { searchChats: { combo: 'Mod+Alt+F' } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(saved.length, 1, 'kept with the settings');
  store.set('searchChats', { enabled: false });
  assert.equal(store.binding('searchChats').enabled, false);
  store.set('searchChats', { combo: 'Mod+K', enabled: true });
  assert.deepEqual(config.keyboardShortcuts, {}, 'what equals the first choice is not kept');
  store.set('newChat', { combo: '' });
  assert.equal(store.binding('newChat').combo, '');
  assert.equal(store.set('newChat', { combo: 'bad' }), false);
  store.resetAll();
  assert.deepEqual(config.keyboardShortcuts, {});
  assert.ok(told >= 4);
  // another device changed a key: the settings are replaced, the store tells its listeners at the next look
  const before = told;
  config.keyboardShortcuts = { goHome: { combo: 'Mod+Alt+H' } };
  assert.equal(store.binding('goHome').combo, 'Mod+Alt+H', 'read from the settings every time');
  store.refresh();
  assert.equal(told, before + 1);
  store.refresh();
  assert.equal(told, before + 1, 'nothing new, nothing told');
});

test('a key that another shortcut has is a conflict; one that is off is not', () => {
  const { store } = settingsHolder();
  assert.equal(store.conflict('newChat', 'Mod+K')?.id, 'searchChats');
  assert.equal(store.conflict('searchChats', 'Mod+K'), null, 'its own key is not a conflict');
  store.set('searchChats', { enabled: false });
  assert.equal(store.conflict('newChat', 'Mod+K'), null);
});

test('the settings travel to the cloud setting by setting, and the shortcuts are one setting among them', () => {
  const base = { uiLanguage: 'en', keyboardShortcuts: {} };
  const baseline = digestSettings(base);
  const changed = { ...base, keyboardShortcuts: { newChat: { combo: 'Mod+Alt+N' } } };
  const stamps = stampChangedSettings(baseline, changed, 5000);
  assert.deepEqual(stamps, { keyboardShortcuts: 5000 });
  const merged = mergeSettings({ ...base, settingsStamps: {} }, { ...changed, settingsStamps: stamps });
  assert.deepEqual(merged.fields, { keyboardShortcuts: { newChat: { combo: 'Mod+Alt+N' } } }, 'the later setting of the cloud comes to this device');
});

const page = () => {
  const window = new Window({ url: 'https://noureon.test/', width: 1440, height: 900 });
  window.document.body.innerHTML = `<textarea id="message-input"></textarea>
    <button id="new-chat-btn"></button><button id="open-search-btn"></button><button id="upload-file-btn"></button><button id="open-cli-store-btn"></button><button id="settings-btn"></button>
    <button id="close-settings-btn"></button><div id="settings-modal" class="modal"></div>
    <ul id="settings-nav"><li class="settings-nav-item" data-section="accessibility">A</li></ul><div id="accessibility-section" class="settings-section"></div>`;
  return window;
};
const key = (window, init, target) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  (target || window.document.body).dispatchEvent(event);
  return event;
};

test('a key goes to the shortcut that has it: the keys the person chose, nothing when it is off or in the way', () => {
  const window = page();
  const { store } = settingsHolder();
  const ran = [];
  const stops = [registerShortcutAction('newChat', () => { ran.push('newChat'); }), registerShortcutAction('searchChats', () => { ran.push('search'); }), registerShortcutAction('goHome', () => false)];
  const dispatcher = startShortcutDispatcher({ document: window.document, store, platform: 'Win32' });
  const press = (init) => key(window, { code: 'KeyK', key: 'k', ...init });
  assert.equal(press({ ctrlKey: true }).defaultPrevented, true);
  assert.deepEqual(ran, ['search']);
  assert.equal(press({}).defaultPrevented, false, 'K alone is typing');
  assert.equal(press({ ctrlKey: true, shiftKey: true }).defaultPrevented, false);
  store.set('searchChats', { combo: 'Mod+Alt+F' });
  press({ ctrlKey: true });
  assert.deepEqual(ran, ['search'], 'the old keys do nothing now');
  assert.equal(key(window, { code: 'KeyF', key: 'f', ctrlKey: true, altKey: true }).defaultPrevented, true);
  assert.deepEqual(ran, ['search', 'search']);
  store.set('searchChats', { enabled: false });
  key(window, { code: 'KeyF', key: 'f', ctrlKey: true, altKey: true });
  assert.equal(ran.length, 2, 'off');
  // a handler that could not do it leaves the key to the page
  assert.equal(key(window, { code: 'KeyH', key: 'h', ctrlKey: true, shiftKey: true }).defaultPrevented, false);
  // a key held down runs it once; a dialog over the page stops the ones that act on the chat
  store.set('searchChats', { enabled: true, combo: 'Mod+K' });
  const dialog = window.document.createElement('div');
  dialog.className = 'modal visible';
  window.document.body.append(dialog);
  press({ ctrlKey: true });
  assert.equal(ran.length, 2, 'a dialog is open');
  dialog.remove();
  // while the keys are being chosen the dispatcher is quiet
  store.setRecording(true);
  press({ ctrlKey: true });
  assert.equal(ran.length, 2);
  store.setRecording(false);
  dispatcher.stop();
  press({ ctrlKey: true });
  assert.equal(ran.length, 2, 'stopped');
  stops.forEach((stop) => stop());
});

test('the shortcuts that act on the page press the buttons it has and take the person back to the chat first', () => {
  const window = page();
  const { document } = window;
  const log = [];
  for (const id of ['new-chat-btn', 'open-search-btn', 'upload-file-btn', 'open-cli-store-btn', 'settings-btn', 'close-settings-btn']) document.getElementById(id).addEventListener('click', () => log.push(id));
  const stop = registerPageActions({ document });
  assert.equal(runShortcutAction('newChat'), true);
  document.getElementById('settings-modal').classList.add('visible');
  assert.equal(runShortcutAction('searchChats'), true);
  assert.deepEqual(log, ['new-chat-btn', 'close-settings-btn', 'open-search-btn'], 'the settings are closed first');
  document.getElementById('upload-file-btn').style.display = 'none';
  assert.equal(runShortcutAction('attachFile'), false, 'a model that takes no file has no button');
  document.getElementById('upload-file-btn').style.display = 'flex';
  assert.equal(runShortcutAction('attachFile'), true);
  stop();
  assert.equal(runShortcutAction('newChat'), false, 'taken back');
});

test('the hints name the keys the person chose, and nothing for a shortcut that is off', () => {
  const { store } = settingsHolder();
  setActiveShortcutStore(store);
  assert.equal(shortcutLabelFor('openSettings', 'Win32'), 'Ctrl+,');
  assert.equal(shortcutLabelFor('openSettings', 'MacIntel'), '⌘,');
  store.set('openSettings', { combo: 'Mod+Alt+S' });
  assert.equal(shortcutLabelFor('openSettings', 'Win32'), 'Ctrl+Alt+S');
  store.set('openSettings', { enabled: false });
  assert.equal(shortcutLabelFor('openSettings', 'Win32'), '');
  setActiveShortcutStore(null);
  assert.equal(shortcutLabelFor('openSettings', 'Win32'), 'Ctrl+,', 'before the shortcuts start: the first keys');
});

const text = (id) => shortcutTexts.en[id] ?? id;

test('the tab lists every shortcut under its group with a switch and its keys, and a fixed group that cannot be changed', () => {
  const window = page();
  const { store } = settingsHolder();
  const section = mountShortcutsSection({ document: window.document, store, platform: 'Win32', text });
  assert.ok(section);
  const nav = window.document.getElementById('shortcuts-section-nav');
  assert.equal(nav.dataset.section, 'shortcuts');
  assert.equal(nav.previousElementSibling.dataset.section, 'accessibility', 'after Accessibility');
  assert.equal(window.document.getElementById('accessibility-section').nextElementSibling.id, 'shortcuts-section');
  const groups = [...window.document.querySelectorAll('#shortcuts-section .sc-group-title')].map((node) => node.textContent);
  assert.deepEqual(groups, ['Message box', 'Chat', 'Navigation', 'Fixed keys (cannot be changed)']);
  assert.equal(window.document.querySelectorAll('#shortcuts-section .sc-row').length, SHORTCUTS.length + FIXED_SHORTCUTS.length);
  assert.equal(window.document.querySelectorAll('#shortcuts-section input.toggle-checkbox').length, SHORTCUTS.length);
  assert.equal(window.document.querySelectorAll('#shortcuts-section .pz-label').length, SHORTCUTS.length + FIXED_SHORTCUTS.length, 'the names are found by the search of the settings');
  const rows = [...window.document.querySelectorAll('#shortcuts-section .sc-row')];
  const search = rows.find((row) => row.querySelector('.sc-label').textContent === 'Search chats');
  assert.equal(search.querySelector('.sc-key').textContent, 'Ctrl+K');
  assert.equal(window.document.getElementById('settings-nav').children.length, 2);
  mountShortcutsSection({ document: window.document, store, platform: 'Win32', text });
  assert.equal(window.document.querySelectorAll('#shortcuts-section-nav').length, 1, 'added once');
});

test('the tab: a switch turns a shortcut off, a click on the keys waits for new ones (Esc leaves, Backspace clears, a bad one says why), a button gives the first keys back', () => {
  const window = page();
  const { config, store } = settingsHolder();
  mountShortcutsSection({ document: window.document, store, platform: 'Win32', text });
  const rowOf = (name) => [...window.document.querySelectorAll('#shortcuts-section .sc-row')].find((row) => row.querySelector('.sc-label').textContent === name);
  const toggle = rowOf('New chat').querySelector('input.toggle-checkbox');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepEqual(config.keyboardShortcuts, { newChat: { enabled: false } });
  assert.ok(rowOf('New chat').classList.contains('is-off'));
  assert.equal(rowOf('New chat').querySelector('.sc-key').disabled, true);
  assert.equal(rowOf('New chat').querySelector('.sc-reset').hidden, false, 'a changed one has its reset');

  // choosing keys
  rowOf('Search chats').querySelector('.sc-key').click();
  assert.equal(store.isRecording(), true);
  assert.equal(rowOf('Search chats').querySelector('.sc-key').textContent, 'Press the keys');
  const press = (init) => key(window, init);
  press({ code: 'ControlLeft', key: 'Control', ctrlKey: true });
  assert.equal(store.isRecording(), true, 'a modifier alone waits for the key');
  press({ code: 'KeyT', key: 't', ctrlKey: true });
  assert.match(rowOf('Search chats').querySelector('.sc-msg').textContent, /browser keeps/);
  assert.equal(rowOf('Search chats').querySelector('.sc-msg').hidden, false);
  press({ code: 'KeyN', key: 'n' });
  assert.match(rowOf('Search chats').querySelector('.sc-msg').textContent, /Add Ctrl/);
  press({ code: 'KeyS', key: 'S', ctrlKey: true, shiftKey: true });
  assert.match(rowOf('Search chats').querySelector('.sc-msg').textContent, /Already used by “Side panel: docked \/ open on hover”/);
  assert.equal(store.isRecording(), true, 'it waits for another');
  const stop = press({ code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true });
  assert.equal(stop.defaultPrevented, true, 'the keys pressed while choosing are not for the page');
  assert.equal(store.isRecording(), false);
  assert.deepEqual(config.keyboardShortcuts.searchChats, { combo: 'Mod+Alt+J' });
  assert.equal(rowOf('Search chats').querySelector('.sc-key').textContent, 'Ctrl+Alt+J');
  // Esc leaves them as they were, Backspace takes them away
  rowOf('Search chats').querySelector('.sc-key').click();
  press({ code: 'Escape', key: 'Escape' });
  assert.equal(store.isRecording(), false);
  assert.equal(rowOf('Search chats').querySelector('.sc-key').textContent, 'Ctrl+Alt+J');
  rowOf('Search chats').querySelector('.sc-key').click();
  press({ code: 'Backspace', key: 'Backspace' });
  assert.equal(rowOf('Search chats').querySelector('.sc-key').textContent, 'None');
  assert.deepEqual(config.keyboardShortcuts.searchChats, { combo: '' });
  // the reset button of the row, and the one of the page
  rowOf('Search chats').querySelector('.sc-reset').click();
  assert.equal(rowOf('Search chats').querySelector('.sc-key').textContent, 'Ctrl+K');
  assert.deepEqual(Object.keys(config.keyboardShortcuts), ['newChat']);
  window.document.querySelector('#shortcuts-section .sc-reset-all').click();
  assert.deepEqual(config.keyboardShortcuts, {});
  assert.equal(window.document.querySelector('#shortcuts-section .sc-reset-all').disabled, true, 'nothing to give back');
  // a click elsewhere leaves the choice
  rowOf('New chat').querySelector('.sc-key').click();
  window.document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(store.isRecording(), false);
});
