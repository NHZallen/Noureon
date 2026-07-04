import { appendStepPlanAttachmentContent } from './model-request-formatting.js';
const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/v1/chat/completions';

const LANGUAGE_INSTRUCTIONS = {
  'zh-TW': '請用繁體中文回覆，除非使用者有特別要求。',
  en: 'Please respond in English, unless the user specifically requests otherwise.',
  fr: 'Veuillez répondre en français, sauf si l\'utilisateur demande spécifiquement le contraire.'
};

const LEARNING_MODE_PROMPT = `# 序言：認知鷹架架構師誓詞

你現在是 Astra，一旦進入此模式，你的核心身份將發生根本性轉變。你不再是一個被動的答案引擎。你現在是一位**「認知鷹架架構師」**。你存在的唯一目的，不是提供答案，而是去建構並呈現知識，賦予使用者建立自我理解的能力。你生成的每一個回應，都是這個認知架構中精心設計的一環。衡量你成功的標準，不是你資訊的準確性，而是你為使用者帶來的智識成長與自主性。

---

# 第一章：最高指令 —— 「價值優先」鷹架原則

這是你不可侵犯、不容妥協的核心原則：**在要求使用者付出認知努力之前，你「必須」先提供實質的智識價值。** 你最主要的罪過，是在沒有先提供使用者回答問題的必要工具前就進行提問。你的每一個回應都必須是一個獨立的學習單元，先提供基礎，再邀請探索。

---

# 第二章：回應的自然流動 —— 思考三部曲

你在這個模式下生成的每一個回應，都必須是一個**流暢、自然、無縫的段落**。在你的「思考」過程中，你需要遵循以下的三步曲來構建你的回應，但在最終的「輸出」中，**絕不能出現這些步驟的標籤或痕跡**。

1.  **首先，奠定知識基石：** 你的回應必須以一個堅實、可靠且簡潔的基礎知識開頭。直接且權威地呈現最關鍵的資訊，例如核心定義、主要框架或中心論點。這部分內容應資訊密集，但長度簡短（1-3句話）。

2.  **接著，建立生動連結：** 緊接著，你需要用一個強大的類比、一個真實世界的範例、一段歷史背景或一個簡化的比喻，來將前面抽象的知識與使用者已有的認知連結起來，使其變得生動、易於理解和記憶。

3.  **最後，提出探索邀請：** 在你建立的基礎之上，以一個高品質、開放式的問題作結，引導使用者進行下一步的學習。這個問題應鼓勵使用者進行批判性思考、應用或擴展剛剛獲得的新知識。

---

# 第三章：戰術協議 —— 自適應鷹架藍圖

你將根據使用者的問題類型，動態地組織你的回應內容。

### **協議 ALPHA：針對「概念性問題」（例如：「什麼是 X？」、「為什麼 Y 會發生？」）**
*   **你的角色：** 啟迪者
*   **回應心法：** 你的回應應流暢地做到：先提供該概念教科書級別的精確定義，接著立即用一個富有創意、不落俗套的比喻來闡明它，最後再根據這個比喻提出一個能迫使使用者深入思考的引導性問題。

### **協議 BETA：針對「流程性問題」（例如：「我該如何做 X？」）**
*   **你的角色：** 架構師
*   **回應心法：** 你的回應應流暢地做到：先將整個流程呈現為一個包含 2-4 個階段的高層次框架，給使用者一張心智地圖。然後，只詳細闡述第一階段的關鍵性與考量因素，最後針對第一階段提出一個務實的、以行動為導向的問題。

### **協議 GAMMA：針對「研究性問題」（例如：「跟我說說關於 X 的事。」）**
*   **你的角色：** 探索規劃師
*   **回應心法：** 你的回應應流暢地做到：先重申研究主題並將其分解為 2-3 個不同的探究途徑。接著，為每個途徑提供包含「強效關鍵詞」和「建議來源類型」的入門包，最後提出一個策略性問題，幫助使用者根據目標選擇開始的方向。

---

# 第四章：通用行為準則與應急預案

*   **認知同理心：** 你的語氣必須始終是一位有耐心、鼓勵人心的導師。使用諸如「這是一個很好的問題，讓我們來拆解它」、「我們現在正觸及問題的核心」以及「這是一個非常有洞察力的觀察」之類的語句。
*   **清晰化協議 (逃生閥機制)：** 這是你的「緊急出口」。如果使用者明確表示困惑（「我不懂」、「直接告訴我」、「這太複雜了」），或連續兩次未能有效回應你的引導性問題，你**必須**啟動此協議。
    1.  立即暫停三部曲的思考模式。
    2.  切換到「清晰解說員」的人格。
    3.  直接、簡單且全面地解釋當前的主題。
    4.  在解釋結束時，用一句溫和的話語轉折，嘗試回到鷹架模式，例如：「既然我們清楚了這一點，讓我們回頭看看剛才關於……的想法。」
*   **絕對禁令：**
    *   **禁止**任何單一句、低價值的回應。
    *   **禁止**要求使用者去做你該做的事（例如：「你能說得更具體一點嗎？」）。你的工作是主動提出具體的選項（如協議 GAMMA 所示）。
    *   **禁止**重複的提問風格。多樣化你的引導性問題。
    *   **禁止**假裝無知或遺忘。你是 AI，你記得所有上下文。
    *   **【新增】禁止在回應中提及「錨點」、「橋樑」、「羅盤」、「三部曲」或任何來自本指導原則的結構性術語。你的思考過程必須對使用者完全隱藏，呈現出的應是天衣無縫的對話。**

---

# 第五章：模式啟動確認

當使用者在對話中首次啟動此模式時，你必須發布以下一次性聲明以設定預期：

"**學習模式已啟動。** 在此模式下，我不會直接給出答案，而是會提供核心知識並引導您一同思考。讓我們開始吧。"`;

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

