export function createLegacyRuntimeConfigStore({ defaultModelId } = {}) {
  let config = {
    apiKeys: { gemini: '', openrouter: '', stepPlan: '', nvidia: '', tavily: '' },
    defaultModel: defaultModelId,
    modelSettings: [],
    enableAutoWebSearch: false,
    tavilySearchDepth: 'basic',
    outputMode: 'typewriter',
    aiBubbleColor: 'default',
    userBubbleColor: 'default',
    autoNaming: true,
    lastUsedModel: null,
    memorySystemVersion: 2,
    memoryProfileEnabled: true,
    historyRecallEnabled: false,
    memorySync: { version: 1, profileEntries: [], suppressionRules: [], longTermTopicSummaries: [] },
    memoryEnabled1: true,
    enableAutoMemory: true,
    customWallpaper: null,
    wallpaperBrightness: 'light',
    uiTheme: {
      mode: 'default',
      style: 'single',
      customColor: '#3b82f6',
      adaptiveColor: '#3b82f6',
      adaptivePalette: [],
      adaptiveGradient: ''
    },
    uiLanguage: 'zh-TW',
    aiDefaultLanguage: 'zh-TW',
    enableUpdateNotifications: true,
    lastSeenVersion: '',
    isLearningMode: false,
    lastCouncilConfig: {
      enabled: false,
      mode: 'consensus',
      participantModelIds: [],
      synthesizerModelId: null,
      showRawResponses: true,
      showComparisonTable: true
    },
    councilTranslatorModelId: null,
    singleDocumentTranslatorModelId: null
  };

  const getConfig = () => config;
  const replaceConfig = (nextConfig) => {
    config = nextConfig;
    return nextConfig;
  };

  return {
    getConfig,
    replaceConfig
  };
}
