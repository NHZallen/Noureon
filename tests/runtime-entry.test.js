import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createRuntimeEntry,
  getLegacyRuntimeEntryDependencies,
  loadLegacyRuntimeContext,
  registerRuntimeEntryBindings
} from '../src/app/runtime-entry.js';
import {
  LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS,
  createLegacyRuntimeEntryDependencies,
  validateLegacyRuntimeEntryDependencies
} from '../src/app/runtime/runtime-entry-dependencies.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createCompleteGroup = (fields) => Object.fromEntries(
  fields.map((field) => [field, () => {}])
);

const createCompleteDependencies = (overrides = {}) => {
  const appBootstrap = createCompleteGroup(
    LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS.appBootstrap
  );
  const startup = createCompleteGroup(
    LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS.startup
  );

  Object.assign(appBootstrap, {
    window: {},
    document: {},
    elements: {},
    Peer: class {},
    QRCode: class {},
    Html5Qrcode: class {},
    JSZip: class {},
    BlobCtor: class {},
    i18n: {},
    logger: {}
  });
  Object.assign(startup, {
    window: {},
    document: {},
    globalObject: {},
    elements: {}
  });

  return createLegacyRuntimeEntryDependencies({
    appBootstrap: {
      ...appBootstrap,
      ...overrides.appBootstrap
    },
    startup: {
      ...startup,
      ...overrides.startup
    }
  });
};

test('runtime entry exports an inert composition API', () => {
  assert.equal(typeof createRuntimeEntry, 'function');
  assert.equal(typeof getLegacyRuntimeEntryDependencies, 'function');
  assert.equal(typeof loadLegacyRuntimeContext, 'function');
  assert.equal(typeof registerRuntimeEntryBindings, 'function');

  const calls = [];
  const dependencies = createCompleteDependencies({
    startup: {
      installTouchGuards: () => calls.push('installTouchGuards'),
      registerServiceWorker: () => calls.push('registerServiceWorker')
    }
  });
  const entry = createRuntimeEntry({ dependencies });

  assert.deepEqual(calls, []);
  assert.equal(entry.dependencies, dependencies);
  assert.equal(typeof entry.initChatApp, 'function');
  assert.equal(typeof entry.initializeApp, 'function');
  assert.equal(typeof entry.adjustTextareaHeight, 'function');
  assert.equal(typeof entry.registerBindings, 'function');
  assert.equal(typeof entry.start, 'function');
});

test('runtime entry explicitly registers startup textarea ownership without starting', () => {
  const bindings = new Map();
  const runtimeContext = {
    registerLazyBinding(name, getter) {
      assert.equal(bindings.has(name), false);
      bindings.set(name, getter);
    },
    resolveOptionalBinding(name) {
      return bindings.get(name)?.();
    }
  };
  const adjustTextareaHeight = () => {};
  const startupLifecycle = { adjustTextareaHeight };

  assert.equal(
    registerRuntimeEntryBindings({ runtimeContext, startupLifecycle }),
    adjustTextareaHeight
  );
  assert.equal(
    runtimeContext.resolveOptionalBinding('runtimeEntry.submit.adjustTextareaHeight'),
    adjustTextareaHeight
  );
  assert.equal(
    registerRuntimeEntryBindings({ runtimeContext, startupLifecycle }),
    adjustTextareaHeight
  );
});

test('createRuntimeEntry binding registration stays inert until explicitly requested', () => {
  const registered = [];
  const runtimeContext = {
    registerLazyBinding(name) {
      registered.push(name);
    },
    resolveOptionalBinding() {
      return undefined;
    }
  };
  const entry = createRuntimeEntry({
    runtimeContext,
    dependencies: createCompleteDependencies()
  });

  assert.deepEqual(registered, []);
  entry.registerBindings();
  assert.deepEqual(registered, ['runtimeEntry.submit.adjustTextareaHeight']);
});

