import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createThemeAppearanceLifecycle } from '../src/app/runtime/features/theme-appearance-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function createHarness(overrides = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  const calls = [];
  const state = {
    config: {
      uiLanguage: 'zh-TW',
      uiTheme: {
        mode: 'default',
        customColor: '#111111'
      }
    }
  };
  const elements = {};

  const dependencies = {
    document,
    elements,
    state,
    i18n: { 'zh-TW': { colorDefault: '預設', colorGreen: '綠色', colorPink: '粉紅色', colorCustom: '自訂' } },
    UI_THEME_COLORS: {
      default: '#3b82f6',
      green: '#10b981',
      pink: '#ec4899'
    },
    setUserBubbleColor: () => calls.push(['setUserBubbleColor']),
    ...overrides
  };

  return {
    window,
    document,
    calls,
    state,
    elements,
    lifecycle: createThemeAppearanceLifecycle(dependencies)
  };
}

function installColorOptionDom(document, elements) {
  elements.uiColorOptions = document.createElement('div');
  elements.customColorPickerContainer = document.createElement('div');
  elements.customColorPickerContainer.innerHTML = '<span class="color-dot"></span><input type="text" class="pz-hex-text">';
  elements.customColorInput = document.createElement('input');
  elements.customColorInput.type = 'color';

  document.body.append(
    elements.uiColorOptions,
    elements.customColorPickerContainer,
    elements.customColorInput
  );
}

test('applyUiTheme sets the default and custom button colour variables', () => {
  const { document, calls, state, lifecycle } = createHarness();

  lifecycle.applyUiTheme();
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg'), '#3b82f6');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-text'), '#ffffff');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg-override'), '');
  assert.deepEqual(calls, []);

  state.config.uiTheme.mode = 'custom';
  state.config.uiTheme.customColor = '#ffffff';
  lifecycle.applyUiTheme();
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg'), '#ffffff');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-text'), '#000000');

  // A config still carrying the retired adaptive mode shows the default colour.
  state.config.uiTheme.mode = 'adaptive';
  lifecycle.applyUiTheme();
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg'), '#3b82f6');
});

const choiceOf = (elements) => elements.uiColorOptions.querySelector('.color-option.selected')?.dataset.choice;
const clickChoice = (elements, id) => elements.uiColorOptions.querySelector(`.color-option[data-choice="${id}"]`).dispatchEvent(new elements.uiColorOptions.ownerDocument.defaultView.Event('click'));

test('renderUiColorOptions lists the default, the named colours and a custom choice, and marks the one in use', () => {
  const { document, elements, state, lifecycle } = createHarness();
  installColorOptionDom(document, elements);
  state.config.uiTheme = { mode: 'default', customColor: '#111111' };

  lifecycle.renderUiColorOptions();

  const options = [...elements.uiColorOptions.querySelectorAll('.color-option')];
  assert.deepEqual(options.map((option) => option.dataset.choice), ['default', 'green', 'pink', 'custom']);
  assert.deepEqual(options.map((option) => option.querySelector('.color-option-label').textContent), ['預設', '綠色', '粉紅色', '自訂']);
  assert.equal(choiceOf(elements), 'default');
  assert.equal(elements.uiColorOptions.querySelector('.color-dropdown-btn').textContent.includes('預設'), true);
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), true);
  assert.equal(elements.uiColorOptions.dataset.mode, 'default');
});

test('the menu button does not sink under a press', () => {
  const { document, elements, lifecycle } = createHarness();
  installColorOptionDom(document, elements);
  lifecycle.renderUiColorOptions();
  assert.equal(elements.uiColorOptions.querySelector('.color-dropdown-btn').hasAttribute('data-no-press'), true);
});

test('a colour saved as a custom colour shows as the named colour it equals, otherwise as custom', () => {
  const named = createHarness();
  installColorOptionDom(named.document, named.elements);
  named.state.config.uiTheme = { mode: 'custom', customColor: '#EC4899' };
  named.lifecycle.renderUiColorOptions();
  assert.equal(choiceOf(named.elements), 'pink');
  assert.equal(named.elements.customColorPickerContainer.classList.contains('hidden'), true);

  const own = createHarness();
  installColorOptionDom(own.document, own.elements);
  own.state.config.uiTheme = { mode: 'custom', customColor: '#123456' };
  own.lifecycle.renderUiColorOptions();
  assert.equal(choiceOf(own.elements), 'custom');
  assert.equal(own.elements.customColorPickerContainer.classList.contains('hidden'), false);
  assert.equal(own.elements.customColorInput.value, '#123456');
  assert.equal(own.elements.customColorPickerContainer.querySelector('.pz-hex-text').value, '#123456'.toUpperCase());
});

