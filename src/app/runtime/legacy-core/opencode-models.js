// The models of OpenCode Go (docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §5 and §14): one row each, with what the probe of
// 2026-10-13 and the owner's own checks found (the form of the API each model speaks, pictures, tools). The list changes at OpenCode
// (it says so in its documents), so this is written by hand; `GET /inference/go/v1/models` only tells which ones have gone or come.
//
// No settings for thinking are sent in the first version: the service refuses a field it does not know (400), each model wants its own, and
// the model's own default is used (§7, §14 have the table of what each one takes, for the choice of depth that comes later).
// Shared by the page and the server: no window, no document, no browser storage.

export const OPENCODE_GO_PROVIDER = 'opencode-go';
export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/inference/go/v1';
export const OPENCODE_FORMATS = Object.freeze(['chat', 'responses', 'messages']);

// The text of the price/privacy line of a model (`<key>_tier_paid` or `_tier_free` in the texts of the models).
const DESC = Object.freeze({ go: 'model_opencode_go_desc', go30: 'model_opencode_go30_desc', muse: 'model_opencode_muse_desc', free: 'model_opencode_free_desc', hidden: 'model_opencode_hidden_desc', hiddenGo: 'model_opencode_hiddengo_desc' });

// [id at OpenCode, name, company, form of API, takes pictures, line of text, tier, hidden (a test model that is not in the list of the documents)]. Every one calls tools (the probe: a call, and the answer of the tool sent back).
const ROWS = [
  ['kimi-k3', 'Kimi K3', 'moonshotai', 'chat', true, DESC.go],
  ['kimi-k2.7-code', 'Kimi K2.7 Code', 'moonshotai', 'chat', true, DESC.go],
  ['glm-5.3', 'GLM-5.3', 'z-ai', 'chat', false, DESC.go],
  ['glm-5.3-flash', 'GLM-5.3 Flash', 'z-ai', 'chat', true, DESC.go],
  ['glm-5.2', 'GLM-5.2', 'z-ai', 'chat', false, DESC.go],
  ['deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek', 'chat', false, DESC.go],
  ['deepseek-v4-flash', 'DeepSeek V4 Flash', 'deepseek', 'chat', false, DESC.go],
  ['deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'deepseek', 'chat', true, DESC.go],
  ['deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision Exp', 'deepseek', 'chat', true, DESC.go],
  ['mimo-v2.6-pro', 'MiMo V2.6 Pro', 'xiaomi', 'chat', true, DESC.go],
  ['mimo-v2.6-flash', 'MiMo V2.6 Flash', 'xiaomi', 'chat', true, DESC.go],
  ['mimo-v2.5-pro', 'MiMo V2.5 Pro', 'xiaomi', 'chat', false, DESC.go],
  ['mimo-v2.5', 'MiMo V2.5', 'xiaomi', 'chat', true, DESC.go],
  ['longcat-2.0', 'LongCat 2.0', 'meituan', 'chat', false, DESC.go],
  ['hy4-preview', 'Hy4 Preview', 'tencent', 'chat', false, DESC.go],
  ['hy3', 'Hy3', 'tencent', 'chat', false, DESC.go],
  ['space-bunny', 'Space Bunny', 'opencode', 'chat', true, DESC.hiddenGo, null, true],
  ['longcat-2.5-preview-free', 'LongCat 2.5 Preview', 'meituan', 'chat', true, DESC.free, 'free'],
  ['step-5-preview-free', 'Step 5 Preview', 'stepfun', 'chat', true, DESC.free, 'free'],
  ['cat-jam-free', 'Cat Jam', 'opencode', 'chat', false, DESC.hidden, 'free', true],
  ['grok-4.7', 'Grok 4.7', 'x-ai', 'responses', true, DESC.go30],
  ['grok-4.6', 'Grok 4.6', 'x-ai', 'responses', true, DESC.go30],
  ['gpt-6-luna', 'GPT-6 Luna', 'openai', 'responses', true, DESC.go30],
  ['gpt-5.6-luna', 'GPT-5.6 Luna', 'openai', 'responses', true, DESC.go30],
  ['muse-spark-1.3-contributor', 'Muse Spark 1.3 Contributor', 'meta', 'responses', true, DESC.muse],
  ['muse-spark-1.2-contributor', 'Muse Spark 1.2 Contributor', 'meta', 'responses', true, DESC.muse],
  ['claude-haiku-5-5', 'Claude Haiku 5.5', 'anthropic', 'messages', true, DESC.go30],
  ['minimax-m3', 'MiniMax M3', 'minimax', 'messages', true, DESC.go],
  ['minimax-m2.7', 'MiniMax M2.7', 'minimax', 'messages', false, DESC.go],
  ['qwen3.8-max', 'Qwen3.8 Max', 'qwen', 'messages', true, DESC.go],
  ['qwen3.8-flash', 'Qwen3.8 Flash', 'qwen', 'messages', true, DESC.go],
  ['qwen3.7-plus', 'Qwen3.7 Plus', 'qwen', 'messages', true, DESC.go]
];

// The day the models were put in the list (the order of the menu is by day, then name: no price per token is known, the limit is the one of the plan).
const ADDED_AT = 20261013;

export const OPENCODE_GO_MODELS = Object.freeze(ROWS.map(([apiId, name, company, format, vision, descriptionKey, tier, hidden]) => Object.freeze({
  id: `${OPENCODE_GO_PROVIDER}/${apiId}`,
  apiId,
  name: `OpenCode ${name}`,
  provider: OPENCODE_GO_PROVIDER,
  company,
  descriptionKey,
  category: 'general',
  ...(tier ? { tier: [tier] } : {}),
  // A hidden (test) model: the first time it is chosen, a window says what that means (the same window the stealth models of OpenRouter have).
  ...(hidden ? { hiddenModel: true, requiresStealthTermsAcknowledgement: true } : {}),
  opencodeFormat: format,
  opencodeVision: vision,
  releasedAt: ADDED_AT,
  outputPricePerMillion: 0
})));

export const OPENCODE_GO_MODEL_IDS = Object.freeze(OPENCODE_GO_MODELS.map((model) => model.id));
// A model is known by its id in the app (`opencode-go/kimi-k3`) and by its id at OpenCode (`kimi-k3`): a council on the server names its members by
// the second one.
const BY_ID = new Map(OPENCODE_GO_MODELS.flatMap((model) => [[model.id, model], [model.apiId, model]]));
const VISION_IDS = new Set(OPENCODE_GO_MODELS.filter((model) => model.opencodeVision).flatMap((model) => [model.id, model.apiId]));

// The models that read a PDF sent to them as it is, with no other model to translate it first (the probe of 2026-10-14, test `document`: a one-page PDF
// with "The secret word is MANGO." was sent in the form of each model's API and the answer was MANGO). The others refused the file (400) or took it and
// did not read it (DeepSeek V4 Pro answered "Unknown", Space Bunny asked for the document); LongCat 2.0 was unavailable. Only PDFs were tried.
const PDF_API_IDS = new Set([
  'deepseek-v4.1-flash', 'deepseek-v4-flash', 'mimo-v2.5', 'hy4-preview', 'hy3', 'step-5-preview-free',
  'grok-4.7', 'grok-4.6', 'gpt-6-luna', 'gpt-5.6-luna',
  'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor',
  'claude-haiku-5-5', 'minimax-m3', 'minimax-m2.7', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'
]);

export const isOpencodeModel = (model) => Boolean(model && model.provider === OPENCODE_GO_PROVIDER);
/** The form of API of a model of OpenCode (`chat`, `responses` or `messages`), from this list and not from what the page says; '' for any other model. */
export const opencodeFormatOf = (model) => (isOpencodeModel(model) ? BY_ID.get(model.id)?.opencodeFormat || '' : '');
export const opencodeModelReadsPdf = (model) => isOpencodeModel(model) && PDF_API_IDS.has(BY_ID.get(model.id)?.apiId);
export const opencodeModelSupportsVision = (model) => isOpencodeModel(model) && VISION_IDS.has(model.id);

// The depth of thinking each model takes (the probe of 2026-10-13, §14 of the design: each depth tried alone). A model gives its thinking only in the
// way that is its own, and the service refuses a field it does not know, so each style names the fields it sends:
//   effort    chat: `reasoning_effort: <depth>`                                (none turns the thinking off where the model allows it)
//   toggle    chat or messages: nothing, or `thinking: { type: 'disabled' }`   (the models that have no depths but can be told not to think)
//   responses `reasoning: { effort: <depth> }`
//   adaptive  messages: `thinking: { type: 'adaptive' }` and `output_config: { effort: <depth> }` (Claude Haiku)
//   adaptiveOrOff  the same, and `thinking: { type: 'disabled' }` for none (Qwen)
// A model that is not here (GLM-5.3 Flash and Space Bunny act at random, LongCat's depths change nothing, MiniMax M2.7 cannot stop) is asked with no setting.
const THINKING = {
  'kimi-k3': ['effort', ['none', 'low', 'medium', 'high', 'max'], 'high'],
  'kimi-k2.7-code': ['effort', ['low', 'medium', 'high', 'max'], 'high'],
  'glm-5.3': ['effort', ['low', 'high', 'max'], 'high'],
  'glm-5.2': ['effort', ['low', 'high', 'max'], 'high'],
  'deepseek-v4-pro': ['effort', ['none', 'low', 'high', 'max'], 'high'],
  'deepseek-v4-flash': ['effort', ['none', 'low', 'high', 'max'], 'high'],
  'deepseek-v4.1-flash': ['effort', ['none', 'low', 'high', 'max'], 'high'],
  'deepseek-v4-flash-vision-exp': ['effort', ['none', 'low', 'high', 'max'], 'high'],
  'mimo-v2.6-pro': ['effort', ['none', 'high'], 'high'],
  'mimo-v2.6-flash': ['effort', ['none', 'high'], 'high'],
  'mimo-v2.5-pro': ['effort', ['none', 'high'], 'high'],
  'mimo-v2.5': ['effort', ['none', 'high'], 'high'],
  'hy4-preview': ['effort', ['low', 'medium', 'high', 'max'], 'high'],
  'hy3': ['effort', ['none', 'high'], 'high'],
  'step-5-preview-free': ['effort', ['low', 'medium', 'high', 'max'], 'high'],
  'cat-jam-free': ['effort', ['low', 'medium', 'high', 'xhigh', 'max'], 'high'],
  'longcat-2.0': ['toggle', ['none', 'high'], 'high'],
  'longcat-2.5-preview-free': ['toggle', ['none', 'high'], 'high'],
  'grok-4.7': ['responses', ['low', 'medium', 'high', 'xhigh'], 'high'],
  'grok-4.6': ['responses', ['low', 'medium', 'high', 'xhigh'], 'high'],
  'gpt-6-luna': ['responses', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'gpt-5.6-luna': ['responses', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'muse-spark-1.3-contributor': ['responses', ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'muse-spark-1.2-contributor': ['responses', ['minimal', 'low', 'medium', 'high', 'xhigh'], 'medium'],
  'claude-haiku-5-5': ['adaptive', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'minimax-m3': ['toggle', ['none', 'high'], 'high'],
  'qwen3.8-max': ['adaptiveOrOff', ['none', 'low', 'medium', 'high', 'xhigh'], 'high'],
  'qwen3.8-flash': ['adaptiveOrOff', ['none', 'low', 'medium', 'high', 'xhigh'], 'high'],
  'qwen3.7-plus': ['toggle', ['none', 'high'], 'high']
};
const THINKING_BY_ID = new Map(Object.entries(THINKING).flatMap(([apiId, [style, options, defaultEffort]]) => {
  const row = { style, options: Object.freeze([...options]), defaultEffort };
  return [[`${OPENCODE_GO_PROVIDER}/${apiId}`, row], [apiId, row]];
}));

/** The rows of the table of the depths of thinking of the app (`MODEL_REASONING_CONFIGS`): the models that have a choice, by id in the app. */
export const OPENCODE_REASONING_CONFIGS = Object.freeze(Object.fromEntries(Object.keys(THINKING).map((apiId) => {
  const row = THINKING_BY_ID.get(apiId);
  return [`${OPENCODE_GO_PROVIDER}/${apiId}`, { providerParameter: 'opencodeThinking', options: [...row.options], defaultEffort: row.defaultEffort }];
})));

/** The fields to put in the request to say how deep the model is to think (an empty object: nothing, the model's own way). */
export function opencodeThinkingFields(model, effort) {
  const row = isOpencodeModel(model) ? THINKING_BY_ID.get(model.id) : null;
  if (!row || !row.options.includes(effort)) return {};
  switch (row.style) {
    case 'effort': return { reasoning_effort: effort };
    case 'toggle': return effort === 'none' ? { thinking: { type: 'disabled' } } : {};
    case 'responses': return { reasoning: { effort } };
    case 'adaptive': return { thinking: { type: 'adaptive' }, output_config: { effort } };
    case 'adaptiveOrOff': return effort === 'none' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'adaptive' }, output_config: { effort } };
    default: return {};
  }
}
