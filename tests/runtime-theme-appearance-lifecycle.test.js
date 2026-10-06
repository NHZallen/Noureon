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
    UI_THEME_COLORS: {
      blue: '#111111',
      red: '#ff0000'
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
  elements.uiColorOptions.innerHTML = `
    <input type="radio" name="color-theme" value="default">
    <input type="radio" name="color-theme" value="custom">
  `;
  elements.customColorPickerContainer = document.createElement('div');
  elements.customColorSwatches = document.createElement('div');

  document.body.append(
    elements.uiColorOptions,
    elements.customColorPickerContainer,
    elements.customColorSwatches
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

test('renderUiColorOptions keeps swatches, the selected colour, and the custom picker visibility', () => {
  const { document, elements, state, lifecycle } = createHarness();
  installColorOptionDom(document, elements);
  state.config.uiTheme.mode = 'default';
  state.config.uiTheme.customColor = '#111111';

  lifecycle.renderUiColorOptions();

  assert.equal(elements.uiColorOptions.querySelector('input[value="default"]').checked, true);
  assert.equal(elements.customColorSwatches.children.length, 2);
  assert.equal(elements.customColorSwatches.querySelector('.selected').dataset.color, '#111111');
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), true);

  elements.uiColorOptions.querySelector('input[value="default"]').checked = false;
  elements.uiColorOptions.querySelector('input[value="custom"]').checked = true;
  elements.uiColorOptions.querySelector('input[value="custom"]').dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), false);
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
