import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createSettingsOutputTranslatorControls } from '../src/app/runtime/legacy-core/settings-output-translator-controls.js';

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
    contains(value) {
      return values.has(value);
    }
  };
}

function createButton(dataset = {}) {
  const listeners = {};
  const attributes = {};
  return {
    dataset,
    classList: createClassList(),
    listeners,
    textContent: '',
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return attributes[name];
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    hasAttribute(name) {
      return Object.hasOwn(attributes, name);
    }
  };
}

function createTranslatorPicker(documentRef) {
  const picker = {
    html: '',
    button: createButton(),
    menu: {
      hidden: true,
      setAttribute(name) {
        if (name === 'hidden') this.hidden = true;
      },
      removeAttribute(name) {
        if (name === 'hidden') this.hidden = false;
      },
      hasAttribute(name) {
        return name === 'hidden' ? this.hidden : false;
      }
    },
    options: [],
    set innerHTML(value) {
      this.html = value;
      this.options = [...value.matchAll(/data-translator-option="([^"]+)"/g)].map((match) => (
        createButton({ translatorOption: match[1] })
      ));
      documentRef.translatorButtons = [this.button];
      documentRef.translatorMenus = [this.menu];
    },
    get innerHTML() {
      return this.html;
    },
    querySelector(selector) {
      if (selector === '[data-translator-picker-button]') return this.button;
      if (selector === '[data-translator-picker-menu]') return this.menu;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-translator-option]') return this.options;
      return [];
    }
  };
  return picker;
}

function createHarness(overrides = {}) {
  const elementsById = new Map();
  const documentRef = {
    translatorButtons: [],
    translatorMenus: [],
    createElement(tagName) {
      return {};
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelector(selector) {
      if (selector === '[data-translator-picker="councilTranslatorModelId"]') return elementsById.get('council-picker') || null;
      if (selector === '[data-translator-picker="singleDocumentTranslatorModelId"]') return elementsById.get('single-picker') || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.translator-picker-menu') return this.translatorMenus;
      if (selector === '[data-translator-picker-button]') return this.translatorButtons;
      return [];
    },
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
  const section = {
    appended: [],
    querySelector() {
      return {
        closest() {
          return {
            after(row) {
              elementsById.set(row.id, row);
            }
          };
        }
      };
    },
    appendChild(row) {
      this.appended.push(row);
      elementsById.set(row.id, row);
    }
  };
  elementsById.set('accessibility-section', section);

  const config = {
    uiLanguage: 'en',
    councilTranslatorModelId: 'gemini-pro',
    singleDocumentTranslatorModelId: 'nvidia-doc'
  };
  const elements = {};
  const controls = createSettingsOutputTranslatorControls({
    document: documentRef,
    elements,
    config,
    i18n: {
      en: {
        vision: 'Vision',
        document: 'Document',
        noCouncilTranslatorModels: 'No council translators',
        noSingleTranslatorModels: 'No single translators'
      },
      'zh-TW': {}
    },
    getCouncilTranslatorCandidates: () => [
      { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini' },
      { id: 'openrouter-doc', name: 'OpenRouter Doc', provider: 'openrouter' }
    ],
    getSingleTranslatorCandidates: () => [
      { id: 'nvidia-doc', name: 'NVIDIA Doc', provider: 'nvidia' }
    ],
    getProviderLabel: (provider) => provider,
    getModelPriceLabel: () => 'Free',
    modelSupportsVision: (model) => model.id.includes('gemini'),
    modelSupportsDocumentUpload: (model) => model.id.includes('doc'),
    escapeHTML: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    ...overrides
  });

  return { controls, config, elements, elementsById, documentRef };
}

test('module exports helper factory and imports inertly', () => {
  assert.equal(typeof createSettingsOutputTranslatorControls, 'function');
  const source = readFileSync('src/app/runtime/legacy-core/settings-output-translator-controls.js', 'utf8');
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsOutputTranslatorControls({}),
    /createSettingsOutputTranslatorControls missing dependencies/
  );
});

test('there is no output mode control: replies are always shown as they are written', () => {
  const { controls } = createHarness();
  assert.equal(controls.ensureOutputModeSettingsControls, undefined);
  assert.equal(controls.syncOutputModeSettingsControls, undefined);
});

test('translator model picker renders candidates and preserves selected value', () => {
  const { controls, config, elements, elementsById, documentRef } = createHarness();
  const picker = createTranslatorPicker(documentRef);
  elementsById.set('council-picker', picker);
  elements.councilTranslatorModelSelect = { value: '', disabled: false };

  controls.renderTranslatorModelPicker({
    input: elements.councilTranslatorModelSelect,
    pickerKey: 'councilTranslatorModelId',
    configKey: 'councilTranslatorModelId',
    candidates: [
      { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini' },
      { id: 'openrouter-doc', name: 'OpenRouter Doc', provider: 'openrouter' }
    ],
    emptyText: 'No models'
  });

  assert.equal(elements.councilTranslatorModelSelect.value, 'gemini-pro');
  assert.match(picker.innerHTML, /Gemini Pro/);
  assert.match(picker.innerHTML, /OpenRouter Doc/);
  assert.equal(picker.options.length, 2);

  picker.options[1].listeners.click();

  assert.equal(config.councilTranslatorModelId, 'openrouter-doc');
  assert.equal(elements.councilTranslatorModelSelect.value, 'openrouter-doc');
});

test('renderTranslatorModelPickers uses injected callbacks instead of global state', () => {
  const { controls, config, elements, elementsById, documentRef } = createHarness();
  elements.councilTranslatorModelSelect = { value: '', disabled: false };
  elements.singleDocumentTranslatorModelSelect = { value: '', disabled: false };
  elementsById.set('council-picker', createTranslatorPicker(documentRef));
  elementsById.set('single-picker', createTranslatorPicker(documentRef));

  controls.renderTranslatorModelPickers();

  assert.equal(elements.councilTranslatorModelSelect.value, 'gemini-pro');
  assert.equal(elements.singleDocumentTranslatorModelSelect.value, 'nvidia-doc');
  assert.equal(config.councilTranslatorModelId, 'gemini-pro');
  assert.equal(config.singleDocumentTranslatorModelId, 'nvidia-doc');
  assert.equal(typeof documentRef.listeners.click, 'function');
});
