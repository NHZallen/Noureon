import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyImportExportLifecycle } from '../src/app/runtime/features/import-export-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

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
    files: [],
    href: '',
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
  currentUser = { username: 'alice', passwordKdf: 'PBKDF2-SHA-256' },
  config = {
    uiLanguage: 'en',
    apiKeys: { keep: 'yes' },
    defaultModel: 'model-a',
    theme: 'dark',
    modelSettings: [],
    aiBubbleColor: '#111111',
    userBubbleColor: '#222222',
    autoNaming: true,
    enableAutoWebSearch: false,
    memoryEnabled1: true,
    enableAutoMemory: true,
    customWallpaper: null,
    wallpaperBrightness: null,
    uiTheme: {},
    aiDefaultLanguage: 'en',
    isLearningMode: false
  },
  conversations = [],
  folders = [],
  astras = [],
  personalMemories = [],
  importFile
} = {}) {
  const calls = [];
  const elements = {
    exportHistoryCheck: createElement('exportHistoryCheck'),
    exportAstrasCheck: createElement('exportAstrasCheck'),
    exportSettingsCheck: createElement('exportSettingsCheck'),
    exportMemoryCheck: createElement('exportMemoryCheck'),
    confirmExportBtn: createElement('confirmExportBtn'),
    exportDataModal: createElement('exportDataModal'),
    importFileInput: createElement('importFileInput'),
    importProgressContainer: createElement('importProgressContainer'),
    importProgressBar: createElement('importProgressBar'),
    importStatusText: createElement('importStatusText'),
    importPercentage: createElement('importPercentage'),
    importWarningText: createElement('importWarningText'),
    confirmImportBtn: createElement('confirmImportBtn'),
    importDataModal: createElement('importDataModal')
  };
  elements.confirmExportBtn.textContent = 'Export';
  elements.confirmImportBtn.textContent = 'Import';
  if (importFile) elements.importFileInput.files = [importFile];

  const documentBody = createElement('body');
  const document = {
    body: documentBody,
    createElement: (tagName) => createElement(tagName),
    getElementById: (id) => {
      if (id === 'export-api-check') return elements.exportApiCheck;
      return elements[id] ?? createElement(id);
    }
  };
  elements.exportApiCheck = createElement('export-api-check');

  class FakeFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.options = options;
      calls.push(['File', name, options.type]);
    }
  }

  class FakeJSZip {
    constructor() {
      this.files = {};
      FakeJSZip.instances.push(this);
    }

    folder(name) {
      calls.push(['zipFolder', name]);
      return {
        file: (fileName, content, options) => {
          calls.push(['zipFolderFile', name, fileName, options?.base64 === true]);
          this.files[`${name}/${fileName}`] = content;
        }
      };
    }

    file(name, content) {
      if (content === undefined) return this.files[name] ?? null;
      calls.push(['zipFile', name]);
      this.files[name] = {
        async async(format) {
          if (format === 'string') return content;
          if (format === 'base64') return content;
          return content;
        }
      };
      return this;
    }

    async generateAsync(options) {
      calls.push(['zipGenerate', options.type, options.compression]);
      return { kind: 'blob', files: this.files };
    }

    static async loadAsync(file) {
      calls.push(['zipLoad', file.name]);
      const zip = new FakeJSZip();
      zip.files['data.json'] = {
        async async() {
          return file.content;
        }
      };
      return zip;
    }
  }
  FakeJSZip.instances = [];

  const lifecycle = createLegacyImportExportLifecycle({
    document,
    window: {},
    navigator: { userAgent: 'Desktop' },
    URL: {
      createObjectURL: (blob) => {
        calls.push(['createObjectURL', blob.kind]);
        return 'blob:url';
      },
      revokeObjectURL: (url) => calls.push(['revokeObjectURL', url])
    },
    File: FakeFile,
    JSZip: FakeJSZip,
    elements,
    getCurrentUser: () => currentUser,
    getConfig: () => config,
    mutateConfig: (mutator) => {
      calls.push(['mutateConfig']);
      if (typeof mutator === 'function') return mutator(config);
      Object.assign(config, mutator);
      return config;
    },
    getConversations: () => conversations,
    getFolders: () => folders,
    getAstras: () => astras,
    getPersonalMemories: () => personalMemories,
    replaceAllAppData: (next) => {
      calls.push(['replaceAllAppData']);
      conversations = next.conversations;
      folders = next.folders;
      astras = next.astras;
      personalMemories = next.personalMemories;
      return { conversations, folders, astras, personalMemories };
    },
    replaceFolders: (next) => {
      calls.push(['replaceFolders']);
      folders = next;
      return folders;
    },
    replacePersonalMemories: (next) => {
      calls.push(['replacePersonalMemories']);
      personalMemories = next;
      return personalMemories;
    },
    saveAppData: async () => calls.push(['saveAppData']),
    saveConfig: async () => calls.push(['saveConfig']),
    processInChunks: async (items, processFn, chunkSize, onProgress) => {
      for (let index = 0; index < items.length; index += 1) {
        await processFn(items[index]);
        onProgress?.(index + 1, items.length);
      }
    },
    getBackupUsername: (rawData) => rawData?.backup_identity?.username || '',
    compressImage: async (data, mimeType) => ({ data, mimeType, ext: 'png' }),
    analyzeImageBrightness: async () => 'dark',
    getDominantColorPalette: async () => ['#123456'],
    applyCustomWallpaper: () => calls.push(['applyCustomWallpaper']),
    applyUiTheme: () => calls.push(['applyUiTheme']),
    applyLanguage: (language) => calls.push(['applyLanguage', language]),
    setAiBubbleColor: () => calls.push(['setAiBubbleColor']),
    setUserBubbleColor: () => calls.push(['setUserBubbleColor']),
    loadChat: (id) => calls.push(['loadChat', id]),
    startNewChat: () => calls.push(['startNewChat']),
    showCustomConfirm: async () => {
      calls.push(['confirm']);
      return true;
    },
    showNotification: (message, type) => calls.push(['notification', type, message]),
    toggleModal: (element, open) => calls.push(['toggleModal', element.id, open]),
    getOutputMode: () => 'normal',
    resolveSearchSetupSettingsModal: () => calls.push(['resolveSearchSetupSettingsModal']),
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    i18n: {
      en: {
        confirmAndImport: 'Confirm and import',
        exportFailed: 'Export failed',
        exportSuccess: 'Export success',
        importConfirmation: 'Confirm',
        importFailed: 'Import failed',
        importSuccess: 'Import success',
        importUserMismatch: 'Mismatch {backupUser} {currentUser}',
        importUserMismatchTitle: 'Mismatch',
        importOverwriteWarning: 'Overwrite',
        selectDataToExportNotice: 'Select data',
        selectFileError: 'Select file'
      }
    },
    delay: async (ms) => calls.push(['delay', ms])
  });

  return {
    calls,
    config,
    document,
    elements,
    FakeJSZip,
    get astras() {
      return astras;
    },
    get conversations() {
      return conversations;
    },
    lifecycle
  };
}