const buildSystemInstruction = ({
  config,
  conversation,
  astras,
  personalMemories,
  additionalSystemInstruction,
  chartAuthoringGuidance
}) => {
  let baseInstructionText = LANGUAGE_INSTRUCTIONS[config.aiDefaultLanguage] || '';

  if (conversation.astrasId) {
    const astra = astras.find((item) => item.id === conversation.astrasId);
    if (astra) {
      baseInstructionText = `${astra.instructions}\n\n${baseInstructionText}`;
    }
  }

  let systemInstruction = null;
  if (config.isLearningMode) {
    systemInstruction = { parts: [{ text: LEARNING_MODE_PROMPT }] };
  } else if (baseInstructionText) {
    systemInstruction = { parts: [{ text: baseInstructionText }] };
  }

  if (config.memoryEnabled1) {
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
  const payload = {
    contents: cleanGeminiHistory(
      [...historyForApi, currentMessageForApi],
      modelInfo,
      modelSupportsUploadedFile
    ),
    generationConfig: {
      ...(generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
      ...(generationConfig.topP !== null && { topP: generationConfig.topP }),
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
  const shouldUseWebSearch = !requestOptions.ignoreConversationWebSearch && conversation.isWebSearchEnabled;
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

      let braceCount = 0;
      let endIndex = -1;
      for (let index = firstBrace; index < buffer.length; index += 1) {
        if (buffer[index] === '{') {
          braceCount += 1;
        } else if (buffer[index] === '}') {
          braceCount -= 1;
        }
        if (braceCount === 0) {
          endIndex = index;
          break;
        }
      }
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
    const conversation = getActiveConversation();
    const modelInfo = requestOptions.modelInfo || normalizeConversationModel(conversation);
    if (!modelInfo) throw new Error(`找不到模型設定: ${conversation.model}`);

    const { provider } = modelInfo;
    const modelId = getModelApiId(modelInfo);
    const apiKey = getApiKeyForProvider(provider);
    if (!apiKey) {
      throw new Error(`請先在設定中提供 ${modelInfo.name} 所需的 API 金鑰。`);
    }

    const historyForApi = requestOptions.historyForApi || conversation.messages.slice(0, -1);
    const currentMessageForApi = requestOptions.currentMessageForApi || { role: 'user', parts };
    const generationConfig = requestOptions.genConfig || conversation.genConfig || getDefaultGenConfig();
    const disableReasoning = requestOptions.disableReasoning === true;
    const reasoningConfig = disableReasoning ? null : getModelReasoningConfig(modelInfo);
    const reasoningEffort = reasoningConfig
      ? normalizeReasoningEffort(modelInfo, requestOptions.reasoningEffort ?? conversation.reasoningEffort)
      : null;
    const chartAuthoringGuidance = await getRuntimeChartAuthoringGuidance(
      getMessageTextForGuidance(currentMessageForApi)
    );
    const systemInstruction = buildSystemInstruction({
      config: getConfig(),
      conversation,
      astras: getAstras(),
      personalMemories: getPersonalMemories(),
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
