import { createLegacyAppBootstrapLifecycle } from './runtime/features/app-bootstrap-lifecycle.js';
import { createLegacyStartupLifecycle } from './runtime/features/startup-lifecycle.js';
import { validateLegacyRuntimeEntryDependencies } from './runtime/runtime-entry-dependencies.js';

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
  const start = () => {
    if (startPromise) return startPromise;

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
    start
  });
}

export async function createRuntimeEntryFromLegacyRuntime() {
  const runtimeContext = await loadLegacyRuntimeContext();
  return createRuntimeEntry({ runtimeContext });
}