test('factory exports the normal import/export lifecycle API', () => {
  const { lifecycle } = createHarness();

  assert.equal(typeof lifecycle.handleExport, 'function');
  assert.equal(typeof lifecycle.performImport, 'function');
  assert.equal(typeof lifecycle.handleImport, 'function');
});

test('performImport preserves replacement, app persistence, config mutation, and config persistence order', async () => {
  const { calls, config, lifecycle } = createHarness();

  await lifecycle.performImport({
    conversations: [{ id: 'conv-1' }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }],
    personalMemories: [{ id: 'memory-1' }],
    settings: { theme: 'light' },
    apiKeys: { imported: 'key' }
  });

  assert.deepEqual(calls.map((call) => call[0]), [
    'replaceAllAppData',
    'saveAppData',
    'mutateConfig',
    'mutateConfig',
    'saveConfig'
  ]);
  assert.equal(config.theme, 'light');
  assert.deepEqual(config.apiKeys, { keep: 'yes', imported: 'key' });
});

test('handleImport validates, confirms, clears through bridges, chunks live arrays, and saves before UI handoffs', async () => {
  const rawData = {
    backup_identity: { username: 'alice' },
    conversations: [{ id: 'conv-1', messages: [] }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }],
    personalMemories: [{ id: 'memory-1' }],
    settings: { uiLanguage: 'en' },
    apiKeys: { imported: 'key' }
  };
  const harness = createHarness({
    importFile: {
      name: 'backup.json',
      type: 'application/json',
      async text() {
        return JSON.stringify(rawData);
      }
    }
  });

  await harness.lifecycle.handleImport();

  assert.equal(harness.astras[0].id, 'astra-1');
  assert.equal(harness.conversations[0].id, 'conv-1');
  assert.deepEqual(harness.calls.map((call) => call[0]).filter((name) => [
    'confirm',
    'replaceAllAppData',
    'mutateConfig',
    'saveConfig',
    'replaceFolders',
    'replacePersonalMemories',
    'saveAppData',
    'toggleModal',
    'notification',
    'applyCustomWallpaper',
    'applyUiTheme',
    'setAiBubbleColor',
    'setUserBubbleColor',
    'applyLanguage',
    'resolveSearchSetupSettingsModal',
    'loadChat'
  ].includes(name)), [
    'confirm',
    'replaceAllAppData',
    'mutateConfig',
    'mutateConfig',
    'saveConfig',
    'replaceFolders',
    'replacePersonalMemories',
    'saveAppData',
    'toggleModal',
    'notification',
    'applyCustomWallpaper',
    'applyUiTheme',
    'setAiBubbleColor',
    'setUserBubbleColor',
    'applyLanguage',
    'resolveSearchSetupSettingsModal',
    'loadChat'
  ]);
});

