// What a reply sent to the server carries so that a text model may draw pictures by itself (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md):
// the picture model the person chose in the settings, whether they are asked before each picture, and the key of that model. Nothing when the reply is not
// made by a text model that can call models (it takes tools and looks at pictures), or none is chosen, or its key is missing.

import { MODELS, modelCanCallModels, modelGeneratesImages } from '../shell/model-registry.js';
import { getImagePermission, getImageToolModel } from './tool-models-state.js';

/**
 * `{ imageGeneration: { model: { provider, id, info }, permission }, imageKey }` for the spec of a reply, or null. `getApiKeyForProvider(provider)` gives a key.
 * `models` is the registry (for tests).
 */
export function imageGenerationForReply({ config, modelInfo, getApiKeyForProvider, models = MODELS }) {
  if (!modelCanCallModels(modelInfo)) return null;
  const chosen = getImageToolModel(config);
  if (!chosen) return null;
  const info = models.find((model) => model.provider === chosen.provider && model.id === chosen.id && modelGeneratesImages(model));
  if (!info) return null;
  const imageKey = getApiKeyForProvider(info.provider);
  if (!imageKey) return null;
  return { imageGeneration: { model: { provider: info.provider, id: info.apiId || info.id, info }, permission: getImagePermission(config) }, imageKey };
}
