import assert from 'node:assert/strict';
import test from 'node:test';

import { createMobileContextMenus } from '../src/app/runtime/features/mobile-context-menus.js';
import { createAstraStoreLifecycle } from '../src/app/runtime/features/astra-store-lifecycle.js';
import { createDom } from './behaviours/helpers/create-dom.js';

function menus(document, overrides = {}) {
  const calls = [];
  const timers = [];
  const record = (name) => (...args) => calls.push([name, ...args.filter((arg) => typeof arg !== 'object' || arg === null)]);
  const state = {
    config: { uiLanguage: 'en' },
    conversations: [{ id: 'c', title: 'Chat', folderId: 'f', pinned: false }],
    folders: [{ id: 'f', name: 'Folder' }],
    astras: [{ id: 'a', name: 'Noura', description: 'D', instructions: 'I' }]
  };
  const elements = {
    batchMoveModal: { id: 'move' },
    astrasNameInput: {}, astrasDescInput: {}, astrasInstructionsInput: {},
    astrasCreateModal: { id: 'create', querySelector: () => ({}) }
  };
  const api = createMobileContextMenus({
    document, elements, i18n: { en: {} },
    getUiLanguage: () => state.config.uiLanguage,
    getConversations: () => state.conversations,
    getFolders: () => state.folders,
    getAstras: () => state.astras,
    editAstras: record('editAstra'),
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback, ms) => timers.push([callback, ms]),
    showRenameModal: record('rename'), togglePinChat: record('pin'), archiveChat: record('archive'), deleteChat: record('delete'),
    moveConversationToFolder: record('move'), renderBatchMoveModal: record('batchMove'),
    showFolderSettingsModal: record('folderSettings'), deleteFolder: record('deleteFolder'), deleteAstras: record('deleteAstra'),
    openAvatarEditor: record('avatar'), toggleModal: (modal, open) => calls.push(['modal', modal.id, open]),
    ...overrides
  });
  const runTimers = () => timers.splice(0).forEach(([callback, ms]) => { assert.equal(ms, 300); callback(); });
  return { api, calls, state, elements, runTimers };
}

const tap = (document, action) => document.querySelector(`#mobile-context-menu [data-action="${action}"]`).click();

test('a held conversation opens one sheet whose items run after it slides away', () => {
  const { document, cleanup } = createDom();
  try {
    const { api, calls, runTimers } = menus(document);
    api.showMobileContextMenu('c');
    api.showMobileContextMenu('c');
    assert.equal(document.querySelectorAll('#mobile-context-menu-wrapper').length, 1, 'an older sheet is replaced');
    assert.ok(document.getElementById('mobile-context-menu').classList.contains('visible'));
    tap(document, 'pin');
    assert.deepEqual(calls, [], 'nothing runs before the sheet has slid away');
    assert.equal(document.getElementById('mobile-context-menu').classList.contains('visible'), false);
    runTimers();
    assert.deepEqual(calls, [['pin', 'c']]);

    api.showMobileContextMenu('c');
    tap(document, 'move-out');
    runTimers();
    assert.deepEqual(calls.slice(1), [['move', 'c', null]]);

    api.showMobileContextMenu('missing');
    assert.equal(document.getElementById('mobile-context-menu-wrapper'), null, 'an unknown conversation only closes the sheet');
  } finally {
    cleanup();
  }
});

test('the sheet closes on the overlay and when pulled down far enough', () => {
  const { document, window, cleanup } = createDom();
  try {
    const { api } = menus(document);
    api.showMobileContextMenuForFolder('f');
    const menu = document.getElementById('mobile-context-menu');
    const touch = (type, y) => {
      const event = new window.Event(type);
      event.touches = [{ clientY: y }];
      menu.dispatchEvent(event);
    };
    touch('touchstart', 0);
    touch('touchmove', 40);
    assert.equal(menu.style.transform, 'translateY(40px)');
    touch('touchend', 40);
    assert.equal(menu.style.transform, '', 'a short pull springs back');
    assert.ok(menu.classList.contains('visible'));
    touch('touchstart', 0);
    touch('touchmove', 150);
    touch('touchend', 150);
    assert.equal(menu.classList.contains('visible'), false);

    api.showMobileContextMenuForAstras('a');
    document.getElementById('mobile-context-menu-overlay').click();
    assert.equal(document.getElementById('mobile-context-menu').classList.contains('visible'), false);
  } finally {
    cleanup();
  }
});