test('handleExport uses live getters and packages selected data without leaving the export button disabled', async () => {
  const { calls, elements, lifecycle } = createHarness({
    conversations: [{ id: 'conv-1', messages: [] }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1', name: 'Astra One' }],
    personalMemories: [{ id: 'memory-1' }]
  });
  elements.exportHistoryCheck.checked = true;
  elements.exportAstrasCheck.checked = true;
  elements.exportSettingsCheck.checked = true;
  elements.exportApiCheck.checked = true;
  elements.exportMemoryCheck.checked = true;

  await lifecycle.handleExport();

  assert.equal(calls.some((call) => call[0] === 'zipFile' && call[1] === 'data.json'), true);
  assert.equal(calls.some((call) => call[0] === 'zipGenerate'), true);
  assert.equal(calls.some((call) => call[0] === 'createObjectURL'), true);
  assert.equal(calls.some((call) => call[0] === 'toggleModal' && call[1] === 'importDataModal'), false);
  assert.equal(elements.confirmExportBtn.disabled, false);
  assert.equal(elements.confirmExportBtn.textContent, 'Export');
});

test('handleExport excludes apiKeys from normal settings exports by default', async () => {
  const { config, elements, FakeJSZip, lifecycle } = createHarness({
    config: {
      uiLanguage: 'en',
      apiKeys: {
        gemini: 'gemini-secret',
        openrouter: 'openrouter-secret',
        nvidia: 'nvidia-secret',
        stepPlan: 'step-plan-secret',
        tavily: 'tavily-secret'
      },
      defaultModel: 'model-a',
      theme: 'dark',
      modelSettings: [],
      aiBubbleColor: '#111111',
      userBubbleColor: '#222222',
      autoNaming: true,
      enableAutoWebSearch: false,
      memoryEnabled1: true,
      enableAutoMemory: true,
      customWallpaper: null,
      wallpaperBrightness: null,
      uiTheme: {},
      aiDefaultLanguage: 'en',
      isLearningMode: false
    }
  });
  elements.exportSettingsCheck.checked = true;

  await lifecycle.handleExport();

  const zip = FakeJSZip.instances.at(-1);
  const exportedData = JSON.parse(await zip.files['data.json'].async('string'));
  const serialized = JSON.stringify(exportedData);

  assert.equal('apiKeys' in exportedData, false);
  assert.equal('apiKeys' in exportedData.settings, false);
  for (const secret of Object.values(config.apiKeys)) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('handleExport preserves explicit opt-in full apiKeys export', async () => {
  const { config, calls, elements, FakeJSZip, lifecycle } = createHarness({
    config: {
      uiLanguage: 'en',
      apiKeys: {
        gemini: 'gemini-secret',
        openrouter: 'openrouter-secret',
        nvidia: 'nvidia-secret',
        stepPlan: 'step-plan-secret',
        tavily: 'tavily-secret'
      },
      defaultModel: 'model-a',
      theme: 'dark',
      modelSettings: [],
      aiBubbleColor: '#111111',
      userBubbleColor: '#222222',
      autoNaming: true,
      enableAutoWebSearch: false,
      memoryEnabled1: true,
      enableAutoMemory: true,
      customWallpaper: null,
      wallpaperBrightness: null,
      uiTheme: {},
      aiDefaultLanguage: 'en',
      isLearningMode: false
    }
  });
  elements.exportSettingsCheck.checked = true;
  elements.exportApiCheck.checked = true;

  await lifecycle.handleExport();

  const zip = FakeJSZip.instances.at(-1);
  const exportedData = JSON.parse(await zip.files['data.json'].async('string'));

  assert.deepEqual(exportedData.apiKeys, config.apiKeys);
  assert.equal(calls.some((call) => call[0] === 'confirm'), true);
});

test('handleImport preserves partial-state behavior without rollback on outer errors', async () => {
  const rawData = {
    backup_identity: { username: 'alice' },
    conversations: [{ id: 'conv-1', messages: [] }],
    astras: [{ id: 'astra-1' }]
  };
  const harness = createHarness({
    importFile: {
      name: 'backup.json',
      type: 'application/json',
      async text() {
        return JSON.stringify(rawData);
      }
    }
  });

  await harness.lifecycle.handleImport();
  assert.equal(harness.conversations[0].id, 'conv-1');
  assert.equal(harness.calls.some((call) => call[0] === 'replaceAllAppData'), true);
});

test('import/export lifecycle module avoids auth, startup, runtime entry, and fragment ownership', () => {
  const source = readSource('src/app/runtime/features/import-export-lifecycle.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(source, /(?:^|\n)\s*currentUser\s*=/);
  assert.doesNotMatch(source, /chat_lastUser|createPasswordRecord|getUserKey|initChatApp|initializeApp/);
});
