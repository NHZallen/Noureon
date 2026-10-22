// The settings of the models a text model may call, and the permission for pictures (see data/tool-models.js). Every function that changes
// the settings object it is given returns whether it changed; the caller saves.

import { normalizeImagePermission, normalizePermissions, normalizeToolModel, normalizeToolModels } from '../../../data/tool-models.js';

export const getImageToolModel = (config) => normalizeToolModels(config?.toolModels).image;

export function setImageToolModel(config, model) {
  const next = normalizeToolModel(model);
  const current = getImageToolModel(config);
  if (current?.provider === next?.provider && current?.id === next?.id) return false;
  config.toolModels = { ...normalizeToolModels(config.toolModels), image: next };
  return true;
}

export const getImagePermission = (config) => normalizePermissions(config?.permissions).imageGeneration;

export function setImagePermission(config, value) {
  const next = normalizeImagePermission(value);
  if (getImagePermission(config) === next && config.permissions?.imageGeneration === next) return false;
  config.permissions = { ...normalizePermissions(config.permissions), imageGeneration: next };
  return true;
}
