import { createRuntimeDomRegistry } from './runtime/kernel/dom-registry.js';
import { createRuntimeConfigStore } from './runtime/kernel/config-store.js';
import { createRuntimeAppDataStore } from './runtime/kernel/app-data-store.js';

export function createRuntimeAppKernel({
  elements,
  rootDocument = document,
  defaultModelId
} = {}) {
  const resolvedElements = elements ?? createRuntimeDomRegistry(rootDocument);
  const configStore = createRuntimeConfigStore({ defaultModelId });
  const appDataStore = createRuntimeAppDataStore();

  return {
    elements: resolvedElements,
    configStore,
    appDataStore
  };
}
