import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsMobileShellHelper } from '../src/app/runtime/legacy-core/settings-mobile-shell-helper.js';

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
    },
    contains(name) {
      return values.has(name);
    },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    }
  };
}

function createElement(id = '') {
  const listeners = new Map();
  return {
    id,
    dataset: {},
    style: {},
    innerHTML: '',
    textContent: '',
    children: [],
    classList: createClassList(),
    prepend(child) {
      this.children.unshift(child);
      return child;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event);
    },
    querySelector(selector) {
      if (selector === '.flex.flex-1.overflow-hidden') return this.settingsBody || null;
      if (selector === '#settings-mobile-logout-btn') return this.logoutButton || null;
      return null;
    }
  };
}

function createFixture({ mobile = true } = {}) {
  const calls = [];
  const registry = new Map();
  const sections = ['general', 'appearance', 'about'].map((name) => {
    const section = createElement(`${name}-section`);
    section.name = name;
    registry.set(section.id, section);
    return section;
  });
  const title = createElement('settings-mobile-title');
  const backButton = createElement('settings-mobile-back-btn');
  const mobileList = createElement('settings-mobile-list');
  const mobileHeader = createElement('settings-mobile-header');
  const settingsBody = createElement('settings-body');
  const settingsModal = createElement('settings-modal');
  settingsModal.settingsBody = settingsBody;

  registry.set(title.id, title);
  registry.set(backButton.id, backButton);
  registry.set(mobileList.id, mobileList);
  registry.set(settingsModal.id, settingsModal);

  const listItems = [
    { dataset: { section: 'general', mobileTitle: 'General' } },
    { dataset: { section: 'appearance', mobileTitle: 'Appearance' } }
  ];

  const document = {
    createElement(tagName) {
      if (tagName === 'div') return createElement();
      return createElement(tagName);
    },
    getElementById(id) {
      if (id === 'settings-mobile-back-btn') return backButton;
      if (id === 'settings-mobile-title') return title;
      return registry.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.settings-section') return sections;
      if (selector === '#settings-mobile-list [data-section]') return listItems;
      return [];
    }
  };

  const originalCreateElement = document.createElement;
  document.createElement = (tagName) => {
    const element = originalCreateElement(tagName);
    let currentId = '';
    Object.defineProperty(element, 'id', {
      get() {
        return currentId;
      },
      set(value) {
        currentId = value;
        registry.set(value, element);
      }
    });
    return element;
  };

  const helper = createSettingsMobileShellHelper({
    window: { matchMedia: () => ({ matches: mobile }) },
    document,
    elements: { settingsModal },
    escapeHTML: (value) => String(value),
    getSettingsText: (key, fallback) => ({ settings: 'Settings', logout: 'Logout' }[key] || fallback),
    handleLogout: () => calls.push('logout'),
    setTimeout: (callback, delay) => {
      calls.push(['timeout', delay]);
      callback();
      return 1;
    },
    clearTimeout: (id) => calls.push(['clearTimeout', id])
  });

  return { backButton, calls, document, helper, listItems, mobileList, sections, settingsBody, settingsModal, title };
}

test('module exports mobile shell helper factory', () => {
  assert.equal(typeof createSettingsMobileShellHelper, 'function');
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsMobileShellHelper(),
    /missing dependencies:/
  );
});

test('mobile settings list renders groups and logout action', () => {
  const { calls, helper, mobileList } = createFixture();
  mobileList.logoutButton = createElement('settings-mobile-logout-btn');

  helper.renderSettingsMobileList();

  assert.match(mobileList.innerHTML, /settings-mobile-group/);
  assert.match(mobileList.innerHTML, /settings-mobile-list-item settings-nav-item/);
  assert.match(mobileList.innerHTML, /id="settings-mobile-logout-btn"/);

  mobileList.logoutButton.dispatch('click');
  assert.deepEqual(calls, ['logout']);
});

test('mobile settings groups preserve the expected section order', () => {
  const { helper } = createFixture();

  const sections = helper.getSettingsMobileGroups()
    .flatMap((group) => group.items.map((item) => item.section));

  assert.deepEqual(sections, [
    'user',
    'personalization',
    'memory',
    'model-management',
    'data-management',
    'accessibility',
    'trash',
    'about'
  ]);
});

test('clicking a mobile group opens the expected detail section', () => {
  const { document, helper, sections, settingsModal, title } = createFixture();

  helper.ensureSettingsMobileShell();
  document.getElementById('settings-mobile-list').dispatch('click', {
    target: {
      closest: () => ({ dataset: { section: 'appearance' } })
    }
  });

  assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), true);
  assert.equal(sections.find((section) => section.id === 'appearance-section').classList.contains('active'), true);
  assert.equal(sections.find((section) => section.id === 'general-section').classList.contains('active'), false);
  assert.equal(title.textContent, 'Appearance');
});

test('back button returns to the mobile list and clears active sections', () => {
  const { backButton, calls, helper, sections, settingsModal, title } = createFixture();

  helper.openSettingsMobileSection('general');
  backButton.dispatch('click');

  assert.deepEqual(calls, [['timeout', 280]]);
  assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), false);
  assert.equal(settingsModal.classList.contains('settings-mobile-returning'), false);
  assert.equal(sections.some((section) => section.classList.contains('active')), false);
  assert.equal(title.textContent, 'Settings');
});

test('desktop list reset skips return animation but keeps section classes synchronized', () => {
  const { helper, sections, settingsModal } = createFixture({ mobile: false });
  sections[0].classList.add('active');
  settingsModal.classList.add('settings-mobile-detail-open');

  helper.showSettingsMobileList();

  assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), false);
  assert.equal(settingsModal.classList.contains('settings-mobile-returning'), false);
  assert.equal(sections.some((section) => section.classList.contains('active')), false);
});

test('helper exposes injected viewport and transition helpers without global lifecycle state', () => {
  const { helper } = createFixture();

  assert.equal(helper.isMobileSettingsViewport(), true);
  assert.equal(helper.settingsMobileViewTransitionMs, 280);
  assert.equal(Array.isArray(helper.getSettingsMobileGroups()), true);
});

test('import is inert', () => {
  assert.equal(typeof createSettingsMobileShellHelper, 'function');
});
