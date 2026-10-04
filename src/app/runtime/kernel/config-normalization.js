import { normalizeCliIds, normalizeCliVersions } from '../../../data/cli-catalog.js';
import { normalizeCouncilGroups, normalizeRecentModelIds } from '../../ui/model-picker/model-groups.js';
import { normalizeSearchProvider } from './search-provider.js';

export function normalizeApiKeyValue(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const key = Object.values(value).find(v => typeof v === 'string' && v.trim());
    return key ? key.trim() : '';
  }
  return '';
}

const SUPPORTED_LANGUAGE_CODES = new Set(['zh-TW', 'en', 'fr', 'ru', 'es']);
const normalizeLanguageCode = (value) => SUPPORTED_LANGUAGE_CODES.has(value) ? value : 'en';

export function createModelIdCanonicalizer({ models = [] } = {}) {
  return function getCanonicalModelId(modelId) {
    if (!modelId) return modelId;
    if (models.some(model => model.id === modelId)) return modelId;
    const renamedModel = models.find(model => Array.isArray(model.legacyIds) && model.legacyIds.includes(modelId));
    if (renamedModel) return renamedModel.id;
    const legacyNvidiaModel = models.find(model => model.provider === 'nvidia' && model.apiId === modelId);
    return legacyNvidiaModel?.id || modelId;
  };
}

export function createDefaultCouncilConfig() {
  return {
    enabled: false,
    mode: 'consensus',
    participantModelIds: [],
    synthesizerModelId: null,
    showRawResponses: true,
    showComparisonTable: true
  };
}

export function normalizeCouncilConfig(value = {}, {
  models = [],
  maxCouncilModels = 5,
  canonicalizeModelId = createModelIdCanonicalizer({ models })
} = {}) {
  const validModelIds = new Set(models.map(model => model.id));
  const normalized = { ...createDefaultCouncilConfig(), ...(value || {}) };
  const participantModelIds = Array.isArray(normalized.participantModelIds)
    ? normalized.participantModelIds
      .map(canonicalizeModelId)
      .filter((modelId, index, arr) => validModelIds.has(modelId) && arr.indexOf(modelId) === index)
      .slice(0, maxCouncilModels)
    : [];
  const canonicalSynthesizerModelId = canonicalizeModelId(normalized.synthesizerModelId);
  const synthesizerModelId = validModelIds.has(canonicalSynthesizerModelId) ? canonicalSynthesizerModelId : null;

  return {
    enabled: Boolean(normalized.enabled),
    mode: normalized.mode === 'deliberation' ? 'deliberation' : 'consensus',
    participantModelIds,
    synthesizerModelId,
    showRawResponses: normalized.showRawResponses !== false,
    showComparisonTable: normalized.showComparisonTable !== false
  };
}

export function cloneCouncilConfig(value = {}, options = {}) {
  return normalizeCouncilConfig(JSON.parse(JSON.stringify(value || {})), options);
}

