import {
    cloneCouncilConfig as cloneLegacyCouncilConfig,
    createDefaultCouncilConfig,
    createModelIdCanonicalizer,
    normalizeCouncilConfig as normalizeLegacyCouncilConfig
} from '../kernel/config-normalization.js';

const MODEL_RELEASE_METADATA = Object.freeze({
    'gemini-3.7-flash': { releasedAt: 20260813, outputPricePerMillion: 3.75 },
    'gemini-3.5-flash-lite': { releasedAt: 20260721, outputPricePerMillion: 2.5 },
    'gemini-3.1-pro-preview': { releasedAt: 20260219, outputPricePerMillion: 12 },
    'nvidia/deepseek-ai/deepseek-v4-flash-0731': { releasedAt: 20260731, outputPricePerMillion: 0 },
    'nvidia/deepseek-ai/deepseek-v4-pro': { releasedAt: 20260424, outputPricePerMillion: 0 },
    'nvidia/z-ai/glm-5.2': { releasedAt: 20260616, outputPricePerMillion: 0 },
    'nvidia/moonshotai/kimi-k2.6': { releasedAt: 20260420, outputPricePerMillion: 0 },
    'nvidia/stepfun-ai/step-3.7-flash': { releasedAt: 20260528, outputPricePerMillion: 0 },
    'anthropic/claude-haiku-4.5': { releasedAt: 20251015, outputPricePerMillion: 5 },
    'anthropic/claude-sonnet-5': { releasedAt: 20260630, outputPricePerMillion: 10 },
    'anthropic/claude-opus-5': { releasedAt: 20260724, outputPricePerMillion: 25 },
    'anthropic/claude-fable-5': { releasedAt: 20260609, outputPricePerMillion: 50 },
    'deepseek/deepseek-v4-flash-0731': { releasedAt: 20260731, outputPricePerMillion: 0.28 },
    'deepseek/deepseek-v4-flash-vision-exp': { releasedAt: 20260821, outputPricePerMillion: 1.32 },
    'deepseek/deepseek-v4-pro-0813': { releasedAt: 20260813, outputPricePerMillion: 1.98 },
    'google/gemini-3.1-flash-lite-image': { releasedAt: 20260630, outputPricePerMillion: 1.5 },
    'google/gemini-3.1-flash-image': { releasedAt: 20260618, outputPricePerMillion: 3 },
    'google/gemini-3-pro-image': { releasedAt: 20260618, outputPricePerMillion: 12 },
    'minimax/minimax-m3': { releasedAt: 20260531, outputPricePerMillion: 1.2 },
    'moonshotai/kimi-k3': { releasedAt: 20260716, outputPricePerMillion: 15 },
    'poolside/laguna-s-2.1:free': { releasedAt: 20260721, outputPricePerMillion: 0 },
    'nvidia/nemotron-3-super-120b-a12b:free': { releasedAt: 20260311, outputPricePerMillion: 0 },
    'nvidia/nemotron-3-ultra-550b-a55b:free': { releasedAt: 20260604, outputPricePerMillion: 0 },
    'nvidia/nemotron-3.5-lightning:free': { releasedAt: 20260807, outputPricePerMillion: 0 },
    'openai/gpt-5.5': { releasedAt: 20260424, outputPricePerMillion: 30 },
    'openai/gpt-5.6-luna': { releasedAt: 20260709, outputPricePerMillion: 6 },
    'openai/gpt-5.6-terra': { releasedAt: 20260709, outputPricePerMillion: 15 },
    'openai/gpt-5.6-sol': { releasedAt: 20260709, outputPricePerMillion: 30 },
    'openai/gpt-image-2': { releasedAt: 20260624, outputPricePerMillion: 8 },
    'qwen/qwen3.7-flash': { releasedAt: 20260727, outputPricePerMillion: 0.13 },
    'qwen/qwen3.7-plus': { releasedAt: 20260603, outputPricePerMillion: 1.28 },
    'qwen/qwen3.8-max': { releasedAt: 20260803, outputPricePerMillion: 6 },
    'stealth/ox-alpha': { releasedAt: 20260820, outputPricePerMillion: 0 },
    'x-ai/grok-4.6': { releasedAt: 20260810, outputPricePerMillion: 6 },
    'z-ai/glm-5.3': { releasedAt: 20260816, outputPricePerMillion: 4.4 }
});

