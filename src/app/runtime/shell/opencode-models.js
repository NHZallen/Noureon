// The models of OpenCode Go (docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §5 and §14): one row each, with what the probe of
// 2026-10-13 and the owner's own checks found (the form of the API each model speaks, pictures, tools). The list changes at OpenCode
// (it says so in its documents), so this is written by hand; `GET /inference/go/v1/models` only tells which ones have gone or come.
//
// No settings for thinking are sent in the first version: the service refuses a field it does not know (400), each model wants its own, and
// the model's own default is used (§7, §14 have the table of what each one takes, for the choice of depth that comes later).
// Shared by the page and the server: no window, no document, no browser storage.

export const OPENCODE_GO_PROVIDER = 'opencode-go';
export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/inference/go/v1';
// `gemini` is Google's own form (`models/<id>:streamGenerateContent?alt=sse`; the probe of 2026-10-14 found the stream, the key as a Bearer, thinking summaries, PDFs and tools all work).
export const OPENCODE_FORMATS = Object.freeze(['chat', 'responses', 'messages', 'gemini']);

// The text of the price/privacy line of a model (`<key>_tier_paid` or `_tier_free` in the texts of the models).
const DESC = Object.freeze({ go: 'model_opencode_go_desc', go30: 'model_opencode_go30_desc', muse: 'model_opencode_muse_desc', free: 'model_opencode_free_desc', hidden: 'model_opencode_hidden_desc', hiddenGo: 'model_opencode_hiddengo_desc', argon: 'model_opencode_argon_desc' });