export function normalizeLoadedLegacyConfig({
  currentConfig,
  savedConfig = null,
  models = [],
  maxCouncilModels = 5,
  councilTranslatorCandidates = [],
  singleTranslatorCandidates = []
} = {}) {
  const canonicalizeModelId = createModelIdCanonicalizer({ models });
  let normalizedConfig = currentConfig;

  if (savedConfig) {
    const { apiKeys: _retiredApiKeys, theme: _retiredTheme, ...normalSavedConfig } = savedConfig;
    normalizedConfig = {
      ...currentConfig,
      ...normalSavedConfig,
      apiKeys: { ...(currentConfig?.apiKeys || {}) },
      uiTheme: { ...currentConfig.uiTheme, ...(normalSavedConfig.uiTheme || {}) }
    };
    normalizedConfig.uiTheme.style = normalizedConfig.uiTheme.style || 'single';
    normalizedConfig.uiTheme.adaptivePalette = normalizedConfig.uiTheme.adaptivePalette || [];
    normalizedConfig.uiTheme.adaptiveGradient = normalizedConfig.uiTheme.adaptiveGradient || '';
    normalizedConfig.outputMode = 'realtime';
    normalizedConfig.searchProvider = normalizeSearchProvider(normalizedConfig.searchProvider);
    normalizedConfig.tavilySearchDepth = normalizedConfig.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
  } else {
    normalizedConfig = {
      ...currentConfig,
      apiKeys: { ...(currentConfig?.apiKeys || {}) },
      uiTheme: { ...(currentConfig?.uiTheme || {}) }
    };
  }
  delete normalizedConfig.theme;
  normalizedConfig.uiLanguage = normalizeLanguageCode(normalizedConfig.uiLanguage);
  normalizedConfig.visionCheckEnabled = normalizedConfig.visionCheckEnabled !== false;
  normalizedConfig.processOpen = normalizedConfig.processOpen === true;
  normalizedConfig.fileModeDefault = normalizedConfig.fileModeDefault === 'standard' ? 'standard' : 'advanced';
  normalizedConfig.replyRunLocation = normalizedConfig.replyRunLocation === 'local' ? 'local' : 'server';
  normalizedConfig.aiDefaultLanguage = normalizeLanguageCode(normalizedConfig.aiDefaultLanguage);
  normalizedConfig.acknowledgedStealthModelTerms = Array.isArray(normalizedConfig.acknowledgedStealthModelTerms)
    ? normalizedConfig.acknowledgedStealthModelTerms
      .filter((modelId, index, values) => typeof modelId === 'string' && modelId && values.indexOf(modelId) === index)
    : [];

  const allModelIds = new Set(models.map(m => m.id));
  const savedModelSettings = [];
  (normalizedConfig.modelSettings || []).forEach(setting => {
    const id = canonicalizeModelId(setting.id);
    if (allModelIds.has(id) && !savedModelSettings.some(item => item.id === id)) {
      savedModelSettings.push({ ...setting, id });
    }
  });
  const savedSettingIds = new Set(savedModelSettings.map(s => s.id));
  models.forEach((model) => {
    if (!savedSettingIds.has(model.id)) {
      savedModelSettings.push({ id: model.id, hidden: false, order: savedModelSettings.length });
    }
  });
  normalizedConfig.modelSettings = savedModelSettings.filter(s => allModelIds.has(s.id));
  normalizedConfig.modelSettings.sort((a, b) => a.order - b.order);
  normalizedConfig.modelSettings.forEach((s, index) => { s.order = index; });
  normalizedConfig.defaultModel = canonicalizeModelId(normalizedConfig.defaultModel);
  normalizedConfig.lastUsedModel = canonicalizeModelId(normalizedConfig.lastUsedModel);
  normalizedConfig.memoryModelId = canonicalizeModelId(normalizedConfig.memoryModelId);
  if (!allModelIds.has(normalizedConfig.defaultModel)) {
    normalizedConfig.defaultModel = models[0]?.id;
  }
  if (!allModelIds.has(normalizedConfig.lastUsedModel)) {
    normalizedConfig.lastUsedModel = models[0]?.id;
  }
  const memoryModelIds = new Set(models
    .filter(model => model?.category !== 'image_generation' && model?.outputModality !== 'image')
    .map(model => model.id));
  if (!memoryModelIds.has(normalizedConfig.memoryModelId)) {
    normalizedConfig.memoryModelId = memoryModelIds.has('gemini-3.5-flash-lite')
      ? 'gemini-3.5-flash-lite'
      : models.find(model => memoryModelIds.has(model.id))?.id || null;
  }
  normalizedConfig.lastCouncilConfig = normalizeCouncilConfig(normalizedConfig.lastCouncilConfig, {
    models,
    maxCouncilModels,
    canonicalizeModelId
  });
  normalizedConfig.councilGroups = normalizeCouncilGroups(normalizedConfig.councilGroups, {
    isKnownModel: (id) => allModelIds.has(id),
    canonicalizeModelId,
    maxMembers: maxCouncilModels
  });
  normalizedConfig.recentModelIds = normalizeRecentModelIds(normalizedConfig.recentModelIds, {
    isKnownModel: (id) => allModelIds.has(id),
    canonicalizeModelId
  });
  // The CLI tools the person added, and the ones the model may use without being asked for (the "@" is what asks).
  normalizedConfig.cliEnabledIds = normalizeCliIds(normalizedConfig.cliEnabledIds);
  normalizedConfig.cliModelUseIds = normalizeCliIds(normalizedConfig.cliModelUseIds).filter((id) => normalizedConfig.cliEnabledIds.includes(id));
  // The version of each tool when it was added or last updated (the store lists the ones whose version has moved on).
  normalizedConfig.cliVersions = normalizeCliVersions(normalizedConfig.cliVersions);
  if (!councilTranslatorCandidates.some(model => model.id === normalizedConfig.councilTranslatorModelId)) {
    normalizedConfig.councilTranslatorModelId = councilTranslatorCandidates[0]?.id || null;
  }
  if (!singleTranslatorCandidates.some(model => model.id === normalizedConfig.singleDocumentTranslatorModelId)) {
    normalizedConfig.singleDocumentTranslatorModelId = singleTranslatorCandidates[0]?.id || null;
  }

  return normalizedConfig;
}
