// The models of OpenAI's own API, reached with the person's own OpenAI key (docs/superpowers/specs/2026-10-29-openai-provider-design.md): four text models and the two
// picture models. Everything about them that is not in the documents of OpenAI was found with scripts/openai-probe.mjs (the owner ran it, 2026-10-29, on gpt-6-luna and
// gpt-image-2.5-flare; the other three text models and Sunburst are taken to answer the same, and the lists of the depths of thinking are those of OpenRouter's rows).
//
// The id of a model in the app is `openai-api/<id at OpenAI>`: `openai/…` is already the id of the same models at OpenRouter. Text goes through the Responses API
// (`POST /v1/responses`, `store: false`: the whole conversation is sent each time), pictures through the Images API (`/v1/images/generations` and `/v1/images/edits`).
//
// Shared by the page and the server: no window, no document, no browser storage.

export const OPENAI_PROVIDER = 'openai';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_ID_PREFIX = 'openai-api/';
export const OPENAI_REASONING_PARAMETER = 'openaiReasoningEffort';

// The same ratios as the GPT Image models of OpenRouter (the size is worked out from the ratio and the tier: openai-image-generation.js).
const IMAGE_RATIOS = Object.freeze(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', 'auto']);
const IMAGE_QUALITIES = Object.freeze(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
const IMAGE_OPTIONS = Object.freeze(['quality', 'background', 'outputCompression']);
// The size follows the ratio and the quality at OpenRouter (no resolution); here a tier is offered because OpenAI takes any size: 1K, 2K and 4K.
const IMAGE_RESOLUTIONS = Object.freeze(['1K', '2K', '4K']);

const RELEASED = Object.freeze({
  'gpt-6-astra': [20260904, 50],
  'gpt-6-luna': [20260922, 0.5],
  'gpt-6.1-terra': [20261027, 5],
  'gpt-6.1-sol': [20260929, 10],
  'gpt-image-2.5-flare': [20260909, 30],
  'gpt-image-2.5-sunburst': [20260909, 30]
});

// [id at OpenAI, name, text of the description, depths of thinking, the one used when none is chosen]
const TEXT_ROWS = [
  ['gpt-6-astra', 'GPT-6 Astra', 'model_openai_gpt_6_astra_desc', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  ['gpt-6.1-sol', 'GPT-6.1 Sol', 'model_openai_gpt_6_1_sol_desc', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  ['gpt-6.1-terra', 'GPT-6.1 Terra', 'model_openai_gpt_6_1_terra_desc', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  // The probe: `none`, `low`, `medium`, `high`, `xhigh` and `max` are taken; `minimal` is refused (400).
  ['gpt-6-luna', 'GPT-6 Luna', 'model_openai_gpt_6_luna_desc', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium']
];

const IMAGE_ROWS = [
  ['gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst', 'model_openai_gpt_image_2_5_sunburst_desc'],
  ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'model_openai_gpt_image_2_5_flare_desc']
];

const base = (apiId, name, descriptionKey) => ({
  id: `${OPENAI_ID_PREFIX}${apiId}`,
  apiId,
  name,
  provider: OPENAI_PROVIDER,
  company: 'openai',
  descriptionKey,
  tier: ['paid'],
  releasedAt: RELEASED[apiId][0],
  outputPricePerMillion: RELEASED[apiId][1]
});

export const OPENAI_MODELS = Object.freeze([
  ...TEXT_ROWS.map(([apiId, name, descriptionKey]) => Object.freeze({ ...base(apiId, name, descriptionKey), category: 'general' })),
  ...IMAGE_ROWS.map(([apiId, name, descriptionKey]) => Object.freeze({
    ...base(apiId, name, descriptionKey),
    category: 'image_generation',
    outputModality: 'image',
    supportedImageAspectRatios: IMAGE_RATIOS,
    supportedImageResolutions: IMAGE_RESOLUTIONS,
    supportedImageQualities: IMAGE_QUALITIES,
    supportedImageOptions: IMAGE_OPTIONS,
    maxImageCount: 10,
    maxImageReferences: 16
  }))
]);

export const OPENAI_MODEL_IDS = Object.freeze(OPENAI_MODELS.map((model) => model.id));
export const OPENAI_TEXT_MODEL_IDS = Object.freeze(OPENAI_MODELS.filter((model) => model.outputModality !== 'image').map((model) => model.id));
export const OPENAI_IMAGE_MODEL_IDS = Object.freeze(OPENAI_MODELS.filter((model) => model.outputModality === 'image').map((model) => model.id));

/** The rows of the table of the depths of thinking of the app (`MODEL_REASONING_CONFIGS`). */
export const OPENAI_REASONING_CONFIGS = Object.freeze(Object.fromEntries(TEXT_ROWS.map(([apiId, , , options, defaultEffort]) => [
  `${OPENAI_ID_PREFIX}${apiId}`, { providerParameter: OPENAI_REASONING_PARAMETER, options: [...options], defaultEffort }
])));

export const isOpenAiModel = (model) => model?.provider === OPENAI_PROVIDER;
