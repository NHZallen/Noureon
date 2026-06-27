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
    theme: 'dark',
    aiBubbleColor: 'default',
    userBubbleColor: 'default'
  };
  const elements = {
    aiBubbleColorDropdown: createElement(),
    userBubbleColorDropdown: createElement(),
    themeDarkBtn: createElement('button'),
    themeLightBtn: createElement('button'),
    settingsModal: createElement()
  };
  elements.settingsModal.classList.add('hidden');

  const document = {
    body: { classList: createClassList(overrides.wallpaper ? ['custom-wallpaper-active'] : []) },
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
    aiBubbleColors: {
      default: { dark: '#111111', light: '#eeeeee' },
      blue: { dark: '#0000ff', light: '#88aaff' }
    },
    userBubbleColors: {
      default: { dark: '#222222', light: '#dddddd' },
      green: { dark: '#00ff00', light: '#88ff88' }
    },
    hexToRgba: (hex, alpha) => `rgba(${hex}, ${alpha})`,
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

test('setTheme updates config, theme button state, bubble colors, and saves', async () => {
  const { calls, config, controls, document, elements, styleWrites } = createFixture();

  await controls.setTheme('light');

  assert.equal(config.theme, 'light');
  assert.equal(document.documentElement.classList.contains('dark'), false);
  assert.deepEqual(styleWrites, [
    ['--ai-bubble-bg', 'transparent'],
    ['--user-bubble-bg', '#dddddd']
  ]);
  assert.deepEqual(calls, ['saveConfig']);
  assert.equal(elements.themeDarkBtn.classList.contains('active'), false);
  assert.equal(elements.themeLightBtn.classList.contains('active'), true);
});

test('setTheme is inert while custom wallpaper is active', async () => {
  const { calls, config, controls, styleWrites } = createFixture({ wallpaper: true });

  await controls.setTheme('light');

  assert.equal(config.theme, 'dark');
  assert.deepEqual(styleWrites, []);
  assert.deepEqual(calls, []);
});

test('bubble color setters preserve wallpaper and non-wallpaper behavior', () => {
  const normal = createFixture();
  normal.controls.setAiBubbleColor();
  normal.controls.setUserBubbleColor();
  assert.deepEqual(normal.styleWrites, [
    ['--ai-bubble-bg', 'transparent'],
    ['--user-bubble-bg', '#222222']
  ]);

  const wallpaper = createFixture({ wallpaper: true });
  wallpaper.controls.setAiBubbleColor();
  wallpaper.controls.setUserBubbleColor();
  assert.deepEqual(wallpaper.styleWrites, [
    ['--ai-bubble-bg', 'rgba(#111111, 0.75)'],
    ['--user-bubble-bg', 'rgba(#222222, 0.7)']
  ]);
});

test('AI bubble color dropdown renders options and writes selected color', () => {
  const { config, controls, elements, styleWrites } = createFixture();

  controls.renderAiBubbleColorDropdown();
  const menu = elements.aiBubbleColorDropdown.children[1];
  const blueOption = menu.children.find((child) => child.dataset.color === 'blue');

  assert.equal(elements.aiBubbleColorDropdown.children[0].dataset.color, 'default');
  assert.ok(blueOption);

  blueOption.dispatch('click');

  assert.equal(config.aiBubbleColor, 'blue');
  assert.deepEqual(styleWrites.at(-1), ['--ai-bubble-bg', 'transparent']);
  assert.equal(menu.classList.contains('show'), false);
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
  assert.deepEqual(styleWrites.at(-1), ['--user-bubble-bg', '#00ff00']);
  assert.equal(menu.classList.contains('show'), false);
});

test('shared dropdown helper positions menu without global state', () => {
  const { controls, elements } = createFixture();

  controls.renderAiBubbleColorDropdown();
  const button = elements.aiBubbleColorDropdown.children[0];
  const menu = elements.aiBubbleColorDropdown.children[1];

  button.dispatch('click');

  assert.equal(menu.classList.contains('show'), true);
  assert.equal(menu.style.top, '100%');
  assert.equal(menu.style.bottom, 'auto');
});

test('shared dropdown helper toggles the menu state on repeated button clicks', () => {
  const { controls, elements } = createFixture();

  controls.renderAiBubbleColorDropdown();
  const button = elements.aiBubbleColorDropdown.children[0];
  const menu = elements.aiBubbleColorDropdown.children[1];

  button.dispatch('click');
  assert.equal(menu.classList.contains('show'), true);

  button.dispatch('click');
  assert.equal(menu.classList.contains('show'), false);
});

test('import is inert', () => {
  assert.equal(typeof createSettingsThemeBubbleControls, 'function');
});
