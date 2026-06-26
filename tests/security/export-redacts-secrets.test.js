import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyImportExportLifecycle } from '../../src/app/runtime/features/import-export-lifecycle.js';

function createClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name)
  };
}

function createElement(id = '') {
  return {
    id,
    checked: false,
    classList: createClassList(),
    disabled: false,
    style: {},
    textContent: '',
    value: '',
    appendChild(child) {
      this.child = child;
    },
    click() {
      this.clicked = true;
    },
    removeChild(child) {
      if (this.child === child) this.child = null;
    }
  };
}

function createHarness({
  confirmApiKeyExport = true,
  exportApiKeys = false
} = {}) {
  const calls = [];
  const config = {
    uiLanguage: 'en',
    defaultModel: 'model-a',
    theme: 'dark',
    modelSettings: [],
    aiBubbleColor: 'default',
    userBubbleColor: 'default',
    autoNaming: true,
    enableAutoWebSearch: true,
    memoryEnabled1: true,
    enableAutoMemory: true,
    customWallpaper: null,
    wallpaperBrightness: 'light',
    uiTheme: { mode: 'default' },
    aiDefaultLanguage: 'en',
    isLearningMode: false,
    apiKeys: {
      gemini: 'gemini-secret-value',
      openrouter: 'sk-or-openrouter-secret',
      nvidia: 'nvapi-nvidia-secret',
      stepPlan: 'stepfun-secret-value',
      tavily: 'tvly-tavily-secret'
    }
  };
  const elements = {
    exportHistoryCheck: createElement('exportHistoryCheck'),
    exportAstrasCheck: createElement('exportAstrasCheck'),
    exportSettingsCheck: createElement('exportSettingsCheck'),
    exportMemoryCheck: createElement('exportMemoryCheck'),
    exportApiCheck: createElement('export-api-check'),
    confirmExportBtn: createElement('confirmExportBtn'),
    exportDataModal: createElement('exportDataModal')
  };
  elements.confirmExportBtn.textContent = 'Export';
  elements.exportSettingsCheck.checked = true;
  elements.exportApiCheck.checked = exportApiKeys;

  const documentBody = createElement('body');
  const document = {
    body: documentBody,
    createElement: (tagName) => createElement(tagName),
    getElementById: (id) => id === 'export-api-check' ? elements.exportApiCheck : createElement(id)
  };

  class FakeFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.options = options;
    }
  }

  class FakeJSZip {
    constructor() {
      this.files = {};
      FakeJSZip.instances.push(this);
    }

    folder(name) {
      return {
        file: (fileName, content) => {
          this.files[`${name}/${fileName}`] = content;
        }
      };
    }

    file(name, content) {
      if (content === undefined) return this.files[name] ?? null;
      this.files[name] = content;
      return this;
    }

    async generateAsync() {
      return { kind: 'blob', files: this.files };
    }
  }
  FakeJSZip.instances = [];

  const lifecycle = createLegacyImportExportLifecycle({
    document,
    window: {},
    navigator: { userAgent: 'Desktop' },
    URL: {
      createObjectURL: () => 'blob:url',
      revokeObjectURL: () => {}
    },
    File: FakeFile,
    JSZip: FakeJSZip,
    elements,
    getCurrentUser: () => ({ username: 'alice', passwordKdf: 'PBKDF2-SHA-256' }),
    getConfig: () => config,
    mutateConfig: () => config,
    getConversations: () => [],
    getFolders: () => [],
    getAstras: () => [],
    getPersonalMemories: () => [],
    replaceAllAppData: () => ({ conversations: [], folders: [], astras: [], personalMemories: [] }),
    replaceFolders: () => [],
    replacePersonalMemories: () => [],
    saveAppData: async () => {},
    saveConfig: async () => {},
    processInChunks: async () => {},
    getBackupUsername: () => '',
    compressImage: async (data, mimeType) => ({ data, mimeType, ext: 'png' }),
    analyzeImageBrightness: async () => 'light',
    getDominantColorPalette: async () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    applyLanguage: () => {},
    setAiBubbleColor: () => {},
    setUserBubbleColor: () => {},
    loadChat: () => {},
    startNewChat: () => {},
    showCustomConfirm: async (...args) => {
      calls.push(['confirm', ...args]);
      return confirmApiKeyExport;
    },
    showNotification: (...args) => calls.push(['notification', ...args]),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    getOutputMode: () => 'typewriter',
    resolveSearchSetupSettingsModal: () => {},
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    i18n: { en: {} },
    delay: async () => {},
    logger: { error: (...args) => calls.push(['error', ...args]), log: () => {}, warn: () => {} }
  });

  return { calls, config, elements, FakeJSZip, lifecycle };
}

const parseExportedData = (FakeJSZip) => {
  const zip = FakeJSZip.instances.at(-1);
  assert.ok(zip, 'expected an export zip to be created');
  return JSON.parse(zip.files['data.json']);
};

test('normal export data.json excludes apiKeys and full provider secrets', async () => {
  const { config, FakeJSZip, lifecycle } = createHarness();

  await lifecycle.handleExport();

  const exportedData = parseExportedData(FakeJSZip);
  const serialized = JSON.stringify(exportedData);

  assert.equal('apiKeys' in exportedData, false);
  assert.equal('apiKeys' in exportedData.settings, false);
  for (const secret of Object.values(config.apiKeys)) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('API key export is explicit opt-in and includes full keys only when confirmed', async () => {
  const { calls, config, FakeJSZip, lifecycle } = createHarness({ exportApiKeys: true });

  await lifecycle.handleExport();

  const exportedData = parseExportedData(FakeJSZip);

  assert.deepEqual(exportedData.apiKeys, config.apiKeys);
  assert.equal(calls.some((call) => call[0] === 'confirm' && /API keys/i.test(`${call[1]} ${call[2]}`)), true);
});

test('cancelled API key export does not create a backup payload', async () => {
  const { FakeJSZip, lifecycle } = createHarness({
    exportApiKeys: true,
    confirmApiKeyExport: false
  });

  await lifecycle.handleExport();

  assert.equal(FakeJSZip.instances.length, 0);
});
