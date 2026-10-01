import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';
import { getSearchProvider, searchProviderLabel } from '../../runtime/kernel/search-provider.js';
import { buildLinkedPagesText, extractLinkedUrls, pageCharsFor } from './linked-pages.js';
import { createSearchQueryRewriter } from './search-query-rewriter.js';
import { createWebResearchTools } from './web-research-tools.js';
import { absoluteLinks } from './web-page-text.js';

export function createProviderRequestSupport({
  buildTavilySearchQuery,
  formatTavilySearchPacket,
  withSearchContext = (text) => text,
  normalizeTinyfishSearch,
  normalizePageReads,
  getErrorMessage,
  readErrorBody,
  getApiKeyForProvider,
  getConfig,
  streamApiCall,
  rewriteSearchQuery = createSearchQueryRewriter({ streamApiCall, getApiKeyForProvider }),
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

  const getSearchQueryFromParts = (parts = [], conversation = null) => buildTavilySearchQuery(withSearchContext(extractTextFromParts(parts), conversation?.messages));

  // The query for a message: written from the conversation by a small model (search-query-rewriter.js), and where that is not
  // possible by the rule that puts the earlier messages in front of a message with no subject of its own.
  const buildSearchQuery = async (parts, { conversation = null, modelInfo = null, signal } = {}) => {
    const text = extractTextFromParts(parts);
    const written = await rewriteSearchQuery({ text, messages: conversation?.messages, modelInfo, signal });
    return buildTavilySearchQuery(written || withSearchContext(text, conversation?.messages));
  };

  const { fetchPageContents, searchWeb } = createWebResearchTools({
    getConfig,
    getApiKeyForProvider,
    fetchImpl,
    getErrorMessage,
    readErrorBody,
    normalizeTinyfishSearch,
    normalizePageReads
  });

  // The addresses in the user's message, read for the models that cannot open a link (OpenRouter and NVIDIA ones, not
  // image ones): the text for the model, with the pages read as sources of the reply (marked `read`).
  const readLinkedPages = async (parts, signal, { onSources, onProgress } = {}) => {
    const { urls, skipped } = extractLinkedUrls(extractTextFromParts(parts.filter((part) => part.text)));
    if (urls.length === 0) return '';
    onProgress?.('linkedPages', getRuntimeText(getConfig().uiLanguage, 'readingLinkedPages'));
    const { pages, failed } = await fetchPageContents(urls, signal, { maxChars: pageCharsFor(urls.length) });
    if (pages.length > 0) onSources?.(pages.map((page) => ({ title: page.title, url: page.finalUrl || page.url, read: true })));
    // Links get full addresses, so the model can tell which page they lead to.
    const readable = pages.map((page) => ({ ...page, text: absoluteLinks(page.text, page.finalUrl || page.url) || page.text }));
    return buildLinkedPagesText({ pages: readable, failed, skipped });
  };
  const readsLinkedPages = (model) => Boolean(modelUsesTavilySearch(model) && model?.outputModality !== 'image');

  // The web search for the models that have none of their own, from the source chosen in Settings (Tavily or TinyFish),
  // as the packet that goes in front of the request. The name is from when Tavily was the only source.
  const fetchTavilySearchPacket = async (querySource, signal, options = {}) => {
    const config = getConfig();
    const source = getSearchProvider(config);
    const apiKey = getApiKeyForProvider(source);
    if (!apiKey) {
      throw new Error(getRuntimeText(config.uiLanguage, source === 'tinyfish' ? 'tinyfishKeyRequired' : 'tavilyKeyRequired'));
    }
    const query = Array.isArray(querySource)
      ? await buildSearchQuery(querySource, { conversation: options.conversation, modelInfo: options.modelInfo, signal })
      : buildTavilySearchQuery(querySource);
    if (!query) {
      throw new Error(getRuntimeText(config.uiLanguage, 'noSearchableText'));
    }
    const data = await searchWeb({
      query,
      topic: options.topic === 'news' ? 'news' : 'general',
      maxResults: options.maxResults || 6,
      searchDepth: options.searchDepth,
      signal
    });
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
    if (readsLinkedPages(modelInfo)) {
      const linkedPages = await readLinkedPages(parts, signal, { onSources, onProgress });
      if (linkedPages) translatedSections.push(linkedPages);
    }
    if (webSearchEnabled && modelUsesTavilySearch(modelInfo)) {
      onProgress?.('searchTranslation', getRuntimeText(config.uiLanguage, getSearchProvider(config) === 'tinyfish' ? 'searchingTinyfish' : 'searchingTavily'));
      const searchPacket = await fetchTavilySearchPacket(parts, signal, {
        label: 'Single-model web search packet',
        conversation,
        modelInfo,
        onSources
      });
      translatedSections.push(`# Web search packet\nThis packet was retrieved with ${searchProviderLabel(getSearchProvider(config))} for ${modelInfo.name}. It replaces provider-native web search for this turn.\n\n${truncateCouncilText(searchPacket, 7000)}`);
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
    buildSearchQuery,
    fetchPageContents,
    fetchTavilySearchPacket,
    readLinkedPages,
    readsLinkedPages,
    filterPartsForModelCapability,
    getSearchQueryFromParts,
    streamCouncilApiCallWithRetry,
    truncateCouncilText
  };
}
