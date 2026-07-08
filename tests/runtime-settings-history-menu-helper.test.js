import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsHistoryMenuHelper } from '../src/app/runtime/legacy-core/settings-history-menu-helper.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.id = '';
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.removed = false;
    this.classList = {
      values: new Set(),
      add: (name) => this.classList.values.add(name),
      remove: (name) => this.classList.values.delete(name),
      contains: (name) => this.classList.values.has(name)
    };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this._selectorMap = new Map();
    const classPattern = /<button([^>]*)class="([^"]*)"([^>]*)>/g;
    let match;
    while ((match = classPattern.exec(value))) {
      const attrs = `${match[1]} ${match[3]}`;
      const classNames = match[2].split(/\s+/);
      const element = new FakeElement('button');
      element.className = match[2];
      const folderMatch = attrs.match(/data-folder-id="([^"]+)"/);
      if (folderMatch) element.dataset.folderId = folderMatch[1];
      const idMatch = attrs.match(/data-id="([^"]+)"/);
      if (idMatch) element.dataset.id = idMatch[1];
      for (const className of classNames) {
        const selector = `.${className}`;
        if (!this._selectorMap.has(selector)) this._selectorMap.set(selector, []);
        this._selectorMap.get(selector).push(element);
      }
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  querySelector(selector) {
    return this._selectorMap?.get(selector)?.[0] || null;
  }

  querySelectorAll(selector) {
    return this._selectorMap?.get(selector) || [];
  }

  remove() {
    this.removed = true;
  }

  getBoundingClientRect() {
    return { top: 10, bottom: 40, left: 20 };
  }
}

function createHarness(overrides = {}) {
  const calls = [];
  let existingPopover = overrides.existingPopover || null;
  const body = new FakeElement('body');
  const document = {
    body,
    getElementById(id) {
      return id === 'history-popover' ? existingPopover : null;
    },
    createElement(tagName) {
      const element = new FakeElement(tagName);
      if (tagName === 'div') existingPopover = element;
      return element;
    }
  };
  const helper = createSettingsHistoryMenuHelper({
    window: { innerHeight: 800 },
    document,
    requestAnimationFrame: (callback) => callback(),
    getConfig: () => ({ uiLanguage: 'en' }),
    getConversations: () => [{ id: 'conv-1', pinned: false, folderId: null }],
    getFolders: () => [{ id: 'folder-1', name: 'Work', color: 'gray' }],
    i18n: {
      en: {
        pin: 'Pin',
        unpin: 'Unpin',
        rename: 'Rename',
        archive: 'Archive',
        delete: 'Delete',
        moveToFolder: 'Move to folder',
        moveOutOfFolder: 'Move out',
        createNewFolder: 'New folder',
        enterFolderName: 'Folder name'
      }
    },
    showRenameModal: (...args) => calls.push(['rename', ...args]),
    togglePinChat: (...args) => calls.push(['pin', ...args]),
    archiveChat: (...args) => calls.push(['archive', ...args]),
    deleteChat: (...args) => calls.push(['delete', ...args]),
    moveConversationToFolder: (...args) => calls.push(['move', ...args]),
    createNewFolder: (name) => {
      calls.push(['createFolder', name]);
      return 'created-folder';
    },
    showCustomPrompt: async (...args) => {
      calls.push(['prompt', ...args]);
      return 'Ideas';
    },
    resolveFolderColor: (value, palette, fallback) => palette[value] || value || fallback,
    folderColors: { gray: '#808080', blue: '#60a5fa' },
    ...overrides.dependencies
  });
  return { helper, calls, document, getPopover: () => existingPopover };
}

test('module exports createSettingsHistoryMenuHelper and imports inertly', () => {
  assert.equal(typeof createSettingsHistoryMenuHelper, 'function');
  const source = readSource('src/app/runtime/legacy-core/settings-history-menu-helper.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsHistoryMenuHelper(),
    /missing dependencies/
  );
});

test('createHistoryMenu creates a popover and wires primary actions', () => {
  const { helper, calls, getPopover } = createHarness();
  const targetButton = new FakeElement('button');
  targetButton.id = 'target-1';

  helper.createHistoryMenu('conv-1', targetButton);
  const popover = getPopover();

  assert.equal(popover.id, 'history-popover');
  assert.equal(popover.dataset.targetId, 'target-1');
  assert.equal(popover.classList.contains('visible'), true);

  popover.querySelector('.rename-conv-btn').listeners.click('event');
  popover.querySelector('.pin-btn').listeners.click('event');
  popover.querySelector('.archive-btn').listeners.click('event');
  popover.querySelector('.delete-btn').listeners.click('event');

  assert.deepEqual(calls, [
    ['rename', 'conv-1', 'conversation', 'event'],
    ['pin', 'conv-1', 'event'],
    ['archive', 'conv-1', 'event'],
    ['delete', 'conv-1', 'event']
  ]);
});

test('folder move and new folder actions use injected callbacks', async () => {
  const { helper, calls, getPopover } = createHarness();
  const targetButton = new FakeElement('button');
  targetButton.id = 'target-2';

  helper.createHistoryMenu('conv-1', targetButton);
  const popover = getPopover();

  popover.querySelectorAll('.move-to-folder-btn')[0].listeners.click();
  await popover.querySelector('.new-folder-from-menu-btn').listeners.click();

  assert.deepEqual(calls, [
    ['move', 'conv-1', 'folder-1'],
    ['prompt', 'Folder name', 'New folder'],
    ['createFolder', 'Ideas'],
    ['move', 'conv-1', 'created-folder']
  ]);
});

test('folder move submenu shows saved folder svg without a new-folder divider', () => {
  const { helper, getPopover } = createHarness({
    dependencies: {
      getFolders: () => [{ id: 'folder-1', name: 'Work', icon: 'star', color: 'blue' }]
    }
  });
  const targetButton = new FakeElement('button');
  targetButton.id = 'target-folder-icon';

  helper.createHistoryMenu('conv-1', targetButton);
  const html = getPopover().innerHTML;
  const submenuHtml = html.match(/<div class="move-folder-submenu[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';

  assert.match(submenuHtml, /folder-menu-icon/);
  assert.match(submenuHtml, /M11\.049 2\.927/);
  assert.match(submenuHtml, /--folder-icon-color:\s*#60a5fa/);
  assert.doesNotMatch(submenuHtml, /border-t[\s\S]*new-folder-from-menu-btn/);
});

test('move-out action is wired for foldered conversations', () => {
  const { helper, calls, getPopover } = createHarness({
    dependencies: {
      getConversations: () => [{ id: 'conv-1', pinned: true, folderId: 'folder-1' }]
    }
  });
  const targetButton = new FakeElement('button');
  targetButton.id = 'target-3';

  helper.createHistoryMenu('conv-1', targetButton);
  getPopover().querySelector('.move-out-of-folder-btn').listeners.click();

  assert.deepEqual(calls, [
    ['move', 'conv-1', null]
  ]);
});

test('clicking the same target removes the existing popover without recreating it', () => {
  const existingPopover = new FakeElement('div');
  existingPopover.dataset.targetId = 'target-4';
  const { helper, document } = createHarness({ existingPopover });
  const targetButton = new FakeElement('button');
  targetButton.id = 'target-4';

  helper.createHistoryMenu('conv-1', targetButton);

  assert.equal(existingPopover.removed, true);
  assert.equal(document.body.children.length, 0);
});
