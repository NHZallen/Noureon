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

export function createModelIdCanonicalizer({ models = [] } = {}) {
  return function getCanonicalModelId(modelId) {
    if (!modelId) return modelId;
    if (models.some(model => model.id === modelId)) return modelId;
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
    let openrouterKey = '';
    let stepPlanKey = '';
    let nvidiaKey = '';
    let tavilyKey = '';
    if (savedConfig.apiKeys) {
      openrouterKey = normalizeApiKeyValue(savedConfig.apiKeys.openrouter);
      stepPlanKey = normalizeApiKeyValue(savedConfig.apiKeys.stepPlan);
      nvidiaKey = normalizeApiKeyValue(savedConfig.apiKeys.nvidia);
      tavilyKey = normalizeApiKeyValue(savedConfig.apiKeys.tavily);
    }
    normalizedConfig = {
      ...currentConfig,
      ...savedConfig,
      apiKeys: {
        ...currentConfig.apiKeys,
        ...savedConfig.apiKeys,
        openrouter: openrouterKey,
        stepPlan: stepPlanKey,
        nvidia: nvidiaKey,
        tavily: tavilyKey
      },
      uiTheme: { ...currentConfig.uiTheme, ...(savedConfig.uiTheme || {}) }
    };
    normalizedConfig.uiTheme.style = normalizedConfig.uiTheme.style || 'single';
    normalizedConfig.uiTheme.adaptivePalette = normalizedConfig.uiTheme.adaptivePalette || [];
    normalizedConfig.uiTheme.adaptiveGradient = normalizedConfig.uiTheme.adaptiveGradient || '';
    normalizedConfig.outputMode = normalizedConfig.outputMode === 'realtime' ? 'realtime' : 'typewriter';
    normalizedConfig.tavilySearchDepth = normalizedConfig.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
  } else {
    normalizedConfig = {
      ...currentConfig,
      apiKeys: { ...(currentConfig?.apiKeys || {}) },
      uiTheme: { ...(currentConfig?.uiTheme || {}) }
    };
  }

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
  if (!allModelIds.has(normalizedConfig.defaultModel)) {
    normalizedConfig.defaultModel = models[0]?.id;
  }
  if (!allModelIds.has(normalizedConfig.lastUsedModel)) {
    normalizedConfig.lastUsedModel = models[0]?.id;
  }
  normalizedConfig.lastCouncilConfig = normalizeCouncilConfig(normalizedConfig.lastCouncilConfig, {
    models,
    maxCouncilModels,
    canonicalizeModelId
  });
  if (!councilTranslatorCandidates.some(model => model.id === normalizedConfig.councilTranslatorModelId)) {
    normalizedConfig.councilTranslatorModelId = councilTranslatorCandidates[0]?.id || null;
  }
  if (!singleTranslatorCandidates.some(model => model.id === normalizedConfig.singleDocumentTranslatorModelId)) {
    normalizedConfig.singleDocumentTranslatorModelId = singleTranslatorCandidates[0]?.id || null;
  }

  return normalizedConfig;
}