export const MODELS = [
    // Gemini Models (Native)
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'gemini', descriptionKey: 'model_gemini_3_7_flash_desc' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', provider: 'gemini', descriptionKey: 'model_gemini_3_5_flash_lite_desc' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'gemini', descriptionKey: 'model_gemini_3_1_pro_preview_desc' },

    // NVIDIA Build Free Models
    { id: 'nvidia/deepseek-ai/deepseek-v4-flash-0731', apiId: 'deepseek-ai/deepseek-v4-flash-0731', legacyIds: ['nvidia/deepseek-ai/deepseek-v4-flash', 'deepseek-ai/deepseek-v4-flash'], name: 'NVIDIA DeepSeek V4 Flash 0731', provider: 'nvidia', descriptionKey: 'model_nvidia_deepseek_v4_flash_0731_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/deepseek-ai/deepseek-v4-pro', apiId: 'deepseek-ai/deepseek-v4-pro', name: 'NVIDIA DeepSeek V4 Pro', provider: 'nvidia', descriptionKey: 'model_nvidia_deepseek_v4_pro_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/z-ai/glm-5.2', apiId: 'z-ai/glm-5.2', name: 'NVIDIA GLM-5.2', provider: 'nvidia', descriptionKey: 'model_nvidia_glm_5_2_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/moonshotai/kimi-k2.6', apiId: 'moonshotai/kimi-k2.6', name: 'NVIDIA Kimi K2.6', provider: 'nvidia', descriptionKey: 'model_nvidia_kimi_k2_6_desc', tier: ['free'], category: 'general' },
    { id: 'nvidia/stepfun-ai/step-3.7-flash', apiId: 'stepfun-ai/step-3.7-flash', name: 'NVIDIA Step 3.7 Flash', provider: 'nvidia', descriptionKey: 'model_nvidia_step_3_7_flash_desc', tier: ['free'], category: 'general' },

    // OpenRouter Paid Models (Anthropic)
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude 4.5 Haiku', provider: 'openrouter', descriptionKey: 'model_claude_haiku_4_5_desc' },
    { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'openrouter', descriptionKey: 'model_claude_sonnet_5_desc' },
    { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', provider: 'openrouter', descriptionKey: 'model_claude_opus_5_desc' },
    { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5', provider: 'openrouter', descriptionKey: 'model_claude_fable_5_desc' },

    // OpenRouter Paid Models (DeepSeek)
    { id: 'deepseek/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash 0731', provider: 'openrouter', descriptionKey: 'model_deepseek_v4_flash_0731_desc', category: 'general' },
    { id: 'deepseek/deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', provider: 'openrouter', descriptionKey: 'model_deepseek_v4_flash_vision_exp_desc', category: 'general' },
    { id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813', provider: 'openrouter', descriptionKey: 'model_deepseek_v4_pro_0813_desc', category: 'general' },

    // OpenRouter Image Models (Google)
    { id: 'google/gemini-3.1-flash-lite-image', name: 'Gemini 3.1 Flash Lite Image', provider: 'openrouter', descriptionKey: 'model_gemini_3_1_flash_lite_image_desc', category: 'image_generation', outputModality: 'image' },
    { id: 'google/gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', provider: 'openrouter', descriptionKey: 'model_gemini_3_1_flash_image_desc', category: 'image_generation', outputModality: 'image' },
    { id: 'google/gemini-3-pro-image', name: 'Gemini 3 Pro Image', provider: 'openrouter', descriptionKey: 'model_gemini_3_pro_image_desc', category: 'image_generation', outputModality: 'image' },

    // OpenRouter Paid Models (Minimax)
    { id: 'minimax/minimax-m3', name: 'Minimax M3', provider: 'openrouter', descriptionKey: 'model_minimax_m3_desc', category: 'general' },

    // OpenRouter Paid Models (MoonshotAI)
    { id: 'moonshotai/kimi-k3', name: 'Kimi K3', provider: 'openrouter', descriptionKey: 'model_kimi_k3_desc', category: 'coding' },

    // OpenRouter Free Models (Poolside)
    { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1', provider: 'openrouter', descriptionKey: 'model_laguna_s_2_1_desc', category: 'coding' },

    // OpenRouter Free Models (NVIDIA)
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'NVIDIA Nemotron 3 Super', provider: 'openrouter', descriptionKey: 'model_nemotron_3_super_120b_a12b_desc', category: 'general' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA Nemotron 3 Ultra', provider: 'openrouter', descriptionKey: 'model_nemotron_3_ultra_550b_a55b_desc', category: 'general' },
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA Nemotron 3.5 Lightning', provider: 'openrouter', descriptionKey: 'model_nemotron_3_5_lightning_desc', category: 'general' },

    // OpenRouter Paid Models (OpenAI)
    { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5', provider: 'openrouter', descriptionKey: 'model_gpt_5_5_desc', category: 'general' },
    { id: 'openai/gpt-5.6-luna', name: 'OpenAI GPT-5.6 Luna', provider: 'openrouter', descriptionKey: 'model_gpt_5_6_luna_desc', category: 'general' },
    { id: 'openai/gpt-5.6-terra', name: 'OpenAI GPT-5.6 Terra', provider: 'openrouter', descriptionKey: 'model_gpt_5_6_terra_desc', category: 'general' },
    { id: 'openai/gpt-5.6-sol', name: 'OpenAI GPT-5.6 Sol', provider: 'openrouter', descriptionKey: 'model_gpt_5_6_sol_desc', category: 'general' },
    { id: 'openai/gpt-image-2', name: 'OpenAI GPT Image 2', provider: 'openrouter', descriptionKey: 'model_gpt_image_2_desc', category: 'image_generation', outputModality: 'image', supportsImageStreaming: true },

    // OpenRouter Paid Models (Qwen)
    { id: 'qwen/qwen3.7-flash', name: 'Qwen3.7 Flash', provider: 'openrouter', descriptionKey: 'model_qwen3_7_flash_desc', category: 'general' },
    { id: 'qwen/qwen3.7-plus', name: 'Qwen3.7 Plus', provider: 'openrouter', descriptionKey: 'model_qwen3_7_plus_desc', category: 'general' },
    { id: 'qwen/qwen3.8-max', name: 'Qwen3.8 Max', provider: 'openrouter', descriptionKey: 'model_qwen3_8_max_desc', category: 'general' },

    // OpenRouter Beta Models (Stealth)
    { id: 'stealth/ox-alpha', name: 'Ox Alpha', provider: 'openrouter', descriptionKey: 'model_ox_alpha_desc', category: 'coding', isBeta: true, requiresStealthTermsAcknowledgement: true, stealthTermsAcknowledgementId: 'stealth/ox-alpha@stealth-terms-v1' },

    // OpenRouter Paid Models (xAI)
    { id: 'x-ai/grok-4.6', name: 'xAI Grok 4.6', provider: 'openrouter', descriptionKey: 'model_grok_4_6_desc', category: 'general' },

    // OpenRouter Paid Models (Z.ai)
    { id: 'z-ai/glm-5.3', name: 'Z.ai GLM 5.3', provider: 'openrouter', descriptionKey: 'model_glm_5_3_desc', category: 'general' },
].map((model) => Object.freeze({ ...model, ...MODEL_RELEASE_METADATA[model.id] }));
export const IMAGE_GENERATION_MODEL_IDS = Object.freeze([
    'openai/gpt-image-2',
    'google/gemini-3-pro-image',
    'google/gemini-3.1-flash-image',
    'google/gemini-3.1-flash-lite-image'
]);
export const CHEAP_MODEL_ID = 'gemini-3.5-flash-lite';
export const OPENROUTER_VISION_MODELS = [
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-sonnet-5',
    'anthropic/claude-opus-5',
    'anthropic/claude-fable-5',
    'deepseek/deepseek-v4-flash-vision-exp',
    'minimax/minimax-m3',
    'moonshotai/kimi-k3',
    'openai/gpt-5.5',
    'openai/gpt-5.6-luna',
    'openai/gpt-5.6-terra',
    'openai/gpt-5.6-sol',
    'qwen/qwen3.7-flash',
    'qwen/qwen3.7-plus',
    'qwen/qwen3.8-max',
    'stealth/ox-alpha',
    'x-ai/grok-4.6'
];
export const NVIDIA_VISION_MODELS = [
    'moonshotai/kimi-k2.6',
    'stepfun-ai/step-3.7-flash'
];
export const GEMINI_DOCUMENT_MODELS = [
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview'
];
const REASONING_EFFORT_LABELS = Object.freeze({
    none: ['快速模式', 'Fast', 'Rapide', 'Быстро', 'Rápido'],
    minimal: ['極低', 'Minimal', 'Très bas', 'Минимальный', 'Mínimo'],
    low: ['低', 'Low', 'Bas', 'Низкий', 'Bajo'],
    medium: ['中', 'Medium', 'Moyen', 'Средний', 'Medio'],
    high: ['高', 'High', 'Eleve', 'Высокий', 'Alto'],
    xhigh: ['超高', 'Extra high', 'Tres eleve', 'Очень высокий', 'Muy alto'],
    max: ['極致', 'Max', 'Maximum', 'Максимальный', 'Máximo'],
    highest: ['最高', 'Highest', 'Le plus eleve', 'Наивысший', 'El más alto']
});
const REASONING_LANGUAGE_INDEX = Object.freeze({ 'zh-TW': 0, en: 1, fr: 2, ru: 3, es: 4 });
const createReasoningConfigs = (rows) => Object.freeze(Object.fromEntries(rows.flatMap(([providerParameter, options, defaultEffort, modelIds, extra]) =>
    modelIds.map(id => [id, { providerParameter, options, defaultEffort, ...(extra || {}) }])
)));
const GEMINI_THINKING_LEVEL = 'geminiThinkingLevel';
const NVIDIA_REASONING_EFFORT = 'nvidiaReasoningEffort';
const OPENROUTER_REASONING_EFFORT = 'openrouterReasoningEffort';
const LOW_MEDIUM_HIGH = ['low', 'medium', 'high'];
export const MODEL_REASONING_CONFIGS = createReasoningConfigs([
    [GEMINI_THINKING_LEVEL, LOW_MEDIUM_HIGH, 'medium', ['gemini-3.7-flash']],
    [GEMINI_THINKING_LEVEL, ['minimal', 'low', 'medium', 'high'], 'minimal', ['gemini-3.5-flash-lite']],
    [GEMINI_THINKING_LEVEL, LOW_MEDIUM_HIGH, 'high', ['gemini-3.1-pro-preview']],
    [NVIDIA_REASONING_EFFORT, ['none', 'high', 'max'], 'high', ['nvidia/deepseek-ai/deepseek-v4-flash-0731']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'medium', 'high', 'xhigh', 'max'], 'medium', ['anthropic/claude-fable-5', 'anthropic/claude-sonnet-5']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'medium', 'high', 'xhigh', 'max'], 'high', ['anthropic/claude-opus-5']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'high', 'max'], 'high', ['deepseek/deepseek-v4-flash-0731', 'deepseek/deepseek-v4-pro-0813']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'high', 'max'], 'high', ['deepseek/deepseek-v4-flash-vision-exp']],
    [OPENROUTER_REASONING_EFFORT, ['minimal', 'high'], 'minimal', ['google/gemini-3.1-flash-lite-image', 'google/gemini-3.1-flash-image']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'medium'], 'medium', ['nvidia/nemotron-3-super-120b-a12b:free'], { supportsMaxTokens: true }],
    [OPENROUTER_REASONING_EFFORT, ['medium', 'high'], 'high', ['nvidia/nemotron-3-ultra-550b-a55b:free'], { supportsMaxTokens: true }],
    [OPENROUTER_REASONING_EFFORT, ['minimal', 'low', 'medium', 'high', 'xhigh'], 'xhigh', ['qwen/qwen3.8-max']],
    [OPENROUTER_REASONING_EFFORT, ['none', 'low', 'medium', 'high', 'xhigh'], 'medium', ['openai/gpt-5.5']],
    [OPENROUTER_REASONING_EFFORT, ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium', ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'high', 'max'], 'high', ['moonshotai/kimi-k3']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'high', 'max'], 'max', ['stealth/ox-alpha']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'medium', 'high', 'xhigh'], 'high', ['x-ai/grok-4.6']],
    [OPENROUTER_REASONING_EFFORT, ['low', 'high', 'max'], 'max', ['z-ai/glm-5.3']]
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
            },
            ru: {
                title: 'Совет моделей',
                enable: 'Включить совет',
                consensus: 'Консенсус',
                deliberation: 'Обсуждение',
                participants: 'Модели-участники',
                synthesizer: 'Итоговая модель',
                required: 'Выберите 2–5 моделей-участников и 1 итоговую модель',
                tooFew: 'Выберите не менее 2 моделей-участников',
                tooMany: 'Можно выбрать не более 5 моделей-участников',
                missingSynthesizer: 'Выберите итоговую модель',
                missingApiKey: 'Для некоторых выбранных моделей отсутствуют API-ключи',
                attachmentUnsupported: 'Некоторые модели-участники не поддерживают текущие вложения',
                ready: 'Совет готов',
                disabled: 'Выключен',
                selectSynthesizer: 'Выберите итоговую модель',
                rawNotes: 'Ответы совета моделей',
                failedModels: 'Модели с ошибками',
                deliberationRound: 'Правки второго раунда',
                consensusMode: 'Режим консенсуса',
                deliberationMode: 'Режим обсуждения'
            },
            es: {
                title: 'Consejo de modelos',
                enable: 'Activar consejo',
                consensus: 'Consenso',
                deliberation: 'Debate',
                participants: 'Modelos participantes',
                synthesizer: 'Modelo de síntesis',
                required: 'Elige entre 2 y 5 modelos participantes y 1 modelo de síntesis',
                tooFew: 'Elige al menos 2 modelos participantes',
                tooMany: 'Puedes elegir hasta 5 modelos participantes',
                missingSynthesizer: 'Elige un modelo de síntesis',
                missingApiKey: 'Faltan claves de API para algunos modelos seleccionados',
                attachmentUnsupported: 'Algunos modelos participantes no admiten los archivos adjuntos actuales',
                ready: 'Consejo listo',
                disabled: 'Desactivado',
                selectSynthesizer: 'Elige el modelo de síntesis',
                rawNotes: 'Registro del consejo de modelos',
                failedModels: 'Modelos incompletos',
                deliberationRound: 'Revisiones de la segunda ronda',
                consensusMode: 'Modo consenso',
                deliberationMode: 'Modo debate'
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

export const getDefaultReasoningLabel = (uiLanguage = 'zh-TW') => ({
    'zh-TW': '預設',
    en: 'Default',
    fr: 'Defaut',
    ru: 'По умолчанию',
    es: 'Predeterminado'
}[uiLanguage] || 'Default');

export const getProviderLabel = (provider) => {
    if (provider === 'gemini') return 'Gemini';
    if (provider === 'openrouter') return 'OpenRouter';
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
    return model.id?.includes(':free') ? ['free'] : ['paid'];
};

export const modelSupportsVision = (model) => Boolean(model && (
    model.outputModality === 'image' ||
    model.provider === 'gemini' ||
    (model.provider === 'openrouter' && OPENROUTER_VISION_MODELS.includes(model.id)) ||
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
    model.provider === 'nvidia'
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
