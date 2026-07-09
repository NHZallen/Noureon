import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsDesktopSectionHelper } from '../src/app/runtime/legacy-core/settings-desktop-section-helper.js';

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
    },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function createElement({ section, active = false } = {}) {
  const listeners = new Map();
  const listenerCounts = new Map();
  return {
    dataset: section ? { section } : {},
    classList: createClassList(active ? ['active'] : []),
    addEventListener(type, listener) {
      listeners.set(type, listener);
      listenerCounts.set(type, (listenerCounts.get(type) || 0) + 1);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    listenerCount(type) {
      return listenerCounts.get(type) || 0;
    }
  };
}

function createFixture({ mobile = false } = {}) {
  const calls = [];
  const navItems = [
    createElement({ section: 'general', active: true }),
    createElement({ section: 'appearance' }),
    createElement({ section: 'user' })
  ];
  const sections = new Map([
    ['general-section', createElement()],
    ['appearance-section', createElement()],
    ['user-section', createElement()]
  ]);
  sections.get('general-section').classList.add('active');
  const settingsModal = createElement();
  settingsModal.classList.add('settings-mobile-detail-open', 'settings-mobile-returning');
  const settingsNav = {
    querySelectorAll(selector) {
      assert.equal(selector, '.settings-nav-item[data-section]');
      return navItems;
    },
    querySelector(selector) {
      assert.match(selector, /\.settings-nav-item/);
      if (selector === '.settings-nav-item.active') {
        return navItems.find((item) => item.classList.contains('active')) || null;
      }
      return navItems[0] || null;
    }
  };
  const helper = createSettingsDesktopSectionHelper({
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, '.settings-section');
        return Array.from(sections.values());
      },
      getElementById(id) {
        return sections.get(id) || null;
      }
    },
    elements: { settingsNav, settingsModal },
    isMobileSettingsViewport: () => mobile,
    showSettingsMobileList: (...args) => calls.push(['showSettingsMobileList', ...args]),
    clearSettingsMobileViewTransition: () => calls.push('clearSettingsMobileViewTransition')
  });
  return { calls, helper, navItems, sections, settingsModal };
}

test('module exports desktop section helper factory', () => {
  assert.equal(typeof createSettingsDesktopSectionHelper, 'function');
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsDesktopSectionHelper(),
    /missing dependencies:/
  );
});

test('desktop nav items can be bound with fake DOM', () => {
  const { helper, navItems } = createFixture();

  const boundItems = helper.bindDesktopSettingsSections();

  assert.deepEqual(boundItems, navItems);
  assert.equal(navItems[0].dataset.settingsDesktopBound, 'true');
  assert.equal(navItems[1].dataset.settingsDesktopBound, 'true');
});

test('clicking nav item activates expected nav item and section', () => {
  const { helper, navItems, sections } = createFixture();

  helper.bindDesktopSettingsSections();
  navItems[1].dispatch('click');

  assert.equal(navItems[0].classList.contains('active'), false);
  assert.equal(navItems[1].classList.contains('active'), true);
  assert.equal(sections.get('general-section').classList.contains('active'), false);
  assert.equal(sections.get('appearance-section').classList.contains('active'), true);
});

test('desktop sync preserves active nav class and active section class', () => {
  const { calls, helper, navItems, sections, settingsModal } = createFixture();
  navItems[0].classList.remove('active');
  navItems[1].classList.add('active');

  const boundItems = helper.bindDesktopSettingsSections();
  helper.syncSettingsSectionForViewport(boundItems);

  assert.deepEqual(calls, ['clearSettingsMobileViewTransition']);
  assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), false);
  assert.equal(settingsModal.classList.contains('settings-mobile-returning'), false);
  assert.equal(navItems[0].classList.contains('active'), false);
  assert.equal(navItems[1].classList.contains('active'), true);
  assert.equal(sections.get('general-section').classList.contains('active'), false);
  assert.equal(sections.get('appearance-section').classList.contains('active'), true);
});

test('desktop default section prefers the async user section when available', () => {
  const { helper, navItems, sections } = createFixture();

  const activated = helper.activateDefaultDesktopSettingsSection(navItems);

  assert.equal(activated, navItems[2]);
  assert.equal(navItems[0].classList.contains('active'), false);
  assert.equal(navItems[2].classList.contains('active'), true);
  assert.equal(sections.get('general-section').classList.contains('active'), false);
  assert.equal(sections.get('user-section').classList.contains('active'), true);
});

test('mobile viewport delegates section reset to mobile shell helper', () => {
  const { calls, helper, settingsModal } = createFixture({ mobile: true });

  helper.syncSettingsSectionForViewport(helper.bindDesktopSettingsSections());

  assert.deepEqual(calls, [['showSettingsMobileList', { animate: false }]]);
  assert.equal(settingsModal.classList.contains('settings-mobile-detail-open'), true);
});

test('binding is idempotent for already-bound nav items', () => {
  const { helper, navItems } = createFixture();
  helper.bindDesktopSettingsSections();

  helper.bindDesktopSettingsSections();

  assert.equal(navItems[0].dataset.settingsDesktopBound, 'true');
  assert.equal(navItems[0].listenerCount('click'), 1);
  assert.equal(navItems[1].listenerCount('click'), 1);
});

test('import is inert', () => {
  assert.equal(typeof createSettingsDesktopSectionHelper, 'function');
});
