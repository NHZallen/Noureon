import { appendStepPlanAttachmentContent } from './model-request-formatting.js';
import { formatMemoryContextForModel } from '../../runtime/memory/memory-context-builder.js';
const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/step_plan/v1/chat/completions';

const LANGUAGE_INSTRUCTIONS = {
  'zh-TW': '請用繁體中文回覆，除非使用者有特別要求。',
  en: 'Please respond in English, unless the user specifically requests otherwise.',
  fr: 'Veuillez répondre en français, sauf si l\'utilisateur demande spécifiquement le contraire.',
  ru: 'Отвечайте на русском языке, если пользователь явно не попросит иначе.',
  es: 'Responde en español, salvo que el usuario solicite expresamente otro idioma.'
};


const cleanGeminiHistory = (history, targetModel, modelSupportsUploadedFile) => {
  const cleaned = [];
  let lastRole = null;

  history.forEach((message) => {
    const sanitizedParts = message.parts.map((part) => {
      if (part.inlineData) {
        if (targetModel && !modelSupportsUploadedFile(targetModel, { inlineData: part.inlineData })) {
          return null;
        }
        return {
          inlineData: {
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data
          }
        };
      }
      if (part.text) {
        return { text: part.text };
      }
      return null;
    }).filter(Boolean);

    const sanitizedMessage = { role: message.role, parts: sanitizedParts };
    if (
      sanitizedMessage.role === 'model' &&
      !sanitizedMessage.parts.some((part) => (part.text && part.text.trim() !== '') || part.inlineData)
    ) {
      return;
    }

    if (sanitizedMessage.role === lastRole && lastRole === 'user') {
      cleaned[cleaned.length - 1].parts.push(...sanitizedMessage.parts);
    } else {
      cleaned.push(sanitizedMessage);
      lastRole = sanitizedMessage.role;
    }
  });

  if (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
};

const appendInstructionText = (systemInstruction, text) => {
  if (!text) return systemInstruction;
  if (systemInstruction?.parts?.[0]?.text) {
    systemInstruction.parts[0].text += `\n\n${text}`;
    return systemInstruction;
  }
  if (systemInstruction) {
    systemInstruction.parts.push({ text });
    return systemInstruction;
  }
  return { parts: [{ text }] };
};

const getMessageTextForGuidance = (message) => (
  (message?.parts || [])
    .filter((part) => part?.text)
    .map((part) => part.text)
    .join('\n')
);

const mayNeedChartGuidance = (text) => (
  /圖表|統計圖|視覺化|趨勢|比較|分布|占比|比例|漏斗|排程|時程|儀表|折線圖|長條圖|柱狀圖|面積圖|散點圖|散佈圖|氣泡圖|環圈圖|甜甜圈圖|圓餅圖|餅圖|直方圖|熱力圖|樹狀圖|雷達圖|瀑布圖|桑基圖|箱型圖|盒鬚圖|甘特圖|用圖呈現|畫成圖|幫我分析這組數據|\b(?:chart|visuali[sz]e|trend|compare|comparison|distribution|percentage|share|schedule|timeline|funnel|KPI|gauge|stacked\s*bar|box\s*plot|boxplot|histogram|waterfall|heat\s*map|heatmap|treemap|scatter|bubble|donut|doughnut|pie|radar|sankey|gantt|area\s*chart|line\s*chart|bar\s*chart)\b/i.test(text) ||
  /\|[^\n]*\|[^\n]*\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?/m.test(text) ||
  /(?:\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|(?:\d{1,2}|[一二三四五六七八九十]+)月)[^\n\d-]{0,16}[-+]?\d[\d,]*(?:\.\d+)?/u.test(text) ||
  text.split(/\r?\n/).filter((line) => /^[-*]?\s*[\p{L}\p{N}\s./年月日-]{1,40}[:：,\t ]+[-+]?\d[\d,]*(?:\.\d+)?\s*%?$/u.test(line.trim())).length >= 2
);

const getRuntimeChartAuthoringGuidance = async (inputText) => {
  if (!mayNeedChartGuidance(String(inputText || ''))) return '';
  const { getChartAuthoringGuidance } = await import('../../ui/charts/chart-selection-policy.js');
  return getChartAuthoringGuidance(inputText);
};

// Loaded on demand so the learning mode prose stays out of the main runtime chunk.
const getRuntimeLearningModeInstruction = async (config, includePrecedence) => {
  if (!config.isLearningMode) return '';
  const { buildLearningModeInstruction } = await import('./learning-mode-prompt.js');
  return buildLearningModeInstruction(config.uiLanguage, includePrecedence);
};

const buildSystemInstruction = async ({
  config,
  conversation,
  astras,
  personalMemories,
  memoryContext,
  additionalSystemInstruction,
  chartAuthoringGuidance
}) => {
  let baseInstructionText = LANGUAGE_INSTRUCTIONS[config.aiDefaultLanguage] || '';
  let hasAstraInstructions = false;

  if (conversation?.astrasId) {
    const astra = astras.find((item) => item.id === conversation.astrasId);
    if (astra) {
      baseInstructionText = `${astra.instructions}\n\n${baseInstructionText}`;
      hasAstraInstructions = true;
    }
  }

  // Learning mode adds its teaching rules on top of the Noura instead of replacing them.
  // The precedence clause is only meaningful when a Noura is actually in play.
  let systemInstruction = baseInstructionText ? { parts: [{ text: baseInstructionText }] } : null;
  systemInstruction = appendInstructionText(
    systemInstruction,
    await getRuntimeLearningModeInstruction(config, hasAstraInstructions)
  );

  if (config.memorySystemVersion === 2 && memoryContext) {
    systemInstruction = appendInstructionText(
      systemInstruction,
      formatMemoryContextForModel(memoryContext)
    );
  } else if (config.memoryEnabled1) {
    const enabledMemories = personalMemories
      .filter((memory) => memory.enabled)
      .map((memory) => memory.content)
      .join('\n');
    if (enabledMemories) {
      systemInstruction = appendInstructionText(
        systemInstruction,
        `個人習慣記憶：\n${enabledMemories}\n`
      );
    }
  }

  systemInstruction = appendInstructionText(
    systemInstruction,
    chartAuthoringGuidance
  );
  return appendInstructionText(systemInstruction, additionalSystemInstruction);
};

const buildGeminiRequest = ({
  modelId,
  apiKey,
  modelInfo,
  historyForApi,
  currentMessageForApi,
  generationConfig,
  reasoningEffort,
  reasoningConfig,
  systemInstruction,
  conversation,
  isWebSearchForced,
  requestOptions,
  modelSupportsUploadedFile
}) => {
  const supportsSamplingParameters = ![
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite'
  ].includes(modelId);
  const payload = {
    contents: cleanGeminiHistory(
      [...historyForApi, currentMessageForApi],
      modelInfo,
      modelSupportsUploadedFile
    ),
    generationConfig: {
      ...(supportsSamplingParameters && generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
      ...(supportsSamplingParameters && generationConfig.topP !== null && { topP: generationConfig.topP }),
      ...(generationConfig.maxTokens !== null && { maxOutputTokens: generationConfig.maxTokens })
    }
  };
  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }
  if (reasoningConfig?.providerParameter === 'geminiThinkingLevel' && reasoningEffort) {
    payload.generationConfig.thinkingConfig = {
      ...(payload.generationConfig.thinkingConfig || {}),
      thinkingLevel: reasoningEffort
    };
  }
  const shouldUseWebSearch = !requestOptions.ignoreConversationWebSearch
    && (requestOptions.webSearchEnabled === true || conversation.isWebSearchEnabled);
  if (shouldUseWebSearch || isWebSearchForced || requestOptions.forceWebSearch) {
    payload.tools = [{ googleSearch: {} }];
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`,
    payload,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    isStepPlanDirectVideoRequest: false
  };
};

const buildOpenAiCompatibleMessages = ({
  provider,
  modelInfo,
  historyForApi,
  currentMessageForApi,
  systemInstruction,
  modelSupportsVision
}) => {
  const messages = [];
  if (systemInstruction) {
    messages.push({
      role: 'system',
      content: systemInstruction.parts.map((part) => part.text).join('\n')
    });
  }

  for (const message of [...historyForApi, currentMessageForApi]) {
    const role = message.role === 'model' ? 'assistant' : message.role;
    const content = [];
    for (const part of message.parts) {
      if (part.text) {
        content.push({ type: 'text', text: part.text });
        continue;
      }
      if (!part.inlineData) continue;
      const mimeType = part.inlineData.mimeType || '';
      const base64Data = part.inlineData.data;
      const fullDataUrl = `data:${mimeType};base64,${base64Data}`;
      if (provider === 'stepfun') {
        appendStepPlanAttachmentContent(
          content,
          part.inlineData,
          modelInfo,
          { modelSupportsVision }
        );
      } else if (
        (mimeType.startsWith('image/') || mimeType.startsWith('video/')) &&
        modelSupportsVision(modelInfo)
      ) {
        content.push(
          mimeType.startsWith('video/')
            ? { type: 'video_url', video_url: { url: fullDataUrl } }
            : { type: 'image_url', image_url: { url: fullDataUrl, detail: 'high' } }
        );
      } else {
        content.push({
          type: 'text',
          text: `[Attachment omitted for ${modelInfo.name}: ${part.inlineData.name || mimeType || 'file'}]`
        });
      }
    }
    const textOnly = content.length === 1 && content[0].type === 'text'
      ? content[0].text
      : content;
    if (
      (Array.isArray(textOnly) && textOnly.length > 0) ||
      (typeof textOnly === 'string' && textOnly.trim())
    ) {
      messages.push({ role, content: textOnly });
    }
  }
  return messages;
};

const buildOpenAiCompatibleRequest = ({
  provider,
  modelId,
  apiKey,
  modelInfo,
  historyForApi,
  currentMessageForApi,
  generationConfig,
  reasoningEffort,
  reasoningConfig,
  disableReasoning = false,
  systemInstruction,
  modelSupportsVision
}) => {
  const messages = buildOpenAiCompatibleMessages({
    provider,
    modelInfo,
    historyForApi,
    currentMessageForApi,
    systemInstruction,
    modelSupportsVision
  });
  const hasStepPlanVideo = provider === 'stepfun' && messages.some((message) =>
    Array.isArray(message.content) &&
    message.content.some((part) => part?.type === 'video_url')
  );
  const payload = {
    model: modelId,
    messages,
    stream: !hasStepPlanVideo,
    ...(generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
    ...(generationConfig.topP !== null && { top_p: generationConfig.topP }),
    ...(generationConfig.maxTokens !== null && { max_tokens: generationConfig.maxTokens })
  };
  const stepfunReasoningEffort = disableReasoning
    ? null
    : (reasoningConfig?.providerParameter === 'stepfunReasoningEffort'
      ? reasoningEffort
      : modelInfo.reasoningEffort);
  if (provider === 'stepfun' && stepfunReasoningEffort) {
    payload.reasoning_effort = stepfunReasoningEffort;
  }
  return {
    url: hasStepPlanVideo
      ? STEP_PLAN_CHAT_COMPLETIONS_URL
      : (provider === 'stepfun' ? '/api/step-plan-chat' : '/api/nvidia-chat'),
    payload,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(hasStepPlanVideo && { Accept: 'application/json' })
    },
    isStepPlanDirectVideoRequest: hasStepPlanVideo
  };
};

const buildOpenRouterRequest = ({
  modelId,
  apiKey,
  historyForApi,
  currentMessageForApi,
  generationConfig,
  reasoningEffort,
  reasoningConfig,
  systemInstruction
}) => {
  const messages = [];
  if (systemInstruction) {
    messages.push({
      role: 'system',
      content: systemInstruction.parts.map((part) => part.text).join('\n')
    });
  }

  let hasOpenRouterFileAttachment = false;
  [...historyForApi, currentMessageForApi].forEach((message) => {
    const role = message.role === 'model' ? 'assistant' : message.role;
    const hasAttachment = message.parts.some((part) => part.inlineData);
    if (hasAttachment) {
      const content = message.parts.map((part) => {
        if (part.text) {
          return { type: 'text', text: part.text };
        }
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType;
          const fullDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
          if (mimeType.startsWith('image/')) {
            return { type: 'image_url', image_url: { url: fullDataUrl } };
          }
          hasOpenRouterFileAttachment = true;
          return {
            type: 'file',
            file: {
              filename: part.inlineData.name || 'document.pdf',
              file_data: fullDataUrl
            }
          };
        }
        return null;
      }).filter(Boolean);
      messages.push({ role, content });
      return;
    }
    const content = message.parts
      .filter((part) => part.text)
      .map((part) => part.text)
      .join('\n');
    if (content) {
      messages.push({ role, content });
    }
  });

  const payload = {
    model: modelId,
    messages,
    stream: true,
    ...(generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
    ...(generationConfig.topP !== null && { top_p: generationConfig.topP }),
    ...(generationConfig.maxTokens !== null && { max_tokens: generationConfig.maxTokens })
  };
  if (hasOpenRouterFileAttachment) {
    payload.plugins = [{
      id: 'file-parser',
      pdf: { engine: 'mistral-ocr' }
    }];
  }
  if (reasoningConfig?.providerParameter === 'openrouterReasoningEffort' && reasoningEffort) {
    payload.reasoning = { effort: reasoningEffort };
  }
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    payload,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    isStepPlanDirectVideoRequest: false
  };
};

const readProviderErrorBody = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || response.statusText } };
  }
};

const getProviderErrorMessage = (errorBody, fallback = 'API 請求失敗') => (
  errorBody?.error?.message ||
  errorBody?.message ||
  fallback
);

const findCompleteJsonObjectEnd = (source, startIndex) => {
  let braceCount = 0;
  let isInString = false;
  let isEscaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (isInString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === '\\') {
        isEscaped = true;
      } else if (character === '"') {
        isInString = false;
      }
      continue;
    }

    if (character === '"') {
      isInString = true;
    } else if (character === '{') {
      braceCount += 1;
    } else if (character === '}') {
      braceCount -= 1;
      if (braceCount === 0) return index;
    }
  }

  return -1;
};

const consumeGeminiStream = async ({ reader, decoder, onChunk, warn }) => {
  let buffer = '';
  let fullText = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const firstBrace = buffer.indexOf('{');
      if (firstBrace === -1) break;

      const endIndex = findCompleteJsonObjectEnd(buffer, firstBrace);
      if (endIndex === -1) break;

      const jsonString = buffer.substring(firstBrace, endIndex + 1);
      buffer = buffer.substring(endIndex + 1);
      try {
        const parsed = JSON.parse(jsonString);
        const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textChunk) {
          fullText += textChunk;
          onChunk(textChunk);
        }
      } catch (error) {
        warn('解析 Gemini 串流中的 JSON 區塊時出錯:', error, '區塊內容:', jsonString);
      }
    }
  }
  return fullText;
};

const consumeOpenAiCompatibleStream = async ({ reader, decoder, onChunk }) => {
  let buffer = '';
  let fullText = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.substring(6);
      if (data.trim() === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        const textChunk = parsed.choices[0]?.delta?.content || '';
        if (textChunk) {
          fullText += textChunk;
          onChunk(textChunk);
        }
      } catch {
        // Preserve the legacy silent-ignore behavior for malformed SSE data.
      }
    }
  }
  return fullText;
};

export function createStreamApiCall({
  getActiveConversation,
  normalizeConversationModel,
  getModelApiId,
  getApiKeyForProvider,
  getDefaultGenConfig,
  getConfig,
  getAstras,
  getPersonalMemories,
  getMemoryContext = () => null,
  modelSupportsUploadedFile,
  modelSupportsVision,
  getModelReasoningConfig = () => null,
  normalizeReasoningEffort = () => null,
  fetchImpl = fetch,
  TextDecoderImpl = TextDecoder,
  warn = (...args) => console.warn(...args)
}) {
  return async function streamApiCall(
    parts,
    onChunk,
    signal,
    isWebSearchForced = false,
    requestOptions = {}
  ) {
    const activeConversation = getActiveConversation();
    const conversation = requestOptions.conversation || activeConversation || {
      messages: [],
      astrasId: null,
      isWebSearchEnabled: false,
      genConfig: null
    };
    const modelInfo = requestOptions.modelInfo || normalizeConversationModel(conversation);
    if (!modelInfo) throw new Error(`找不到模型設定: ${conversation.model}`);

    const { provider } = modelInfo;
    const modelId = getModelApiId(modelInfo);
    const apiKey = getApiKeyForProvider(provider);
    if (!apiKey) {
      throw new Error(`請先在設定中提供 ${modelInfo.name} 所需的 API 金鑰。`);
    }

    const historyForApi = requestOptions.historyForApi || (conversation.messages || []).slice(0, -1);
    const currentMessageForApi = requestOptions.currentMessageForApi || { role: 'user', parts };
    const generationConfig = requestOptions.genConfig || conversation.genConfig || getDefaultGenConfig();
    const disableReasoning = requestOptions.disableReasoning === true;
    const reasoningConfig = disableReasoning ? null : getModelReasoningConfig(modelInfo);
    const reasoningEffort = reasoningConfig
      ? normalizeReasoningEffort(modelInfo, requestOptions.reasoningEffort ?? conversation.reasoningEffort)
      : null;
    const config = getConfig();
    let memoryContext = null;
    if (!requestOptions.skipMemoryContext && config.memorySystemVersion === 2) {
      try {
        memoryContext = await getMemoryContext({
          config,
          conversation,
          currentMessage: currentMessageForApi
        });
      } catch (error) {
        warn('Memory context retrieval failed; continuing without it.', error);
      }
    }
    if (memoryContext && typeof requestOptions.onMemoryContextResolved === 'function') {
      requestOptions.onMemoryContextResolved(memoryContext);
    }
    const chartAuthoringGuidance = await getRuntimeChartAuthoringGuidance(
      getMessageTextForGuidance(currentMessageForApi)
    );
    const systemInstruction = await buildSystemInstruction({
      config,
      conversation: requestOptions.skipConversationSystemContext ? { astrasId: null } : conversation,
      astras: getAstras(),
      personalMemories: getPersonalMemories(),
      memoryContext,
      additionalSystemInstruction: requestOptions.additionalSystemInstruction,
      chartAuthoringGuidance
    });

    const request = provider === 'gemini'
      ? buildGeminiRequest({
        modelId,
        apiKey,
        modelInfo,
        historyForApi,
        currentMessageForApi,
        generationConfig,
        reasoningEffort,
        reasoningConfig,
        systemInstruction,
        conversation,
        isWebSearchForced,
        requestOptions,
        modelSupportsUploadedFile
      })
      : (provider === 'nvidia' || provider === 'stepfun')
        ? buildOpenAiCompatibleRequest({
          provider,
          modelId,
          apiKey,
          modelInfo,
          historyForApi,
          currentMessageForApi,
          generationConfig,
          reasoningEffort,
          reasoningConfig,
          disableReasoning,
          systemInstruction,
          modelSupportsVision
        })
        : buildOpenRouterRequest({
          modelId,
          apiKey,
          historyForApi,
          currentMessageForApi,
          generationConfig,
          reasoningEffort,
          reasoningConfig,
          systemInstruction
        });

    let response;
    try {
      response = await fetchImpl(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.payload),
        signal
      });
    } catch (error) {
      if (request.isStepPlanDirectVideoRequest) {
        throw new Error(
          `Step video request bypassed the server proxy to avoid Vercel payload limits, but the browser could not reach StepFun directly: ${error?.message || error}`
        );
      }
      throw error;
    }

    if (!response.ok) {
      const errorBody = await readProviderErrorBody(response);
      throw new Error(getProviderErrorMessage(errorBody));
    }

    if (provider === 'stepfun' && request.payload.stream === false) {
      const data = await response.json();
      const messageContent = data?.choices?.[0]?.message?.content;
      const fullText = Array.isArray(messageContent)
        ? messageContent.map((part) => part?.text || '').join('')
        : String(messageContent || '');
      if (fullText) onChunk(fullText);
      return fullText;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoderImpl();
    return provider === 'gemini'
      ? consumeGeminiStream({ reader, decoder, onChunk, warn })
      : consumeOpenAiCompatibleStream({ reader, decoder, onChunk });
  };
}
