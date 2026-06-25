import { createLegacyAppBootstrapLifecycle } from './runtime/features/app-bootstrap-lifecycle.js';
import { createLegacyStartupLifecycle } from './runtime/features/startup-lifecycle.js';
import { createLegacyCoreTailLifecycle } from './runtime/legacy-core/core-tail-lifecycle.js';
import { validateLegacyRuntimeEntryDependencies } from './runtime/runtime-entry-dependencies.js';

let productionStartPromise;

const CORE_TAIL_BINDING_NAMES = [
  'setupTimeAnalysis',
  'updateTimeDistributionChart',
  'getDominantColorPalette',
  'applyUiTheme',
  'renderUiColorOptions',
  'analyzeImageBrightness',
  'applyCustomWallpaper',
  'handleWallpaperUpload',
  'handleConfirmCrop',
  'restoreDefaultWallpaper',
  'openStore',
  'closeStore',
  'renderStore',
  'handleSubscription',
  'openAvatarEditor',
  'handleAvatarUpload',
  'handleConfirmAvatarCrop',
  'applyLanguage',
  'showMobileContextMenu',
  'showMobileContextMenuForFolder',
  'showMobileContextMenuForAstras',
  'setupScrollToBottomButton',
  'showUpdateHistory',
  'checkAndShowLatestUpdate',
  'setupMessageIntersectionObserver',
  'renderTrash',
  'handleRestoreTrashItem',
  'handleDeleteTrashItemPermanently',
  'showTrashItemInViewModal',
  'toggleTrashSelectionMode',
  'renderTrashBatchActionBar',
  'handleBatchRestoreFromTrash',
  'handleBatchDeleteFromTrash',
  'handleEmptyTrash',
  'updateDisplayedVersion'
];

export async function loadLegacyRuntimeContext() {
  const { legacyRuntimeContext } = await import('virtual:legacy-app-runtime');
  return legacyRuntimeContext;
}

export function getLegacyRuntimeEntryDependencies({ runtimeContext } = {}) {
  if (!runtimeContext || typeof runtimeContext.resolveBinding !== 'function') {
    throw new TypeError('A legacy runtime context with resolveBinding() is required.');
  }

  return validateLegacyRuntimeEntryDependencies(
    runtimeContext.resolveBinding('runtime.entryDependencies')
  );
}

export function getLegacyRuntimeCoreTailDependencies({ runtimeContext } = {}) {
  if (!runtimeContext || typeof runtimeContext.resolveBinding !== 'function') {
    throw new TypeError('A legacy runtime context with resolveBinding() is required.');
  }

  return runtimeContext.resolveBinding('runtime.coreTailDependencies');
}

export function registerCoreTailBindings({
  runtimeContext,
  coreTailLifecycle
} = {}) {
  if (!runtimeContext || typeof runtimeContext.registerLazyBinding !== 'function') {
    throw new TypeError('A legacy runtime context with registerLazyBinding() is required.');
  }
  if (!coreTailLifecycle || typeof coreTailLifecycle !== 'object') {
    throw new TypeError('A core tail lifecycle object is required.');
  }

  const registerBinding = (bindingName, binding) => {
    if (typeof binding !== 'function') {
      throw new TypeError(`Legacy runtime binding "${bindingName}" must be a function.`);
    }

    const existingBinding = typeof runtimeContext.resolveOptionalBinding === 'function'
      ? runtimeContext.resolveOptionalBinding(bindingName)
      : undefined;

    if (existingBinding) {
      if (existingBinding !== binding) {
        throw new Error(`Legacy runtime binding "${bindingName}" is already registered.`);
      }
      return existingBinding;
    }

    runtimeContext.registerLazyBinding(bindingName, () => binding);
    return binding;
  };

  const registeredBindings = {};
  for (const name of CORE_TAIL_BINDING_NAMES) {
    registeredBindings[name] = registerBinding(
      `coreTail.${name}`,
      coreTailLifecycle[name]
    );
  }

  return Object.freeze(registeredBindings);
}

function composeCoreTailLifecycle({ runtimeContext } = {}) {
  const coreTailDependencies = getLegacyRuntimeCoreTailDependencies({ runtimeContext });
  const coreTailLifecycle = createLegacyCoreTailLifecycle(coreTailDependencies);

  registerCoreTailBindings({ runtimeContext, coreTailLifecycle });
  coreTailLifecycle.registerRuntimeEntryDependencies();

  return coreTailLifecycle;
}

