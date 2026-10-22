// The models a text model may call by itself (模型可呼叫模型) and the person's permission for each kind of call, as the settings keep them
// (toolModels, permissions; docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md). Only pictures so far: `toolModels.image` is the
// picture model the text model draws with (null: none chosen, so the tool is not offered), `permissions.imageGeneration` whether the person is
// asked before each picture ('ask', the default) or has allowed it for good ('always'). The server reads this file too, so it may not use the
// browser (scripts/server-shared-modules.json).

export const IMAGE_PERMISSIONS = Object.freeze(['ask', 'always']);
export const DEFAULT_IMAGE_PERMISSION = 'ask';

const text = (value, max) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : '');

/** A chosen model as the settings keep it: { provider, id }, or null for anything else. */
export function normalizeToolModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const provider = text(value.provider, 40);
  const id = text(value.id, 200);
  return provider && id ? { provider, id } : null;
}

export const normalizeToolModels = (value) => ({ image: normalizeToolModel(value?.image) });

export const normalizeImagePermission = (value) => (IMAGE_PERMISSIONS.includes(value) ? value : DEFAULT_IMAGE_PERMISSION);

export const normalizePermissions = (value) => ({ imageGeneration: normalizeImagePermission(value?.imageGeneration) });
