import { createLegacyAppBootstrapLifecycle } from './runtime/features/app-bootstrap-lifecycle.js';
import { createLegacyStartupLifecycle } from './runtime/features/startup-lifecycle.js';
import { validateLegacyRuntimeEntryDependencies } from './runtime/runtime-entry-dependencies.js';

let productionStartPromise;

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
  dependencies = runtimeContext
    ? getLegacyRuntimeEntryDependencies({ runtimeContext })
    : undefined
} = {}) {
  const resolvedDependencies = validateLegacyRuntimeEntryDependencies(dependencies);
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
