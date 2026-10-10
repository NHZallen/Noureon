import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { collectSettingsSaveFormValues } from '../src/app/runtime/legacy-core/settings-save-settings-helper.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const select = (value) => ({ value });
const toggle = (checked) => ({ checked });
const dropdown = (color) => ({
  querySelector: (selector) => selector === '.color-dropdown-btn' ? { dataset: { color } } : null
});
const swatches = (selector, dataset) => ({
  querySelector: (requestedSelector) => requestedSelector === selector ? { dataset } : null
});

function createDocument({ theme = 'dark', style = 'gradient' } = {}) {
  return {
    querySelector(selector) {
      return null;
    }
  };
}

function createElements(overrides = {}) {
  const elements = {
    tavilySearchDepthSelect: select('advanced'),
    councilTranslatorModelSelect: select('gemini-translator'),
    singleDocumentTranslatorModelSelect: select('doc-translator'),
    autoWebSearchToggleSwitch: toggle(true),
    autoNamingToggleSwitch: toggle(true),
    memoryToggle1: toggle(false),
    autoMemoryToggleSwitch: toggle(true),
    uiLanguageSelect: select('en'),
    aiLanguageSelect: select('zh-TW'),
    enableUpdateNotificationsToggle: toggle(true),
    uiColorOptions: { dataset: { mode: 'custom', color: '#123456' } }
  };
  return { ...elements, ...overrides };
}

test('collects checkbox, input, select, dropdown, and theme values as plain data', () => {
  const result = collectSettingsSaveFormValues({
    document: createDocument(),
    elements: createElements(),
    config: { uiTheme: { customColor: '#000000' } }
  });

  assert.deepEqual(result, {
    searchProvider: 'tavily',
    tavilySearchDepth: 'advanced',
    councilTranslatorModelId: 'gemini-translator',
    singleDocumentTranslatorModelId: 'doc-translator',
    enableAutoWebSearch: true,
    visionCheckEnabled: true,
    colorScheme: 'light',
    processOpen: false,
    fileModeDefault: 'advanced',
    autoNaming: true,
    memoryEnabled1: false,
    historyRecallEnabled: false,
    enableAutoMemory: true,
    uiLanguage: 'en',
    aiDefaultLanguage: 'zh-TW',
    enableUpdateNotifications: true,
    uiTheme: {
      mode: 'custom',
      customColor: '#123456'
    }
  });
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test('preserves existing saveSettings fallbacks for missing optional controls', () => {
  const result = collectSettingsSaveFormValues({
    document: createDocument({ theme: 'light' }),
    elements: createElements({
      tavilySearchDepthSelect: undefined,
      councilTranslatorModelSelect: undefined,
      singleDocumentTranslatorModelSelect: undefined,
      uiColorOptions: { dataset: {} }
    }),
    config: {
      uiTheme: {
        customColor: '#abcdef'
      }
    }
  });

  assert.equal(result.tavilySearchDepth, 'basic');
  assert.equal(result.councilTranslatorModelId, null);
  assert.equal(result.singleDocumentTranslatorModelId, null);
  assert.equal('outputMode' in result, false, 'there is no output mode to choose');
  assert.deepEqual(result.uiTheme, {
    mode: 'default',
    customColor: '#abcdef'
  });
});

test('does not read API key controls or sensitive fields as normal settings', () => {
  const elements = createElements();
  for (const apiKeyField of [
    'geminiApiKeyInput',
    'openrouterApiKeyInputAll',
    'nvidiaApiKeyInput',
    'tavilyApiKeyInput'
  ]) {
    Object.defineProperty(elements, apiKeyField, {
      get() {
        throw new Error(`${apiKeyField} should not be read by the save form collector`);
      }
    });
  }

  const result = collectSettingsSaveFormValues({
    document: createDocument(),
    elements,
    config: { uiTheme: { customColor: '#000000' } }
  });

  assert.equal(Object.keys(result).some((key) => key.toLowerCase().includes('apikey')), false);
  assert.equal(JSON.stringify(result).includes('masked'), false);
});

test('returns collected values without save, notification, modal, or render side effects', () => {
  const elements = createElements();
  const config = { uiTheme: { customColor: '#000000', adaptivePalette: [] } };
  const beforeElements = JSON.stringify(elements);
  const beforeConfig = JSON.stringify(config);

  collectSettingsSaveFormValues({
    document: createDocument(),
    elements,
    config
  });

  assert.equal(JSON.stringify(elements), beforeElements);
  assert.equal(JSON.stringify(config), beforeConfig);

  const source = readSource('src/app/runtime/legacy-core/settings-save-settings-helper.js');
  assert.doesNotMatch(source, /saveConfig|persistApiKeyInputIntents|saveSensitiveConfig|showNotification|toggleModal|applyUiTheme|applyLanguage|render[A-Z]/);
  assert.doesNotMatch(source, /sensitive-config-store|api-key-input-intent/);
});

test('import is inert and exposes only the save form collector function', () => {
  assert.equal(typeof collectSettingsSaveFormValues, 'function');
});
