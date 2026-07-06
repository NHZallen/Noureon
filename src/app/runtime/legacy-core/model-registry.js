import {
    cloneCouncilConfig as cloneLegacyCouncilConfig,
    createDefaultCouncilConfig,
    createModelIdCanonicalizer,
    normalizeCouncilConfig as normalizeLegacyCouncilConfig
} from '../kernel/config-normalization.js';

export const MODELS = [
    // Gemini Models (Native)
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'gemini', descriptionKey: 'model_gemini_3_5_flash_desc' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'gemini', descriptionKey: 'model_gemini_3_1_pro_preview_desc' },

    // NVIDIA Build Free Models
    { id: 'nvidia/deepseek-ai/deepseek-v4-flash', apiId: 'deepseek-ai/deepseek-v4-flash', name: 'NVIDIA DeepSeek V4 Flash', provider: 'nvidia', descriptionKey: 'model_nvidia_deepseek_v4_flash_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/deepseek-ai/deepseek-v4-pro', apiId: 'deepseek-ai/deepseek-v4-pro', name: 'NVIDIA DeepSeek V4 Pro', provider: 'nvidia', descriptionKey: 'model_nvidia_deepseek_v4_pro_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/z-ai/glm-5.2', apiId: 'z-ai/glm-5.2', name: 'NVIDIA GLM-5.2', provider: 'nvidia', descriptionKey: 'model_nvidia_glm_5_2_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/moonshotai/kimi-k2.6', apiId: 'moonshotai/kimi-k2.6', name: 'NVIDIA Kimi K2.6', provider: 'nvidia', descriptionKey: 'model_nvidia_kimi_k2_6_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/minimaxai/minimax-m2.7', apiId: 'minimaxai/minimax-m2.7', name: 'NVIDIA MiniMax M2.7', provider: 'nvidia', descriptionKey: 'model_nvidia_minimax_m2_7_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/mistralai/mistral-medium-3.5-128b', apiId: 'mistralai/mistral-medium-3.5-128b', name: 'NVIDIA Mistral Medium 3.5 128B', provider: 'nvidia', descriptionKey: 'model_nvidia_mistral_medium_3_5_128b_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b', apiId: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'NVIDIA Nemotron 3 Ultra', provider: 'nvidia', descriptionKey: 'model_nvidia_nemotron_3_ultra_550b_a55b_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/qwen/qwen3.5-122b-a10b', apiId: 'qwen/qwen3.5-122b-a10b', name: 'NVIDIA Qwen3.5 122B A10B', provider: 'nvidia', descriptionKey: 'model_nvidia_qwen3_5_122b_a10b_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/qwen/qwen3.5-397b-a17b', apiId: 'qwen/qwen3.5-397b-a17b', name: 'NVIDIA Qwen3.5 397B A17B', provider: 'nvidia', descriptionKey: 'model_nvidia_qwen3_5_397b_a17b_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/stepfun-ai/step-3.7-flash', apiId: 'stepfun-ai/step-3.7-flash', name: 'NVIDIA Step 3.7 Flash', provider: 'nvidia', descriptionKey: 'model_nvidia_step_3_7_flash_desc', tier: ['free'], category: 'general' },

    // OpenRouter Paid Models (Anthropic)
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude 4.5 Haiku', provider: 'openrouter', descriptionKey: 'model_claude_haiku_4_5_desc' },
    { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'openrouter', descriptionKey: 'model_claude_sonnet_5_desc' },
    { id: 'anthropic/claude-opus-4.8', name: 'Claude 4.8 Opus', provider: 'openrouter', descriptionKey: 'model_claude_opus_4_8_desc' },
    { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5', provider: 'openrouter', descriptionKey: 'model_claude_fable_5_desc' },

    // OpenRouter Paid Models (DeepSeek)
    { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'openrouter', descriptionKey: 'model_deepseek_v4_flash_desc', category: 'general' },
    { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'openrouter', descriptionKey: 'model_deepseek_v4_pro_desc', category: 'general' },

    // OpenRouter Image Models (Google)
    { id: 'google/gemini-3.1-flash-lite-image', name: 'Gemini 3.1 Flash Lite Image', provider: 'openrouter', descriptionKey: 'model_gemini_3_1_flash_lite_image_desc', category: 'image_generation', outputModality: 'image' },
    { id: 'google/gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', provider: 'openrouter', descriptionKey: 'model_gemini_3_1_flash_image_desc', category: 'image_generation', outputModality: 'image' },
    { id: 'google/gemini-3-pro-image', name: 'Gemini 3 Pro Image', provider: 'openrouter', descriptionKey: 'model_gemini_3_pro_image_desc', category: 'image_generation', outputModality: 'image' },

    // OpenRouter Paid Models (Minimax)
    { id: 'minimax/minimax-m3', name: 'Minimax M3', provider: 'openrouter', descriptionKey: 'model_minimax_m3_desc', category: 'general' },

    // OpenRouter Paid Models (MoonshotAI)
    { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', provider: 'openrouter', descriptionKey: 'model_kimi_k2_6_desc', category: 'general' },
    { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'openrouter', descriptionKey: 'model_kimi_k2_7_code_desc', category: 'coding' },

    // OpenRouter Free Models (NVIDIA)
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'NVIDIA Nemotron 3 Super', provider: 'openrouter', descriptionKey: 'model_nemotron_3_super_120b_a12b_desc', category: 'general' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA Nemotron 3 Ultra', provider: 'openrouter', descriptionKey: 'model_nemotron_3_ultra_550b_a55b_desc', category: 'general' },

    // OpenRouter Free Models (Tencent)
    { id: 'tencent/hy3:free', name: 'Tencent HY3', provider: 'openrouter', descriptionKey: 'model_tencent_hy3_desc', category: 'general', retirementDate: '2026-07-21' },

    // OpenRouter Paid Models (OpenAI)
    { id: 'openai/gpt-5.4-nano', name: 'OpenAI GPT-5.4 Nano', provider: 'openrouter', descriptionKey: 'model_gpt_5_4_nano_desc', category: 'general' },
    { id: 'openai/gpt-5.4-mini', name: 'OpenAI GPT-5.4 Mini', provider: 'openrouter', descriptionKey: 'model_gpt_5_4_mini_desc', category: 'general' },
    { id: 'openai/gpt-5.4', name: 'OpenAI GPT-5.4', provider: 'openrouter', descriptionKey: 'model_gpt_5_4_desc', category: 'general' },
    { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5', provider: 'openrouter', descriptionKey: 'model_gpt_5_5_desc', category: 'general' },
    { id: 'openai/gpt-image-2', name: 'OpenAI GPT Image 2', provider: 'openrouter', descriptionKey: 'model_gpt_image_2_desc', category: 'image_generation', outputModality: 'image', supportsImageStreaming: true },

    // OpenRouter Paid Models (Qwen)
    { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen3.5 Flash', provider: 'openrouter', descriptionKey: 'model_qwen3_5_flash_02_23_desc', category: 'general' },
    { id: 'qwen/qwen3.7-plus', name: 'Qwen3.7 Plus', provider: 'openrouter', descriptionKey: 'model_qwen3_7_plus_desc', category: 'general' },
    { id: 'qwen/qwen3.7-max', name: 'Qwen3.7 Max', provider: 'openrouter', descriptionKey: 'model_qwen3_7_max_desc', category: 'general' },

    // OpenRouter Paid Models (Xiaomi)
    { id: 'xiaomi/mimo-v2.5', name: 'Xiaomi MiMo V2.5', provider: 'openrouter', descriptionKey: 'model_mimo_v2_5_desc', category: 'general' },
    { id: 'xiaomi/mimo-v2.5-pro', name: 'Xiaomi MiMo V2.5 Pro', provider: 'openrouter', descriptionKey: 'model_mimo_v2_5_pro_desc', category: 'general' },

    // Step Plan Models (Native StepFun)
    { id: 'step-plan/step-3.7-flash', apiId: 'step-3.7-flash', name: 'Step Plan Step 3.7 Flash', provider: 'stepfun', descriptionKey: 'model_step_plan_step_3_7_flash_desc', tier: ['paid'], category: 'thinking', reasoningEffort: 'medium' },
    { id: 'step-plan/step-3.5-flash-2603', apiId: 'step-3.5-flash-2603', name: 'Step Plan Step 3.5 Flash 2603', provider: 'stepfun', descriptionKey: 'model_step_plan_step_3_5_flash_2603_desc', tier: ['paid'], category: 'thinking', reasoningEffort: 'low' },
    { id: 'step-plan/step-3.5-flash', apiId: 'step-3.5-flash', name: 'Step Plan Step 3.5 Flash', provider: 'stepfun', descriptionKey: 'model_step_plan_step_3_5_flash_desc', tier: ['paid'], category: 'thinking', reasoningEffort: 'medium' },
    { id: 'step-plan/step-router-v1', apiId: 'step-router-v1', name: 'Step Plan Router V1', provider: 'stepfun', descriptionKey: 'model_step_plan_router_v1_desc', tier: ['paid'], category: 'thinking' },
];
export const IMAGE_GENERATION_MODEL_IDS = Object.freeze([
    'openai/gpt-image-2',
    'google/gemini-3-pro-image',
    'google/gemini-3.1-flash-image',
    'google/gemini-3.1-flash-lite-image'
]);
export const CHEAP_MODEL_ID = 'gemini-3.5-flash';
export const OPENROUTER_VISION_MODELS = [
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-sonnet-5',
    'anthropic/claude-opus-4.8',
    'anthropic/claude-fable-5',
    'minimax/minimax-m3',
    'moonshotai/kimi-k2.6',
    'moonshotai/kimi-k2.7-code',
    'openai/gpt-5.4-nano',
    'openai/gpt-5.4-mini',
    'openai/gpt-5.4',
    'openai/gpt-5.5',
    'qwen/qwen3.5-flash-02-23',
    'qwen/qwen3.7-plus',
    'xiaomi/mimo-v2.5'
];
export const NVIDIA_VISION_MODELS = [
    'qwen/qwen3.5-122b-a10b',
    'moonshotai/kimi-k2.6',
    'qwen/qwen3.5-397b-a17b',
    'stepfun-ai/step-3.7-flash'
];
export const STEP_PLAN_VISION_MODELS = [
    'step-3.7-flash'
];
export const GEMINI_DOCUMENT_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview'
];
const REASONING_EFFORT_LABELS = Object.freeze({
    none: ['快速模式', 'Fast', 'Rapide'],
    minimal: ['低', 'Low', 'Bas'],
    low: ['低', 'Low', 'Bas'],
    medium: ['中', 'Medium', 'Moyen'],
    high: ['高', 'High', 'Eleve'],
    xhigh: ['超高', 'Extra high', 'Tres eleve'],
    max: ['極致', 'Max', 'Maximum'],
    highest: ['最高', 'Highest', 'Le plus eleve']
});
const REASONING_LANGUAGE_INDEX = Object.freeze({ 'zh-TW': 0, en: 1, fr: 2 });
const createReasoningConfigs = (rows) => Object.freeze(Object.fromEntries(rows.flatMap(([providerParameter, options, defaultEffort, modelIds, extra]) =>
    modelIds.map(id => [id, { providerParameter, options, defaultEffort, ...(extra || {}) }])
)));
const GEMINI_THINKING_LEVEL = 'geminiThinkingLevel';
const STEPFUN_REASONING_EFFORT = 'stepfunReasoningEffort';
const OPENROUTER_REASONING_EFFORT = 'openrouterReasoningEffort';
const LOW_MEDIUM_HIGH = ['low', 'medium', 'high'];
const HIGH_XHIGH = ['high', 'xhigh'];
export const MODEL_REASONING_CONFIGS = createReasoningConfigs([
    [GEMINI_THINKING_LEVEL, ['minimal', 'low', 'medium', 'high'], 'medium', ['gemini-3.5-flash']],
    [GEMINI_THINKING_LEVEL, LOW_MEDIUM_HIGH, 'high', ['gemini-3.1-pro-preview']],
    [STEPFUN_REASONING_EFFORT, LOW_MEDIUM_HIGH, 'medium', ['step-plan/step-3.7-flash', 'step-plan/step-3.5-flash']],
    [STEPFUN_REASONING_EFFORT, ['low', 'high'], 'low', ['step-plan/step-3.5-flash-2603']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'medium', 'high', 'xhigh', 'max'], 'medium', ['anthropic/claude-fable-5', 'anthropic/claude-sonnet-5', 'anthropic/claude-opus-4.8']],
    [OPENROUTER_REASONING_EFFORT, HIGH_XHIGH, 'high', ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro']],
    [OPENROUTER_REASONING_EFFORT, ['minimal', 'high'], 'minimal', ['google/gemini-3.1-flash-lite-image', 'google/gemini-3.1-flash-image']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'medium'], 'medium', ['nvidia/nemotron-3-super-120b-a12b:free'], { supportsMaxTokens: true }],
    [OPENROUTER_REASONING_EFFORT, ['medium', 'high'], 'high', ['nvidia/nemotron-3-ultra-550b-a55b:free'], { supportsMaxTokens: true }],
    [OPENROUTER_REASONING_EFFORT, ['none', 'low', 'medium', 'high', 'xhigh'], 'medium', ['openai/gpt-5.4-nano', 'openai/gpt-5.4-mini', 'openai/gpt-5.4', 'openai/gpt-5.5']]
]);
export const COUNCIL_MIN_MODELS = 2;
export const COUNCIL_MAX_MODELS = 5;
export const COUNCIL_RESPONSE_CHAR_LIMIT = 8000;
export const COUNCIL_RETRY_DELAY_MS = 900;
export const COUNCIL_TEXT = {
            'zh-TW': {
                title: '模型理事會',
                enable: '啟用理事會',
                consensus: '共識',
                deliberation: '討論',
                participants: '參與模型',
                synthesizer: '統整模型',
                required: '請選擇 2-5 個參與模型與 1 個統整模型',
                tooFew: '至少選擇 2 個參與模型',
                tooMany: '最多只能選擇 5 個參與模型',
                missingSynthesizer: '請選擇統整模型',
                missingApiKey: '部分模型缺少 API 金鑰',
                attachmentUnsupported: '部分參與模型不支援目前附件',
                ready: '理事會已就緒',
                disabled: '未啟用',
                selectSynthesizer: '選擇統整模型',
                rawNotes: '模型理事會紀錄',
                failedModels: '未完成模型',
                deliberationRound: '第二輪修正',
                consensusMode: '共識模式',
                deliberationMode: '討論模式'
            },
            en: {
                title: 'Model Council',
                enable: 'Enable council',
                consensus: 'Consensus',
                deliberation: 'Discussion',
                participants: 'Participant models',
                synthesizer: 'Synthesizer model',
                required: 'Choose 2-5 participant models and 1 synthesizer model',
                tooFew: 'Choose at least 2 participant models',
                tooMany: 'Choose up to 5 participant models',
                missingSynthesizer: 'Choose a synthesizer model',
                missingApiKey: 'Some selected models are missing API keys',
                attachmentUnsupported: 'Some participant models do not support the current attachments',
                ready: 'Council ready',
                disabled: 'Disabled',
                selectSynthesizer: 'Choose synthesizer',
                rawNotes: 'Model council record',
                failedModels: 'Incomplete models',
                deliberationRound: 'Second-round revisions',
                consensusMode: 'Consensus mode',
                deliberationMode: 'Discussion mode'
            },
            fr: {
                title: 'Conseil de modèles',
                enable: 'Activer le conseil',
                consensus: 'Consensus',
                deliberation: 'Discussion',
                participants: 'Modèles participants',
                synthesizer: 'Modèle de synthèse',
                required: 'Choisissez 2 à 5 modèles participants et 1 modèle de synthèse',
                tooFew: 'Choisissez au moins 2 modèles participants',
                tooMany: 'Choisissez au maximum 5 modèles participants',
                missingSynthesizer: 'Choisissez un modèle de synthèse',
                missingApiKey: 'Certains modèles sélectionnés n’ont pas de clé API',
                attachmentUnsupported: 'Certains modèles participants ne prennent pas en charge les pièces jointes',
                ready: 'Conseil prêt',
                disabled: 'Désactivé',
                selectSynthesizer: 'Choisir le modèle de synthèse',
                rawNotes: 'Compte rendu du conseil',
                failedModels: 'Modèles incomplets',
                deliberationRound: 'Révisions du second tour',
                consensusMode: 'Mode consensus',
                deliberationMode: 'Mode discussion'
            }
        };

export const getDefaultCouncilConfig = createDefaultCouncilConfig;
export const getCanonicalModelId = createModelIdCanonicalizer({ models: MODELS });

export const normalizeCouncilConfig = (value = {}) => normalizeLegacyCouncilConfig(value, {
    models: MODELS,
    maxCouncilModels: COUNCIL_MAX_MODELS,
    canonicalizeModelId: getCanonicalModelId
});

export const cloneCouncilConfig = (value = {}) => cloneLegacyCouncilConfig(value, {
    models: MODELS,
    maxCouncilModels: COUNCIL_MAX_MODELS,
    canonicalizeModelId: getCanonicalModelId
});

export const isCouncilEnabled = (conv) => Boolean(conv?.council?.enabled);

export const getModelsByIds = (modelIds = []) => modelIds
    .map(modelId => MODELS.find(model => model.id === getCanonicalModelId(modelId)))
    .filter(Boolean);

export const getModelApiId = (model) => model?.apiId || model?.id || '';

export const getModelReasoningConfig = (model) => {
    const config = model ? MODEL_REASONING_CONFIGS[model.id] : null;
    if (!config) return null;
    return {
        ...config,
        options: [...config.options]
    };
};

export const modelSupportsReasoningSelection = (model) => Boolean(getModelReasoningConfig(model));

export const normalizeReasoningEffort = (model, value) => {
    const config = getModelReasoningConfig(model);
    if (!config) return null;
    return config.options.includes(value) ? value : config.defaultEffort;
};

export const getReasoningEffortLabel = (value, uiLanguage = 'zh-TW') => {
    const labels = REASONING_EFFORT_LABELS[value];
    return labels?.[REASONING_LANGUAGE_INDEX[uiLanguage] ?? 1] || labels?.[1] || String(value || '');
};

export const getDefaultReasoningLabel = (uiLanguage = 'zh-TW') => (
    uiLanguage === 'zh-TW' ? '預設' : (uiLanguage === 'fr' ? 'Defaut' : 'Default')
);

export const getProviderLabel = (provider) => {
    if (provider === 'gemini') return 'Gemini';
    if (provider === 'openrouter') return 'OpenRouter';
    if (provider === 'stepfun') return 'Step Plan';
    if (provider === 'nvidia') return 'NVIDIA';
    if (provider === 'tavily') return 'Tavily';
    return provider || '';
};

export const getModelFamilyKey = (model) => {
    const apiId = getModelApiId(model).replace(/:free$/, '');
    return apiId
        .replace(/^google\//, '')
        .replace(/^deepseek-ai\//, 'deepseek/')
        .replace(/^minimaxai\//, 'minimax/')
        .toLowerCase();
};

export const getModelFamilyName = (model) => (model?.name || '')
    .replace(/^NVIDIA\s+/i, '')
    .replace(/\s+\(.*?\)$/g, '')
    .trim();

export const getModelTiers = (model) => {
    if (!model || model.isBeta) return [];
    if (Array.isArray(model.tier)) return model.tier;
    if (typeof model.tier === 'string') return [model.tier];
    if (model.provider === 'nvidia') return ['free'];
    if (model.provider === 'stepfun') return ['paid'];
    return model.id?.includes(':free') ? ['free'] : ['paid'];
};

export const modelSupportsVision = (model) => Boolean(model && (
    model.outputModality === 'image' ||
    model.provider === 'gemini' ||
    (model.provider === 'openrouter' && OPENROUTER_VISION_MODELS.includes(model.id)) ||
    (model.provider === 'stepfun' && STEP_PLAN_VISION_MODELS.includes(getModelApiId(model))) ||
    (model.provider === 'nvidia' && NVIDIA_VISION_MODELS.includes(getModelApiId(model)))
));

export const modelGeneratesImages = (model) => Boolean(
    model && model.outputModality === 'image' && IMAGE_GENERATION_MODEL_IDS.includes(model.id)
);

export const modelSupportsDocumentUpload = (model) => Boolean(model && (
    (model.provider === 'gemini' && GEMINI_DOCUMENT_MODELS.includes(model.id)) ||
    model.provider === 'openrouter'
));

export const modelSupportsUploadedFile = (model, file) => {
    if (!model || !file) return true;
    const mimeType = file.type || file.mimeType || file.inlineData?.mimeType || '';
    if (!mimeType) return true;
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        return modelSupportsVision(model);
    }
    return modelSupportsDocumentUpload(model);
};

export const modelSupportsCouncilTranslation = (model) => Boolean(modelSupportsVision(model) && modelSupportsDocumentUpload(model));
export const getCouncilTranslatorCandidates = () => MODELS.filter(modelSupportsCouncilTranslation);

export const modelSupportsSingleTranslation = (model) => Boolean(model && (
    model.provider === 'openrouter' ||
    (model.provider === 'gemini' && !getModelTiers(model).includes('free'))
));
export const getSingleTranslatorCandidates = () => MODELS.filter(modelSupportsSingleTranslation);

export const modelUsesNativeWebSearch = (model) => Boolean(model && model.provider === 'gemini');
export const modelUsesTavilySearch = (model) => Boolean(model && (
    model.provider === 'openrouter' ||
    model.provider === 'nvidia' ||
    model.provider === 'stepfun'
));
export const modelSupportsWebSearch = (model) => Boolean(modelUsesNativeWebSearch(model) || modelUsesTavilySearch(model));

export function createLegacyModelRegistry({
    getConfig = () => ({}),
    normalizeConversationModel = () => null
} = {}) {
    const getVisibleCouncilModels = () => {
        const config = getConfig() || {};
        const settings = Array.isArray(config.modelSettings) ? config.modelSettings : [];
        const sortedVisible = settings
            .filter(setting => !setting.hidden)
            .sort((a, b) => a.order - b.order)
            .map(setting => MODELS.find(model => model.id === setting.id))
            .filter(Boolean);
        return sortedVisible.length > 0 ? sortedVisible : [...MODELS];
    };

    const getCouncilSelectedModels = (conv) => {
        const council = normalizeCouncilConfig(conv?.council);
        return {
            council,
            participants: getModelsByIds(council.participantModelIds),
            synthesizer: MODELS.find(model => model.id === council.synthesizerModelId) || null
        };
    };

    const getCouncilTranslatorModel = () => {
        const config = getConfig() || {};
        const candidates = getCouncilTranslatorCandidates();
        if (candidates.length === 0) return null;
        return candidates.find(model => model.id === config.councilTranslatorModelId) || candidates[0];
    };

    const getSingleDocumentTranslatorModel = () => {
        const config = getConfig() || {};
        const candidates = getSingleTranslatorCandidates();
        if (candidates.length === 0) return null;
        return candidates.find(model => model.id === config.singleDocumentTranslatorModelId) || candidates[0];
    };

    const hasSingleDocumentAccess = (model) => Boolean(modelSupportsDocumentUpload(model) || getSingleDocumentTranslatorModel());
    const hasSingleWebSearchAccess = (model) => Boolean(modelSupportsWebSearch(model));
    const getCouncilSharedSearchModel = (synthesizer) => modelSupportsWebSearch(synthesizer) ? synthesizer : null;
    const hasCouncilWebSearchAccess = (synthesizer) => Boolean(getCouncilSharedSearchModel(synthesizer));
    const conversationNeedsTavilySearch = (conv) => {
        if (!conv?.isWebSearchEnabled) return false;
        if (isCouncilEnabled(conv)) {
            const { synthesizer } = getCouncilSelectedModels(conv);
            return modelUsesTavilySearch(synthesizer);
        }
        return modelUsesTavilySearch(normalizeConversationModel(conv));
    };

    return {
        getDefaultCouncilConfig,
        getCanonicalModelId,
        normalizeCouncilConfig,
        cloneCouncilConfig,
        isCouncilEnabled,
        getVisibleCouncilModels,
        getModelsByIds,
        getCouncilSelectedModels,
        getModelApiId,
        getProviderLabel,
        getModelFamilyKey,
        getModelFamilyName,
        modelSupportsUploadedFile,
        modelSupportsVision,
        modelSupportsDocumentUpload,
        modelSupportsCouncilTranslation,
        getCouncilTranslatorCandidates,
        modelSupportsSingleTranslation,
        getSingleTranslatorCandidates,
        getCouncilTranslatorModel,
        getSingleDocumentTranslatorModel,
        modelUsesNativeWebSearch,
        modelUsesTavilySearch,
        modelSupportsWebSearch,
        hasSingleDocumentAccess,
        hasSingleWebSearchAccess,
        getCouncilSharedSearchModel,
        hasCouncilWebSearchAccess,
        conversationNeedsTavilySearch,
        getModelTiers
    };
}