// [id at OpenCode, name, company, form of API, takes pictures, line of text, tier, hidden (a test model that is not in the list of the documents)]. Every one calls tools (the probe: a call, and the answer of the tool sent back).
const ROWS = [
  ['kimi-k3.1-pro', 'Kimi K3.1 Pro', 'moonshotai', 'chat', true, DESC.go],
  ['kimi-k3', 'Kimi K3', 'moonshotai', 'chat', true, DESC.go],
  ['kimi-k2.7-code', 'Kimi K2.7 Code', 'moonshotai', 'chat', true, DESC.go],
  ['glm-5.3', 'GLM-5.3', 'z-ai', 'chat', false, DESC.go],
  ['glm-5.3-flash', 'GLM-5.3 Flash', 'z-ai', 'chat', true, DESC.go],
  ['glm-5.2', 'GLM-5.2', 'z-ai', 'chat', false, DESC.go],
  ['deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek', 'chat', false, DESC.go],
  ['deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'deepseek', 'chat', true, DESC.go],
  ['mimo-v2.6-pro', 'MiMo V2.6 Pro', 'xiaomi', 'chat', true, DESC.go],
  ['mimo-v2.6-flash', 'MiMo V2.6 Flash', 'xiaomi', 'chat', true, DESC.go],
  ['mimo-v2.5-pro', 'MiMo V2.5 Pro', 'xiaomi', 'chat', false, DESC.go],
  ['mimo-v2.5', 'MiMo V2.5', 'xiaomi', 'chat', true, DESC.go],
  ['longcat-2.0', 'LongCat 2.0', 'meituan', 'chat', false, DESC.go],
  ['hy4-preview', 'Hy4 Preview', 'tencent', 'chat', false, DESC.go],
  ['hy3', 'Hy3', 'tencent', 'chat', false, DESC.go],
  ['longcat-2.5-preview-free', 'LongCat 2.5 Preview', 'meituan', 'chat', true, DESC.free, 'free'],
  ['step-5-preview', 'Step 5 Preview', 'stepfun', 'chat', true, DESC.go],
  // The probe of 2026-10-20 (scripts/opencode-probe.mjs, the owner ran it): the ids were guessed right. MiniMax M3.1 Flash speaks the Messages form, sees pictures, reads a PDF (and the pictures in it).
  // Beam is text only (a picture is refused: "Beam supports text input only"; a file part is refused too) and a test model (the owner, 2026-10-20): hidden, with the window the first time it is chosen,
  // like Cat Jam. Neither has a price: they are free for a time.
  ['minimax-m3.1-flash', 'MiniMax M3.1 Flash', 'minimax', 'messages', true, DESC.go],
  ['beam-free', 'Beam', 'opencode', 'chat', false, DESC.hidden, 'free', true],
  ['grok-4.7', 'Grok 4.7', 'x-ai', 'responses', true, DESC.go30],
  ['gpt-6-luna', 'GPT-6 Luna', 'openai', 'responses', true, DESC.go30],
  ['gpt-5.6-luna', 'GPT-5.6 Luna', 'openai', 'responses', true, DESC.go30],
  ['muse-spark-1.3-contributor', 'Muse Spark 1.3 Contributor', 'meta', 'responses', true, DESC.muse],
  ['muse-spark-1.2-contributor', 'Muse Spark 1.2 Contributor', 'meta', 'responses', true, DESC.muse],
  ['gemini-4-argon-contributor', 'Gemini 4 Argon Contributor', 'google', 'gemini', true, DESC.argon],
  ['claude-haiku-5-5', 'Claude Haiku 5.5', 'anthropic', 'messages', true, DESC.go30],
  ['minimax-m3', 'MiniMax M3', 'minimax', 'messages', true, DESC.go],
  ['qwen3.8-max', 'Qwen3.8 Max', 'qwen', 'messages', true, DESC.go],
  ['qwen3.8-flash', 'Qwen3.8 Flash', 'qwen', 'messages', true, DESC.go],
  ['qwen3.7-plus', 'Qwen3.7 Plus', 'qwen', 'messages', true, DESC.go]
];

// The day the models were put in the list (the order of the menu is by day, then name: no price per token is known, the limit is the one of the plan).
const ADDED_AT = 20261013;

// The list is the one OpenCode shows on its page of limits (the owner's screenshots of 2026-10-23: 29 models). A model that left it, or took another id, is still
// known by its old id: a conversation or a choice that names it goes to the model that replaces it (Space Bunny and Cat Jam had none).
const LEGACY_API_IDS = {
  'deepseek-v4.1-flash': ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'],
  'grok-4.7': ['grok-4.6'],
  'minimax-m3': ['minimax-m2.7'],
  'minimax-m3.1-flash': ['minimax-m3.1-flash-free'],
  'step-5-preview': ['step-5-preview-free']
};

export const OPENCODE_GO_MODELS = Object.freeze(ROWS.map(([apiId, name, company, format, vision, descriptionKey, tier, hidden]) => Object.freeze({
  id: `${OPENCODE_GO_PROVIDER}/${apiId}`,
  ...(LEGACY_API_IDS[apiId] ? { legacyIds: LEGACY_API_IDS[apiId].map((legacy) => `${OPENCODE_GO_PROVIDER}/${legacy}`) } : {}),
  apiId,
  // Shown by its own name, without "OpenCode" in front (the owner's choice, 2026-10-16): the picker says the provider on its own.
  name,
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
// DeepSeek V4 Flash, DeepSeek V4.1 Flash, MiMo V2.5 and Step 5 Preview answered MANGO in the first probe but not in the three that followed (the same PDF, now a 400
// "file must have a file_id or file_data", now "I can't open the file", Step 5's endpoint now and then unavailable): they are not trusted with a PDF, and a file is translated for them.
const PDF_API_IDS = new Set([
  'hy4-preview', 'hy3',
  'grok-4.7', 'gpt-6-luna', 'gpt-5.6-luna',
  'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'gemini-4-argon-contributor',
  'claude-haiku-5-5', 'minimax-m3', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus',
  // The probe of 2026-10-20: a one-page PDF answered MANGO, and the word written in a picture of a PDF answered BANANA.
  'minimax-m3.1-flash'
]);

// The models that also read a Word (.docx) and a PowerPoint (.pptx) file as they are (the probe of 2026-10-14, test `office`: both files, each with "The secret word
// is MANGO.", were sent in the form of each model's API; these answered MANGO to both). Every other model of the PDF list refused the file (400) or took it and
// did not read it, so a Word or PowerPoint file is translated for them as before. Only these two kinds were tried.
const OFFICE_API_IDS = new Set(['grok-4.7', 'gpt-6-luna', 'gpt-5.6-luna', 'gemini-4-argon-contributor']);
const OFFICE_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

export const isOpencodeModel = (model) => Boolean(model && model.provider === OPENCODE_GO_PROVIDER);

// How much a model may write in one reply, where the app has to say (the Messages form wants `max_tokens`); a model not here gets the app's own default
// (opencode-request.js). The probe of 2026-10-23 (scripts/opencode-claude-probe.mjs): Claude Haiku 5.5 takes up to 128000, and its thinking is not shown but
// counts: at the deepest depth it wrote 10739 to 47320 tokens before its first call, so 16384 ended the reply at `max_tokens` with nothing written, and 65536 did too
// in some of the requests for a deck (the probe of 2026-10-23, 276 to 285 seconds). The owner's rule (2026-10-23): only the Messages form has to say it (the other forms are
// sent none, and the service decides); a model whose limit the service names gets that limit (the test `maxout`: Claude Haiku 5.5 128000, MiniMax M3 and M3.1 Flash 524288);
// a model whose limit is not known (Qwen) gets twice the default of the app.
const MAX_OUTPUT_TOKENS = { 'claude-haiku-5-5': 128000, 'minimax-m3': 524288, 'minimax-m3.1-flash': 524288 };
export const opencodeMaxOutputTokens = (model) => (isOpencodeModel(model) ? MAX_OUTPUT_TOKENS[BY_ID.get(model.id)?.apiId] || null : null);
/** The form of API of a model of OpenCode (`chat`, `responses` or `messages`), from this list and not from what the page says; '' for any other model. */
export const opencodeFormatOf = (model) => (isOpencodeModel(model) ? BY_ID.get(model.id)?.opencodeFormat || '' : '');
export const opencodeModelReadsPdf = (model) => isOpencodeModel(model) && PDF_API_IDS.has(BY_ID.get(model.id)?.apiId);
// The models whose Word and PowerPoint files are turned into a PDF first (the server does it, docs/superpowers/specs/2026-10-14-office-to-pdf-design.md): they read a PDF, and
// they also look at the pictures in it (the probe of 2026-10-14, test `pdfimage`: a word written in a picture of the PDF was read). Hy4 Preview, MiniMax M2.7 and Qwen3.7 Plus
// did not (or not reliably), so their files are read by the app (the text and the pictures) instead.
// MiniMax M3.1 Flash (2026-10-20) reads the PDF and the picture in it, and did not read a Word or PowerPoint file as it is ("Unreadable"); the test `converted` was not run for it.
const OFFICE_VIA_PDF_API_IDS = new Set(['hy3', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'claude-haiku-5-5', 'minimax-m3', 'minimax-m3.1-flash', 'qwen3.8-max', 'qwen3.8-flash']);
export const opencodeModelReadsOfficeViaPdf = (model, mimeType) => isOpencodeModel(model) && OFFICE_MIME_TYPES.has(mimeType) && OFFICE_VIA_PDF_API_IDS.has(BY_ID.get(model.id)?.apiId);

/** True when the model reads a file of this type as it is: a PDF (the list above), or a Word or PowerPoint file (the shorter list). */
export const opencodeModelReadsFile = (model, mimeType) => {
  if (!isOpencodeModel(model)) return false;
  if (mimeType === 'application/pdf') return PDF_API_IDS.has(BY_ID.get(model.id)?.apiId);
  return OFFICE_MIME_TYPES.has(mimeType) && OFFICE_API_IDS.has(BY_ID.get(model.id)?.apiId);
};
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
  'kimi-k3.1-pro': ['effort', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'high'],
  'kimi-k3': ['effort', ['none', 'low', 'medium', 'high', 'max'], 'high'],
  'kimi-k2.7-code': ['effort', ['low', 'medium', 'high', 'max'], 'high'],
  'glm-5.3': ['effort', ['low', 'high', 'max'], 'high'],
  'glm-5.2': ['effort', ['low', 'high', 'max'], 'high'],
  'deepseek-v4-pro': ['effort', ['none', 'low', 'high', 'max'], 'high'],
  'deepseek-v4.1-flash': ['effort', ['none', 'low', 'high', 'max'], 'high'],
  'mimo-v2.6-pro': ['effort', ['none', 'high'], 'high'],
  'mimo-v2.6-flash': ['effort', ['none', 'high'], 'high'],
  'mimo-v2.5-pro': ['effort', ['none', 'high'], 'high'],
  'mimo-v2.5': ['effort', ['none', 'high'], 'high'],
  'hy4-preview': ['effort', ['low', 'medium', 'high', 'max'], 'high'],
  'hy3': ['effort', ['none', 'high'], 'high'],
  'step-5-preview': ['effort', ['low', 'medium', 'high', 'max'], 'high'],
  'longcat-2.0': ['toggle', ['none', 'high'], 'high'],
  'longcat-2.5-preview-free': ['toggle', ['none', 'high'], 'high'],
  'grok-4.7': ['responses', ['low', 'medium', 'high', 'xhigh'], 'high'],
  'gpt-6-luna': ['responses', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'gpt-5.6-luna': ['responses', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'muse-spark-1.3-contributor': ['responses', ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'muse-spark-1.2-contributor': ['responses', ['minimal', 'low', 'medium', 'high', 'xhigh'], 'medium'],
  // Google's form (the probe of 2026-10-14): low, medium and high are taken, minimal is refused (400), the thinking cannot be turned off (a budget of 0 or 1024 changes nothing).
  'gemini-4-argon-contributor': ['gemini', ['low', 'medium', 'high'], 'medium'],
  'claude-haiku-5-5': ['adaptive', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  'minimax-m3': ['toggle', ['none', 'high'], 'high'],
  // The probe of 2026-10-20: the thinking cannot be turned off ("requires adaptive thinking; disabled is not allowed"); low to max are taken, as for Claude Haiku.
  'minimax-m3.1-flash': ['adaptive', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
  // The probe of 2026-10-20: it always thinks (`reasoning_content`); `none` and `minimal` are refused (400), low to max are taken; `thinking` and `enable_thinking` are unknown to it.
  'beam-free': ['effort', ['low', 'medium', 'high', 'xhigh', 'max'], 'high'],
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

// The models that give the text of their thinking only when asked: Claude Haiku 5.5 sends none at all unless `thinking.display` is `summarized` (the probe of
// 2026-10-23: 0 characters of thinking without it, 648 to 2079 with it; the service takes the field, and a model that does not know it would be refused with a 400,
// so it is sent only to the models listed here, each one probed).
// MiniMax M3 is the same (the probe of 2026-10-23, test `shown`: no thinking text by default, 166 characters with it). The GPT Luna and Muse Spark models of the Responses form give no
// summary unless `reasoning.summary` is `auto` (0 characters by default, 81 to 350 with it); Grok gives it by default, and the models of the chat form give their thinking by default.
const SUMMARIZED_THINKING_API_IDS = new Set(['claude-haiku-5-5', 'minimax-m3']);
const SUMMARY_AUTO_API_IDS = new Set(['gpt-6-luna', 'gpt-5.6-luna', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor']);
const apiIdOf = (model) => BY_ID.get(model?.id)?.apiId;

/** What asks for the summary of the thinking when no depth of thinking is asked for (the model is then sent nothing else): nothing for a model that gives it by default. */
export function opencodeSummaryFields(model) {
  if (!isOpencodeModel(model)) return {};
  const apiId = apiIdOf(model);
  if (SUMMARIZED_THINKING_API_IDS.has(apiId)) return { thinking: { type: 'adaptive', display: 'summarized' } };
  if (SUMMARY_AUTO_API_IDS.has(apiId)) return { reasoning: { summary: 'auto' } };
  return {};
}

/** The fields to put in the request to say how deep the model is to think (an empty object: nothing, the model's own way). */
export function opencodeThinkingFields(model, effort) {
  const row = isOpencodeModel(model) ? THINKING_BY_ID.get(model.id) : null;
  if (!row || !row.options.includes(effort)) return {};
  switch (row.style) {
    case 'effort': return { reasoning_effort: effort };
    case 'toggle': return effort === 'none' ? { thinking: { type: 'disabled' } } : SUMMARIZED_THINKING_API_IDS.has(apiIdOf(model)) ? { thinking: { type: 'adaptive', display: 'summarized' } } : {};
    case 'responses': return { reasoning: { effort, ...(SUMMARY_AUTO_API_IDS.has(apiIdOf(model)) && effort !== 'none' ? { summary: 'auto' } : {}) } };
    case 'gemini': return { generationConfig: { thinkingConfig: { thinkingLevel: effort } } };
    case 'adaptive': return { thinking: { type: 'adaptive', ...(SUMMARIZED_THINKING_API_IDS.has(apiIdOf(model)) ? { display: 'summarized' } : {}) }, output_config: { effort } };
    case 'adaptiveOrOff': return effort === 'none' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'adaptive' }, output_config: { effort } };
    default: return {};
  }
}
