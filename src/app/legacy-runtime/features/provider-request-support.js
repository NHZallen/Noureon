import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';
import { getSearchProvider, searchProviderLabel } from '../../runtime/kernel/search-provider.js';

export function createProviderRequestSupport({
  buildTavilySearchQuery,
  formatTavilySearchPacket,
  normalizeTinyfishSearch,
  normalizeTinyfishFetch,
  getErrorMessage,
  readErrorBody,
  getApiKeyForProvider,
  getConfig,
  streamApiCall,
  fetchImpl = fetch,
  getSingleDocumentTranslatorModel,
  modelUsesTavilySearch,
  modelSupportsUploadedFile,
  councilResponseCharLimit,
  councilRetryDelayMs,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
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

  const getTavilySearchDepth = () => getConfig().tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
  const getSearchQueryFromParts = (parts = []) => buildTavilySearchQuery(extractTextFromParts(parts));

  const postSearch = async (url, { apiKey, body, signal, failure }) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      throw new Error(getErrorMessage(errorBody, `${failure} HTTP ${response.status}`));
    }
    return response.json();
  };

  // The full text of pages (up to ten at a time) from TinyFish's Fetch, as { pages, failed }. It uses the TinyFish key,
  // whichever source the search comes from. The search packet uses it for the top results (addPageTexts).
  const fetchPageContents = async (urls, signal, options = {}) => {
    const config = getConfig();
    const apiKey = getApiKeyForProvider('tinyfish');
    if (!apiKey) {
      throw new Error(getRuntimeText(config.uiLanguage, 'tinyfishKeyRequired'));
    }
    const requested = [...new Set((urls || []).map((url) => String(url || '').trim()).filter((url) => /^https?:\/\//i.test(url)))].slice(0, 10);
    if (requested.length === 0) return { pages: [], failed: [] };
    const data = await postSearch('/api/tinyfish-fetch', {
      apiKey,
      signal,
      failure: 'TinyFish',
      body: { urls: requested, format: 'markdown' }
    });
    return normalizeTinyfishFetch(data, { requested, maxChars: options.maxChars || 8000 });
  };

  // With TinyFish as the search source, the top results are read in full too (one more request, free with the same key),
  // so the model has the pages and not only their snippets. If that fails the snippets are still a packet; only a stop
  // by the person ends it.
  const PAGES_TO_READ = 3;
  const PAGE_TEXT_CHARS = 3000;
  const addPageTexts = async (data, signal) => {
    const wanted = (data.results || []).slice(0, PAGES_TO_READ).map((result) => result.url);
    if (wanted.length === 0) return;
    try {
      const { pages } = await fetchPageContents(wanted, signal, { maxChars: PAGE_TEXT_CHARS });
      for (const page of pages) {
        const result = data.results.find((entry) => entry.url === page.url || entry.url === page.finalUrl);
        if (result) result.page = page.text;
      }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
    }
  };

  // The web search for the models that have none of their own, from the source chosen in Settings (Tavily or TinyFish),
  // as the packet that goes in front of the request. The name is from when Tavily was the only source.
  const fetchTavilySearchPacket = async (querySource, signal, options = {}) => {
    const config = getConfig();
    const source = getSearchProvider(config);
    const apiKey = getApiKeyForProvider(source);
    if (!apiKey) {
      throw new Error(getRuntimeText(config.uiLanguage, source === 'tinyfish' ? 'tinyfishKeyRequired' : 'tavilyKeyRequired'));
    }
    const query = buildTavilySearchQuery(Array.isArray(querySource)
      ? getSearchQueryFromParts(querySource)
      : querySource);
    if (!query) {
      throw new Error(getRuntimeText(config.uiLanguage, 'noSearchableText'));
    }
    const maxResults = options.maxResults || 6;
    const data = source === 'tinyfish'
      ? normalizeTinyfishSearch(await postSearch('/api/tinyfish-search', {
        apiKey,
        signal,
        failure: 'TinyFish',
        body: { query, domain_type: options.topic === 'news' ? 'news' : 'web' }
      }), maxResults)
      : await postSearch('/api/tavily-search', {
        apiKey,
        signal,
        failure: 'Tavily',
        body: {
          query,
          search_depth: options.searchDepth || getTavilySearchDepth(),
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          include_usage: true,
          topic: options.topic || 'general'
        }
      });
    if (source === 'tinyfish') await addPageTexts(data, signal);
    // The pages found, for the "Searched N sites" row of the reply.
    options.onSources?.((Array.isArray(data?.results) ? data.results : []).slice(0, 8).map((result) => ({ title: result.title || '', url: result.url || '' })));
    return formatTavilySearchPacket(data, query, options.label || 'Web search packet', searchProviderLabel(source));
  };

  const buildSingleModelTranslatedRequestParts = async (parts, modelInfo, signal, onProgress, {
    webSearchEnabled = false,
    conversation = null,
    onSources = undefined
  } = {}) => {
    const config = getConfig();
    const translatedSections = [];
    const documentParts = getUnsupportedSingleDocumentParts(parts, modelInfo);
    if (documentParts.length > 0) {
      const translatorModel = getSingleDocumentTranslatorModel();
      if (!translatorModel) {
        throw new Error(getRuntimeText(config.uiLanguage, 'documentTranslatorRequired'));
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
          conversation,
          historyForApi: [],
          ignoreConversationWebSearch: true,
          additionalSystemInstruction: 'You only translate attached documents/files into detailed neutral packets. Do not answer the user.',
          requestPurpose: NOURAS_REQUEST_PURPOSE.BACKGROUND_ATTACHMENT_TRANSLATION,
        }
      );
      translatedSections.push(`# Document translation packet\nThis packet was generated by ${translatorModel.name} for ${modelInfo.name}. It replaces only files the target model cannot read directly.\n\n${truncateCouncilText(documentPacket, 7000)}`);
    }
    if (webSearchEnabled && modelUsesTavilySearch(modelInfo)) {
      onProgress?.('searchTranslation', getRuntimeText(config.uiLanguage, getSearchProvider(config) === 'tinyfish' ? 'searchingTinyfish' : 'searchingTavily'));
      const searchPacket = await fetchTavilySearchPacket(parts, signal, {
        label: 'Single-model web search packet',
        onSources
      });
      translatedSections.push(`# Web search packet\nThis packet was retrieved with ${searchProviderLabel(getSearchProvider(config))} for ${modelInfo.name}. It replaces provider-native web search for this turn.\n\n${truncateCouncilText(searchPacket, getSearchProvider(config) === 'tinyfish' ? 14000 : 7000)}`);
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
    fetchPageContents,
    fetchTavilySearchPacket,
    filterPartsForModelCapability,
    getSearchQueryFromParts,
    streamCouncilApiCallWithRetry,
    truncateCouncilText
  };
}