test('a held folder and a held Noura run their own actions', () => {
  const { document, cleanup } = createDom();
  try {
    const { api, calls, runTimers } = menus(document);
    api.showMobileContextMenuForFolder('f');
    tap(document, 'customize-folder');
    runTimers();
    api.showMobileContextMenuForAstras('a');
    tap(document, 'edit-astras');
    runTimers();
    assert.deepEqual(calls, [['folderSettings', 'f'], ['editAstra', 'a']]);
  } finally {
    cleanup();
  }
});

test('subscribing to an official Noura adds a copy; unsubscribing deletes it in the cloud first', async () => {
  const { document, cleanup } = createDom('<div id="store-category-list"></div><div id="grid"></div>');
  try {
    const notes = [];
    const deleted = [];
    let astras = [];
    const store = createAstraStoreLifecycle({
      document, elements: { storeGrid: document.getElementById('grid') }, i18n: { en: { subscribed: 'Added', unsubscribed: 'Removed' } },
      OFFICIAL_ASTRAS: [{ id: 'writer', name: 'Writer', description: 'Writes', category: '生產力' }],
      getUiLanguage: () => 'en',
      getAstras: () => astras,
      replaceAstras: (next) => { astras = next; return astras; },
      requestAnimationFrame: (callback) => callback(), crypto: { randomUUID: () => 'copy-1' }, console,
      FileReader: class {}, Cropper: class {}, escapeHTML: (value) => String(value),
      deleteAstrasFromCloud: async (ids) => deleted.push(ids), showNotification: (text) => notes.push(text), toggleModal() {},
      saveAppData: async () => notes.push('saved'), renderAstras: () => notes.push('astras')
    });
    store.renderStore();
    assert.equal(document.querySelectorAll('.astras-store-card').length, 1);
    await store.handleSubscription('writer');
    assert.deepEqual(astras.map((a) => [a.id, a.officialId]), [['copy-1', 'writer']]);
    await store.handleSubscription('writer');
    assert.deepEqual(deleted, [['copy-1']]);
    assert.deepEqual(astras, []);
    assert.deepEqual(notes, ['Added', 'saved', 'astras', 'Removed', 'saved', 'astras']);
  } finally {
    cleanup();
  }
});

test('the store keeps its own category, and closing the picture editor lets go of the cropper', async () => {
  const { document, cleanup } = createDom('<div id="store-category-list"></div><div id="grid"></div><img id="crop">');
  try {
    const modals = [];
    const destroyed = [];
    let astras = [{ id: 'mine', name: 'Mine', description: 'D', category: '遊戲' }];
    const store = createAstraStoreLifecycle({
      document,
      elements: {
        storeGrid: document.getElementById('grid'),
        avatarCropImage: document.getElementById('crop'),
        astrasAvatarModal: { id: 'avatar' },
        astrasAvatarInput: { click: () => modals.push('pick') }
      },
      i18n: { en: {} },
      OFFICIAL_ASTRAS: [{ id: 'writer', name: 'Writer', description: 'Writes', category: '生產力' }],
      getUiLanguage: () => 'en',
      getAstras: () => astras,
      replaceAstras: (next) => { astras = next; return astras; },
      requestAnimationFrame: (callback) => callback(), crypto: { randomUUID: () => 'id' }, console,
      FileReader: class { readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,' } }); } },
      Cropper: class { destroy() { destroyed.push('cropper'); } },
      escapeHTML: (value) => String(value), showNotification() {},
      toggleModal: (modal, open) => modals.push([modal.id, open]),
      saveAppData: async () => {}, renderAstras() {}
    });
    store.renderStore();
    assert.equal(document.querySelectorAll('.astras-store-card').length, 2, 'every category at first');
    [...document.querySelectorAll('.store-category-btn')].find((button) => button.textContent === '遊戲').click();
    assert.equal(document.querySelectorAll('.astras-store-card').length, 1, 'the chosen category only');

    store.openAvatarEditor('mine');
    store.handleAvatarUpload({ target: { files: [new Blob(['x'])], value: 'x' } });
    store.cancelAvatarCrop();
    assert.deepEqual(destroyed, ['cropper']);
    assert.deepEqual(modals, ['pick', ['avatar', true], ['avatar', false]]);
    await store.handleConfirmAvatarCrop();
    assert.equal(astras[0].avatarUrl, undefined, 'nothing is saved once the editor was closed');
  } finally {
    cleanup();
  }
});
