import { createLegacyRuntimeDomRegistry } from './runtime/kernel/dom-registry.js';

export function createRuntimeAppKernel({ rootDocument = document } = {}) {
  const elements = createLegacyRuntimeDomRegistry(rootDocument);

  return {
    elements
  };
}