test('runtime entry resolves the registered facade from an injected runtime context', () => {
  const dependencies = createCompleteDependencies();
  const calls = [];
  const runtimeContext = {
    resolveBinding(name) {
      calls.push(name);
      return dependencies;
    }
  };

  assert.equal(
    getLegacyRuntimeEntryDependencies({ runtimeContext }),
    dependencies
  );
  const entry = createRuntimeEntry({ runtimeContext });

  assert.equal(entry.runtimeContext, runtimeContext);
  assert.equal(entry.dependencies, dependencies);
  assert.deepEqual(calls, [
    'runtime.entryDependencies',
    'runtime.entryDependencies'
  ]);
});

test('runtime entry start remains explicit and runs startup composition once', async () => {
  const calls = [];
  const listeners = [];
  const createElement = (id) => ({
    id,
    value: '',
    disabled: false,
    dataset: {},
    style: {},
    classList: {
      add: (name) => calls.push(`class:${id}:add:${name}`),
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    addEventListener(type) {
      listeners.push(`${id}:${type}`);
    },
    contains: () => false
  });
  const elements = new Proxy({}, {
    get(target, prop) {
      if (!target[prop]) target[prop] = createElement(prop);
      return target[prop];
    }
  });
  const document = {
    addEventListener: (type) => listeners.push(`document:${type}`),
    getElementById: (id) => createElement(id)
  };
  const dependencies = createCompleteDependencies({
    startup: {
      window: {},
      document,
      globalObject: {},
      elements,
      getConfig: () => ({}),
      setCurrentUser: () => {},
      getItem: async (key) => {
        calls.push(`getItem:${key}`);
        return null;
      },
      getUserKey: () => '',
      loadConfig: async () => {},
      loadAppData: async () => {},
      applyLanguage: (lang) => calls.push(`applyLanguage:${lang}`),
      applyCustomWallpaper: () => {},
      applyUiTheme: () => {},
      handleLogin: () => {},
      handleImportOnAuth: () => {},
      processAuthImport: () => {},
      toggleModal: () => {},
      installTouchGuards: () => calls.push('installTouchGuards'),
      registerServiceWorker: () => calls.push('registerServiceWorker'),
      showCustomDialog: () => {},
      getComputedStyle: () => ({})
    }
  });
  const entry = createRuntimeEntry({ dependencies });

  assert.deepEqual(calls, []);
  const firstStart = entry.start();
  const secondStart = entry.start();
  assert.equal(firstStart, secondStart);
  await firstStart;

  assert.deepEqual(calls, [
    'applyLanguage:zh-TW',
    'getItem:chat_lastUser',
    'installTouchGuards',
    'registerServiceWorker',
    'class:auth-container:add:visible'
  ]);
  assert.equal(
    listeners.filter((listener) => listener === 'authForm:submit').length,
    1
  );
});

test('dependency facade validates required groups and reports missing fields', () => {
  assert.throws(
    () => validateLegacyRuntimeEntryDependencies(),
    /must be an object/
  );
  assert.throws(
    () => createLegacyRuntimeEntryDependencies({
      appBootstrap: {},
      startup: {}
    }),
    /missing appBootstrap fields: window/
  );
  assert.throws(
    () => createRuntimeEntry(),
    /must be an object/
  );

  const dependencies = createCompleteDependencies();
  assert.equal(Object.isFrozen(dependencies), true);
  assert.equal(Object.isFrozen(dependencies.appBootstrap), true);
  assert.equal(Object.isFrozen(dependencies.startup), true);
});

test('runtime entry uses only the transitional named virtual context loader', () => {
  const source = readSource('src/app/runtime-entry.js');

  assert.match(
    source,
    /const\s+\{\s*legacyRuntimeContext\s*\}\s*=\s*await\s+import\('virtual:legacy-app-runtime'\)/
  );
  assert.doesNotMatch(source, /^import\s+.*virtual:legacy-app-runtime/m);
  assert.doesNotMatch(source, /legacy-runtime\/fragments/);
  assert.doesNotMatch(source, /(?:^|\n)\s*(?:void\s+)?(?:start|initializeApp|initChatApp)\(\);/);
});
