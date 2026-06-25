import { createLegacyRuntimeDomRegistry } from './runtime/kernel/dom-registry.js';
import { createLegacyRuntimeConfigStore } from './runtime/kernel/config-store.js';

export function createRuntimeAppKernel({ rootDocument = document, defaultModelId } = {}) {
  const elements = createLegacyRuntimeDomRegistry(rootDocument);
  const configStore = createLegacyRuntimeConfigStore({ defaultModelId });

  return {
    elements,
    configStore
  };
}