export function registerRuntimeEntryBindings({
  runtimeContext,
  appBootstrapLifecycle,
  startupLifecycle
} = {}) {
  if (!runtimeContext || typeof runtimeContext.registerLazyBinding !== 'function') {
    throw new TypeError('A legacy runtime context with registerLazyBinding() is required.');
  }
  if (!appBootstrapLifecycle || typeof appBootstrapLifecycle.initChatApp !== 'function') {
    throw new TypeError('An app bootstrap lifecycle with initChatApp() is required.');
  }
  if (!startupLifecycle || typeof startupLifecycle.adjustTextareaHeight !== 'function') {
    throw new TypeError('A startup lifecycle with adjustTextareaHeight() is required.');
  }

  const registerBinding = (bindingName, binding) => {
    const existingBinding = typeof runtimeContext.resolveOptionalBinding === 'function'
      ? runtimeContext.resolveOptionalBinding(bindingName)
      : undefined;

    if (existingBinding) {
      if (existingBinding !== binding) {
        throw new Error(`Legacy runtime binding "${bindingName}" is already registered.`);
      }
      return existingBinding;
    }

    runtimeContext.registerLazyBinding(bindingName, () => binding);
    return binding;
  };

  return Object.freeze({
    initChatApp: registerBinding(
      'app.initChatApp',
      appBootstrapLifecycle.initChatApp
    ),
    adjustTextareaHeight: registerBinding(
      'runtimeEntry.submit.adjustTextareaHeight',
      startupLifecycle.adjustTextareaHeight
    )
  });
}

export function createRuntimeEntry({
  runtimeContext,
  dependencies
} = {}) {
  const coreTailLifecycle = dependencies
    ? undefined
    : runtimeContext
      ? composeCoreTailLifecycle({ runtimeContext })
      : undefined;
  const resolvedDependencies = validateLegacyRuntimeEntryDependencies(
    dependencies ?? (
      runtimeContext
        ? getLegacyRuntimeEntryDependencies({ runtimeContext })
        : undefined
    )
  );
  const appBootstrapLifecycle = createLegacyAppBootstrapLifecycle(
    resolvedDependencies.appBootstrap
  );
  const startupLifecycle = createLegacyStartupLifecycle({
    ...resolvedDependencies.startup,
    initChatApp: appBootstrapLifecycle.initChatApp
  });

  let startPromise;
  const registerBindings = () => {
    if (!runtimeContext) {
      return Object.freeze({
        initChatApp: appBootstrapLifecycle.initChatApp,
        adjustTextareaHeight: startupLifecycle.adjustTextareaHeight
      });
    }
    return registerRuntimeEntryBindings({
      runtimeContext,
      appBootstrapLifecycle,
      startupLifecycle
    });
  };
  const start = () => {
    if (startPromise) return startPromise;

    registerBindings();
    startupLifecycle.bindAuthStartupListeners();
    startPromise = Promise.resolve(startupLifecycle.initializeApp());
    startupLifecycle.bindLoginLanguageSwitcher();
    startupLifecycle.runStartupPostlude();
    return startPromise;
  };

  return Object.freeze({
    dependencies: resolvedDependencies,
    runtimeContext,
    coreTailLifecycle,
    initChatApp: appBootstrapLifecycle.initChatApp,
    initializeApp: startupLifecycle.initializeApp,
    adjustTextareaHeight: startupLifecycle.adjustTextareaHeight,
    registerBindings,
    start
  });
}

export async function createRuntimeEntryFromLegacyRuntime() {
  const runtimeContext = await loadLegacyRuntimeContext();
  return createRuntimeEntry({ runtimeContext });
}

export function startRuntimeEntry({
  loadRuntimeContext = loadLegacyRuntimeContext
} = {}) {
  if (productionStartPromise) return productionStartPromise;

  productionStartPromise = Promise.resolve()
    .then(() => loadRuntimeContext())
    .then((runtimeContext) => {
      const entry = createRuntimeEntry({ runtimeContext });
      return Promise.resolve(entry.start()).then(() => entry);
    });

  return productionStartPromise;
}
