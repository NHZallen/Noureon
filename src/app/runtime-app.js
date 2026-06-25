import { createLegacyRuntimeDomRegistry } from './runtime/kernel/dom-registry.js';
import { createLegacyRuntimeConfigStore } from './runtime/kernel/config-store.js';
import { createLegacyRuntimeAppDataStore } from './runtime/kernel/app-data-store.js';

export function createRuntimeAppKernel({
  elements,
  rootDocument = document,
  defaultModelId
} = {}) {
  const resolvedElements = elements ?? createLegacyRuntimeDomRegistry(rootDocument);
  const configStore = createLegacyRuntimeConfigStore({ defaultModelId });
  const appDataStore = createLegacyRuntimeAppDataStore();

  return {
    elements: resolvedElements,
    configStore,
    appDataStore
  };
}
