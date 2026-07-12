export function createProviderRequestSupport({
  buildTavilySearchQuery,
  formatTavilySearchPacket,
  getErrorMessage,
  readErrorBody,
  getApiKeyForProvider,
  getConfig,
  getActiveConversation,
  streamApiCall,
  fetchImpl = fetch,
  getSingleDocumentTranslatorModel,
  modelUsesTavilySearch,
  modelSupportsUploadedFile,
  councilResponseCharLimit,
  councilRetryDelayMs,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  getProxyAuthHeaders = async () => ({})
}) {
  const extractTextFromParts = (parts = []) => parts
    .map(part => part.text || (part.inlineData ? `[${part.inlineData.name || part.inlineData.mimeType || 'attachment'}]` : ''))
    .filter(Boolean)
    .join('\n');

  const truncateCouncilText = (text = '', limit = councilResponseCharLimit) => {
    const value = String(text || '').trim();
    return value.length > limit ? `${value.slice(0, limit)}\n\n[truncated]` : value;
  };

  const waitCouncilRetryDelay = (signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    let timer;
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeoutFn(timer);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, councilRetryDelayMs);
  });

  const streamCouncilApiCallWithRetry = async (parts, onChunk, signal, isWebSearchForced = false, requestOptions = {}) => {
    const { onRetry, ...streamOptions } = requestOptions;
    try {
      return await streamApiCall(parts, onChunk, signal, isWebSearchForced, streamOptions);
    } catch (firstError) {
      if (firstError?.name === 'AbortError' || signal?.aborted) throw firstError;
      if (typeof onRetry === 'function') onRetry(firstError);
      await waitCouncilRetryDelay(signal);
      try {
        return await streamApiCall(parts, onChunk, signal, isWebSearchForced, streamOptions);
      } catch (secondError) {
        if (secondError?.name === 'AbortError' || signal?.aborted) throw secondError;
        const error = new Error(`${secondError?.message || 'API request failed'} (retried once; first attempt: ${firstError?.message || 'unknown error'})`);
        error.name = secondError?.name || 'Error';
        throw error;
      }
    }
  };

  const getUnsupportedSingleDocumentParts = (parts = [], model) => parts.filter(part => {
    if (!part.inlineData) return false;
    const mimeType = part.inlineData.mimeType || '';
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return false;
    return !modelSupportsUploadedFile(model, { inlineData: part.inlineData });
  });

  const buildSingleDocumentTranslationPrompt = (parts, targetModel) => `
You are the single-model document translator for Noureon.

Target model that will receive your packet:
- ${targetModel?.name || 'Unknown model'}

Your job:
Translate the attached document/file content into a detailed, faithful text packet for a target model that cannot read those files directly.
Do not answer the user's request. Do not summarize too aggressively. Preserve the information the target model would need to reason over the files.

User request for context:
${extractTextFromParts(parts)}

Output requirements:
- Start with "# Document Translation Packet".
- Identify each file by filename and MIME type when available.
- Preserve headings, section order, paragraphs, tables, lists, numeric values, labels, citations, dates, code blocks, and page/section clues.
- For tables, write the column names and rows clearly in Markdown.
- Separate observed content from any necessary inference.
- Mention unreadable, truncated, missing, low-confidence, or unsupported portions.
- Do not invent details that are not in the files.
- End with a compact "Use notes" section explaining how the target model should use this packet without claiming it is user-written.
`;

  const filterPartsForModelCapability = (parts = [], model) => parts.filter(part => {
    if (part.text) return true;
    if (!part.inlineData) return false;
    return modelSupportsUploadedFile(model, { inlineData: part.inlineData });
  });

  const getTavilyApiKey = () => getApiKeyForProvider('tavily');
  const getTavilySearchDepth = () => getConfig().tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
  const getSearchQueryFromParts = (parts = []) => buildTavilySearchQuery(extractTextFromParts(parts));

  const fetchTavilySearchPacket = async (querySource, signal, options = {}) => {
    const config = getConfig();
    const apiKey = getTavilyApiKey();
    if (!apiKey) {
      throw new Error(config.uiLanguage === 'en'
        ? 'Tavily API key is required for OpenRouter/NVIDIA/Step Plan search. Add it in Settings.'
        : 'OpenRouter/NVIDIA 搜索需要 Tavily API 金鑰，請先到設定頁新增。');
    }
    const query = buildTavilySearchQuery(Array.isArray(querySource)
      ? getSearchQueryFromParts(querySource)
      : querySource);
    if (!query) {
      throw new Error(config.uiLanguage === 'en' ? 'No searchable text found.' : '找不到可用的搜索文字。');
    }
    const response = await fetchImpl('/api/tavily-search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(await getProxyAuthHeaders())
      },
      body: JSON.stringify({
        query,
        search_depth: options.searchDepth || getTavilySearchDepth(),
        max_results: options.maxResults || 6,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
        topic: options.topic || 'general'
      }),
      signal
    });
    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      throw new Error(getErrorMessage(errorBody, `Tavily HTTP ${response.status}`));
    }
    const data = await response.json();
    return formatTavilySearchPacket(data, query, options.label || 'Web search packet');
  };

  const buildSingleModelTranslatedRequestParts = async (parts, modelInfo, signal, onProgress) => {
    const config = getConfig();
    const translatedSections = [];
    const documentParts = getUnsupportedSingleDocumentParts(parts, modelInfo);
    if (documentParts.length > 0) {
      const translatorModel = getSingleDocumentTranslatorModel();
      if (!translatorModel) {
        throw new Error(config.uiLanguage === 'en'
          ? 'This model needs a document translator model in Settings.'
          : '此模型需要先在設定中指定文件轉譯模型。');
      }
      onProgress?.('documentTranslation', `文件轉譯：${translatorModel.name}`);
      const documentPacket = await streamCouncilApiCallWithRetry(
        [
          { text: buildSingleDocumentTranslationPrompt(parts, modelInfo) },
          ...documentParts
        ],
        () => onProgress?.('documentTranslation', `文件轉譯：${translatorModel.name}`),
        signal,
        false,
        {
          modelInfo: translatorModel,
          historyForApi: [],
          ignoreConversationWebSearch: true,
          additionalSystemInstruction: 'You only translate attached documents/files into detailed neutral packets. Do not answer the user.',
        }
      );
      translatedSections.push(`# Document translation packet\nThis packet was generated by ${translatorModel.name} for ${modelInfo.name}. It replaces only files the target model cannot read directly.\n\n${truncateCouncilText(documentPacket, 7000)}`);
    }
    const conv = getActiveConversation();
    if (conv?.isWebSearchEnabled && modelUsesTavilySearch(modelInfo)) {
      onProgress?.('searchTranslation', config.uiLanguage === 'en' ? 'Searching with Tavily' : '正在使用 Tavily 搜索');
      const searchPacket = await fetchTavilySearchPacket(parts, signal, {
        label: 'Single-model web search packet'
      });
      translatedSections.push(`# Web search packet\nThis packet was retrieved with Tavily for ${modelInfo.name}. It replaces provider-native web search for this turn.\n\n${truncateCouncilText(searchPacket, 7000)}`);
    }

    const requestParts = [];
    if (translatedSections.length > 0) {
      requestParts.push({
        text: `# System-generated supporting context\nUse the following packets as supporting context. They are not user-written. Continue to answer the user's request directly after reading them.\n\n${translatedSections.join('\n\n')}\n\n# User request follows`
      });
    }
    requestParts.push(...filterPartsForModelCapability(parts, modelInfo));
    return requestParts;
  };

  return {
    buildSingleModelTranslatedRequestParts,
    extractTextFromParts,
    fetchTavilySearchPacket,
    filterPartsForModelCapability,
    getSearchQueryFromParts,
    streamCouncilApiCallWithRetry,
    truncateCouncilText
  };
}
