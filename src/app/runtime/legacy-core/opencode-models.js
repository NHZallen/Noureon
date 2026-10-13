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
const DESC = Object.freeze({ go: 'model_opencode_go_desc', go30: 'model_opencode_go30_desc', muse: 'model_opencode_muse_desc', free: 'model_opencode_free_desc' });

// [id at OpenCode, name, company, form of API, takes pictures, line of text]. Every one calls tools (the probe: a call, and the answer of the tool sent back).
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
  ['space-bunny', 'Space Bunny', 'opencode', 'chat', true, DESC.go],
  ['longcat-2.5-preview-free', 'LongCat 2.5 Preview', 'meituan', 'chat', true, DESC.free, 'free'],
  ['step-5-preview-free', 'Step 5 Preview', 'stepfun', 'chat', true, DESC.free, 'free'],
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

export const OPENCODE_GO_MODELS = Object.freeze(ROWS.map(([apiId, name, company, format, vision, descriptionKey, tier]) => Object.freeze({
  id: `${OPENCODE_GO_PROVIDER}/${apiId}`,
  apiId,
  name: `OpenCode ${name}`,
  provider: OPENCODE_GO_PROVIDER,
  company,
  descriptionKey,
  category: 'general',
  ...(tier ? { tier: [tier] } : {}),
  opencodeFormat: format,
  opencodeVision: vision,
  releasedAt: ADDED_AT,
  outputPricePerMillion: 0
})));

export const OPENCODE_GO_MODEL_IDS = Object.freeze(OPENCODE_GO_MODELS.map((model) => model.id));
const BY_ID = new Map(OPENCODE_GO_MODELS.map((model) => [model.id, model]));
const VISION_IDS = new Set(OPENCODE_GO_MODELS.filter((model) => model.opencodeVision).map((model) => model.id));

export const isOpencodeModel = (model) => Boolean(model && model.provider === OPENCODE_GO_PROVIDER);
/** The form of API of a model of OpenCode (`chat`, `responses` or `messages`), from this list and not from what the page says; '' for any other model. */
export const opencodeFormatOf = (model) => (isOpencodeModel(model) ? BY_ID.get(model.id)?.opencodeFormat || '' : '');
export const opencodeModelSupportsVision = (model) => isOpencodeModel(model) && VISION_IDS.has(model.id);
