export function createLegacyRuntimeConfigStore({ defaultModelId } = {}) {
  let config = {
    apiKeys: { gemini: '', openrouter: '', nvidia: '', tavily: '', tinyfish: '' },
    defaultModel: defaultModelId,
    modelSettings: [],
    enableAutoWebSearch: false,
    visionCheckEnabled: true,
    // Whether the steps of a reply being made start open (otherwise they are folded into one line).
    processOpen: false,
    fileModeDefault: 'advanced',
    // Where replies are made: the server (they go on when the page is closed) or this device. See runtime/server-reply/.
    replyRunLocation: 'server',
    searchProvider: 'tavily',
    tavilySearchDepth: 'basic',
    // Replies are always shown as they are written (there is no other mode).
    outputMode: 'realtime',
    aiBubbleColor: 'default',
    userBubbleColor: 'default',
    autoNaming: true,
    lastUsedModel: null,
    acknowledgedStealthModelTerms: [],
    memorySystemVersion: 2,
    // Memory work deliberately has its own model. It must never inherit the active chat model.
    memoryModelId: 'gemini-3.5-flash-lite',
    memoryProfileEnabled: true,
    historyRecallEnabled: false,
    memorySync: { version: 1, profileEntries: [], profileCandidates: [], resolvedProfileCandidateIds: [], resolvedTopicSummaryIds: [], suppressionRules: [], longTermTopicSummaries: [] },
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
    voicePrivacyNoticeAcknowledged: false,
    lastCouncilConfig: {
      enabled: false,
      mode: 'consensus',
      participantModelIds: [],
      synthesizerModelId: null,
      showRawResponses: true,
      showComparisonTable: true
    },
    // Up to five named sets of council members (and who combines them), and the models used lately.
    councilGroups: [],
    recentModelIds: [],
    // The CLI tools (命令工具) the person added, and those the model may use by itself.
    cliEnabledIds: [],
    cliModelUseIds: [],
    cliVersions: {},
    // The network of the CLI tools: ask about a site with no rule ('new') or about every site ('always'), and the person's rules for sites.
    netMode: 'new',
    netRules: {},
    // When each item of those settings last changed (so devices merge them item by item: see sync/cloud-cli-settings-merge.js).
    cliStamps: {},
    cliUseStamps: {},
    netStamps: {},
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
