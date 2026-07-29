import { createMemoryModelClient } from './memory-model-client.js';

export function createConfiguredMemoryModelClient({
  getConfig,
  models = [],
  runMemoryModel,
  modelSupportsVision = () => false
} = {}) {
  if (typeof runMemoryModel !== 'function') return null;
  return createMemoryModelClient({
    getModelId: () => getConfig()?.memoryModelId || 'gemini-3.5-flash-lite',
    getOutputLanguage: () => getConfig()?.uiLanguage || 'en',
    runModel: runMemoryModel,
    canInterpretAttachment: ({ modelId, attachment }) => {
      const model = models.find(item => item.id === modelId);
      const mimeType = String(attachment?.mimeType || '');
      return Boolean(model) && (!mimeType || modelSupportsVision(model));
    }
  });
}
