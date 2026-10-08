import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsThemeBubbleControls } from '../src/app/runtime/legacy-core/settings-theme-bubble-controls.js';

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
      if (force === true) {
        values.add(name);
        return true;
      }
      if (force === false) {
        values.delete(name);
        return false;
      }
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function createElement(tagName = 'div') {
  const listeners = new Map();
  return {
    tagName,
    children: [],
    dataset: {},
    style: {},
    className: '',
    innerHTML: '',
    textContent: '',
    classList: createClassList(),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    getBoundingClientRect() {
      return { bottom: 20, height: 10 };
    },
    querySelector(selector) {
      if (selector === '.color-dropdown-btn') {
        return this.children.find((child) => child.className === 'color-dropdown-btn') || null;
      }
      return null;
    }
  };
}

function createFixture(overrides = {}) {
  const styleWrites = [];
  const calls = [];
  const config = {
    userBubbleColor: 'default'
  };
  const elements = {
    userBubbleColorDropdown: createElement(),
    settingsModal: createElement()
  };
  elements.settingsModal.classList.add('hidden');

  const document = {
    documentElement: {
      classList: createClassList(),
      style: {
        setProperty(name, value) {
          styleWrites.push([name, value]);
        }
      }
    },
    createElement,
    createTextNode(text) {
      return { textContent: text };
    }
  };

  const controls = createSettingsThemeBubbleControls({
    window: { innerHeight: 500 },
    document,
    elements,
    config,
    userBubbleColors: {
      default: {light: '#dddddd'},
      green: {light: '#88ff88'}
    },
    saveConfig: async () => calls.push('saveConfig')
  });

  return { calls, config, controls, document, elements, styleWrites };
}

test('module exports theme and bubble control factory', () => {
  assert.equal(typeof createSettingsThemeBubbleControls, 'function');
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsThemeBubbleControls(),
    /missing dependencies:/
  );
});

test('setTheme compatibility clears retired theme config, refreshes the bubble colour, and saves', async () => {
  const { calls, config, controls, styleWrites } = createFixture();
  config.theme = 'dark';

  await controls.setTheme('light');

  assert.equal('theme' in config, false);
  assert.deepEqual(styleWrites, [
    ['--user-bubble-choice-light', '#dddddd'],
    ['--user-bubble-choice-dark', '#dddddd']
  ]);
  assert.deepEqual(calls, ['saveConfig']);
});

test('the user bubble colour is always written as a solid colour', () => {
  const { controls, styleWrites } = createFixture();
  controls.setUserBubbleColor();
  assert.deepEqual(styleWrites, [
    ['--user-bubble-choice-light', '#dddddd'],
    ['--user-bubble-choice-dark', '#dddddd']
  ]);
});

test('user bubble color dropdown renders options and writes selected color', () => {
  const { config, controls, elements, styleWrites } = createFixture();

  controls.renderUserBubbleColorDropdown();
  const menu = elements.userBubbleColorDropdown.children[1];
  const greenOption = menu.children.find((child) => child.dataset.color === 'green');

  assert.equal(elements.userBubbleColorDropdown.children[0].dataset.color, 'default');
  assert.ok(greenOption);

  greenOption.dispatch('click');

  assert.equal(config.userBubbleColor, 'green');
  assert.deepEqual(styleWrites.slice(-2), [['--user-bubble-choice-light', '#88ff88'], ['--user-bubble-choice-dark', '#88ff88']]);
  assert.equal(menu.classList.contains('show'), false);
});

test('shared dropdown helper positions menu without global state', () => {
  const { controls, elements } = createFixture();

  controls.renderUserBubbleColorDropdown();
  const button = elements.userBubbleColorDropdown.children[0];
  const menu = elements.userBubbleColorDropdown.children[1];

  button.dispatch('click');

  assert.equal(menu.classList.contains('show'), true);
  assert.equal(menu.style.top, 'calc(100% + 0.45rem)');
  assert.equal(menu.style.bottom, 'auto');
});

test('shared dropdown helper toggles the menu state on repeated button clicks', () => {
  const { controls, elements } = createFixture();

  controls.renderUserBubbleColorDropdown();
  const button = elements.userBubbleColorDropdown.children[0];
  const menu = elements.userBubbleColorDropdown.children[1];

  button.dispatch('click');
  assert.equal(menu.classList.contains('show'), true);

  button.dispatch('click');
  assert.equal(menu.classList.contains('show'), false);
});

test('import is inert', () => {
  assert.equal(typeof createSettingsThemeBubbleControls, 'function');
});
