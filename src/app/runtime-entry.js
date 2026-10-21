import { createLegacyAppBootstrapLifecycle } from './runtime/features/app-bootstrap-lifecycle.js';
import { createLegacyStartupLifecycle } from './runtime/features/startup-lifecycle.js';
import { createLegacyCoreTailLifecycle } from './runtime/legacy-core/core-tail-lifecycle.js';
import { validateLegacyRuntimeEntryDependencies } from './runtime/runtime-entry-dependencies.js';
import { initializeComposerRichEditor } from './runtime/features/composer-rich-editor.js';

let productionStartPromise;

// The chat page's shell (legacy-core.js): importing it builds the stores and the lifecycles. It hands out what the core tail is made
// from (coreTailDependencies) and takes back, explicitly, the parts made here (connectCoreTail, connectRuntimeEntry).
export function loadLegacyCore() {
  return import('./runtime/legacy-core/legacy-core.js');
}

const assertLegacyCore = (core) => {
  for (const name of ['coreTailDependencies', 'connectCoreTail', 'connectRuntimeEntry']) {
    if (!core?.[name]) throw new TypeError(`The legacy core must provide ${name}.`);
  }
};

/** Makes the core tail from the shell's dependencies and connects it back to the shell. */
export function composeCoreTail(core) {
  assertLegacyCore(core);
  const coreTailLifecycle = createLegacyCoreTailLifecycle(core.coreTailDependencies);
  core.connectCoreTail(coreTailLifecycle);
  return coreTailLifecycle;
}

export function createRuntimeEntry({
  core,
  dependencies
} = {}) {
  const coreTailLifecycle = dependencies ? undefined : core ? composeCoreTail(core) : undefined;
  const resolvedDependencies = validateLegacyRuntimeEntryDependencies(
    dependencies ?? coreTailLifecycle?.runtimeEntryDependencies
  );
  const appBootstrapLifecycle = createLegacyAppBootstrapLifecycle(
    resolvedDependencies.appBootstrap
  );
  const startupLifecycle = createLegacyStartupLifecycle({
    ...resolvedDependencies.startup,
    initChatApp: appBootstrapLifecycle.initChatApp
  });

  // The shell calls these once the page runs: the start of the chat page after signing in, and the height of the message field.
  const connect = () => {
    core?.connectRuntimeEntry({
      initChatApp: appBootstrapLifecycle.initChatApp,
      adjustTextareaHeight: startupLifecycle.adjustTextareaHeight
    });
  };

  let startPromise;
  const start = () => {
    if (startPromise) return startPromise;

    initializeComposerRichEditor({
      editor: resolvedDependencies.appBootstrap.elements?.messageInput,
      inputIndicatorContainer: resolvedDependencies.appBootstrap.elements?.inputIndicatorContainer,
      document: resolvedDependencies.appBootstrap.document
    });
    connect();
    startupLifecycle.bindAuthStartupListeners();
    startPromise = Promise.resolve(startupLifecycle.initializeApp());
    startupLifecycle.bindLoginLanguageSwitcher();
    startupLifecycle.runStartupPostlude();
    return startPromise;
  };

  return Object.freeze({
    dependencies: resolvedDependencies,
    coreTailLifecycle,
    initChatApp: appBootstrapLifecycle.initChatApp,
    initializeApp: startupLifecycle.initializeApp,
    adjustTextareaHeight: startupLifecycle.adjustTextareaHeight,
    connect,
    start
  });
}

export function startRuntimeEntry({
  loadCore = loadLegacyCore
} = {}) {
  if (productionStartPromise) return productionStartPromise;

  productionStartPromise = Promise.resolve()
    .then(() => loadCore())
    .then((core) => {
      const entry = createRuntimeEntry({ core });
      return Promise.resolve(entry.start()).then(() => entry);
    });

  return productionStartPromise;
}