test('choosing from the menu keeps the choice on the menu element for saving and closes the menu', () => {
  const { document, elements, state, lifecycle } = createHarness();
  installColorOptionDom(document, elements);
  state.config.uiTheme = { mode: 'default', customColor: '#111111' };
  lifecycle.renderUiColorOptions();
  const menu = elements.uiColorOptions.querySelector('.color-dropdown-menu');
  menu.classList.add('show');

  clickChoice(elements, 'green');
  assert.deepEqual({ ...elements.uiColorOptions.dataset }, { mode: 'custom', color: '#10b981' });
  assert.equal(choiceOf(elements), 'green');
  assert.equal(menu.classList.contains('show'), false);

  clickChoice(elements, 'custom');
  assert.equal(choiceOf(elements), 'custom');
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), false);

  elements.customColorInput.value = '#abcdef';
  elements.customColorInput.oninput();
  assert.deepEqual({ ...elements.uiColorOptions.dataset }, { mode: 'custom', color: '#abcdef' });
  assert.equal(elements.customColorPickerContainer.querySelector('.pz-hex-text').value, '#ABCDEF');

  clickChoice(elements, 'default');
  assert.equal(elements.uiColorOptions.dataset.mode, 'default');
  assert.equal(choiceOf(elements), 'default');
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), true);
});

test('the colour code can be typed: a colour is taken in any case or short form, anything else goes back', () => {
  const { document, elements, state, lifecycle } = createHarness();
  installColorOptionDom(document, elements);
  state.config.uiTheme = { mode: 'custom', customColor: '#123456' };
  lifecycle.renderUiColorOptions();
  const hexText = elements.customColorPickerContainer.querySelector('.pz-hex-text');
  const dot = elements.customColorPickerContainer.querySelector('.color-dot');
  const type = (value) => {
    hexText.value = value;
    hexText.dispatchEvent(new document.defaultView.Event('change'));
  };

  type('F80');
  assert.deepEqual({ ...elements.uiColorOptions.dataset }, { mode: 'custom', color: '#ff8800' });
  assert.equal(hexText.value, '#FF8800');
  assert.equal(elements.customColorInput.value, '#ff8800');
  assert.equal(dot.style.backgroundColor === '' ? '' : 'set', 'set');

  type('  #A1B2C3 ');
  assert.equal(elements.uiColorOptions.dataset.color, '#a1b2c3');

  type('not a colour');
  assert.equal(elements.uiColorOptions.dataset.color, '#a1b2c3');
  assert.equal(hexText.value, '#A1B2C3', 'a code that is not a colour goes back to the one in use');
  type('#12345');
  assert.equal(hexText.value, '#A1B2C3');
});

test('applyBubbleColors refreshes the user bubble colour', () => {
  const { calls, lifecycle } = createHarness();
  lifecycle.applyBubbleColors();
  assert.deepEqual(calls, [['setUserBubbleColor']]);
});

test('the custom wallpaper and its colour extraction no longer exist', () => {
  const { lifecycle } = createHarness();
  assert.deepEqual(Object.keys(lifecycle).sort(), ['applyBubbleColors', 'applyUiTheme', 'renderUiColorOptions']);
});

test('theme appearance helper is isolated while core-tail keeps the documented binding surface', () => {
  const helperPath = 'src/app/runtime/features/theme-appearance-lifecycle.js';
  const helperSource = readSource(helperPath);
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');

  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.match(helperSource, /export\s+function\s+createThemeAppearanceLifecycle/);
  assert.match(coreTailSource, /import\s+\{\s*createThemeAppearanceLifecycle\s*\}/);
  assert.match(coreTailSource, /const\s+themeAppearanceLifecycle\s*=\s*createThemeAppearanceLifecycle\(\{/);

  for (const name of [
    'applyUiTheme',
    'renderUiColorOptions',
    'applyBubbleColors',
  ]) {
    assert.match(coreTailSource, new RegExp(`const\\s+${name}\\s*=\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*themeAppearanceLifecycle\\.${name}\\(\\.\\.\\.args\\);`));
  }

  assert.doesNotMatch(coreTailSource, /const\s+img\s*=\s*new\s+Image\(\)/);
  assert.doesNotMatch(coreTailSource, /root\.style\.setProperty\('--button-primary-bg'/);
  assert.doesNotMatch(helperSource, /registerLazyBinding|resolveBinding|resolveOptionalBinding/);
  assert.doesNotMatch(helperSource, /runtime-entry|app-bootstrap|submit-input|provider|security|api-key|legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});
