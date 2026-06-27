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

function createOutputRow() {
  const typewriterButton = createButton({ outputModeOption: 'typewriter' });
  const realtimeButton = createButton({ outputModeOption: 'realtime' });
  const input = {
    value: '',
    dispatched: [],
    dispatchEvent(event) {
      this.dispatched.push(event);
    }
  };
  const label = { textContent: '' };
  const description = { textContent: '' };
  return {
    id: '',
    className: '',
    hasSelect: false,
    set innerHTML(value) {
      this.html = value;
      this.hasSelect = true;
      const initialValue = value.match(/id="output-mode-select" value="([^"]*)"/)?.[1];
      if (initialValue) input.value = initialValue;
    },
    get innerHTML() {
      return this.html || '';
    },
    querySelector(selector) {
      if (selector === '.custom-output-mode-select') return this.hasSelect ? {} : null;
      if (selector === '#output-mode-label') return label;
      if (selector === 'p') return description;
      if (selector === '#output-mode-select') {
        input.__row = this;
        return input;
      }
      if (selector === '[data-output-mode-option="typewriter"]') return typewriterButton;
      if (selector === '[data-output-mode-option="realtime"]') return realtimeButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-output-mode-option]') return [typewriterButton, realtimeButton];
      return [];
    },
    _parts: { typewriterButton, realtimeButton, input, label, description }
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
      if (tagName === 'div') return createOutputRow();
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
    outputMode: 'realtime',
    councilTranslatorModelId: 'gemini-pro',
    singleDocumentTranslatorModelId: 'stepfun-doc'
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
    getOutputMode: () => config.outputMode,
    getCouncilTranslatorCandidates: () => [
      { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini' },
      { id: 'openrouter-doc', name: 'OpenRouter Doc', provider: 'openrouter' }
    ],
    getSingleTranslatorCandidates: () => [
      { id: 'stepfun-doc', name: 'StepFun Doc', provider: 'stepPlan' }
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

test('output mode controls render with the injected current value and update on click', () => {
  const { controls, elements } = createHarness();

  controls.ensureOutputModeSettingsControls();

  assert.equal(elements.outputModeSelect.value, 'realtime');
  const outputRow = elements.outputModeSelect.__row;
  assert.equal(elements.outputModeSelect.dispatched.length, 0);
  const typewriterButton = controlsTestOutputButton(elements.outputModeSelect, 'typewriter', outputRow);
  const realtimeButton = controlsTestOutputButton(elements.outputModeSelect, 'realtime', outputRow);
  assert.equal(realtimeButton.classList.contains('active'), true);

  typewriterButton.listeners.click();

  assert.equal(elements.outputModeSelect.value, 'typewriter');
  assert.equal(typewriterButton.classList.contains('active'), true);
  assert.equal(realtimeButton.classList.contains('active'), false);
  assert.equal(elements.outputModeSelect.dispatched.length, 1);
});

function controlsTestOutputButton(input, mode, outputRow) {
  if (outputRow) return outputRow.querySelector(`[data-output-mode-option="${mode}"]`);
  throw new Error('output row was not attached to test input');
}

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
  assert.equal(elements.singleDocumentTranslatorModelSelect.value, 'stepfun-doc');
  assert.equal(config.councilTranslatorModelId, 'gemini-pro');
  assert.equal(config.singleDocumentTranslatorModelId, 'stepfun-doc');
  assert.equal(typeof documentRef.listeners.click, 'function');
});
