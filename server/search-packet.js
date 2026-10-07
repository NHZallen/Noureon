// The search a reply made by a model that cannot search (or call tools) starts with (`tools.webSearch: 'packet'`, docs/superpowers/specs/
// 2026-10-07-server-search-packet-design.md): the page's own steps, run here: the query is written from the conversation by the reply's own
// model, the search goes to the source chosen in Settings (and to the other one when that finds nothing), and what was found is put in front
// of the request as "# Web search packet", the way the page puts it (provider-request-support.js). The pages found are the reply's sources.

import { personParts, searchPacketSection, withContextSection } from '../src/app/legacy-runtime/features/search-packet-parts.js';
import { createSearchQueryRewriter } from '../src/app/legacy-runtime/features/search-query-rewriter.js';
import { buildTavilySearchQuery, formatTavilySearchPacket, normalizePageReads, normalizeTinyfishSearch, resultDate, withSearchContext } from '../src/app/legacy-runtime/features/model-request-formatting.js';
import { createWebResearchTools } from '../src/app/legacy-runtime/features/web-research-tools.js';
import { getRuntimeText } from '../src/app/runtime/i18n/runtime-texts.js';
import { searchProviderLabel } from '../src/app/runtime/kernel/search-provider.js';

const textOf = (parts) => parts
  .map((part) => part.text || (part.inlineData ? `[${part.inlineData.name || part.inlineData.mimeType || 'attachment'}]` : ''))
  .filter(Boolean)
  .join('\n');

/**
 * Searches for the message and returns the request parts with the packet in front (inside the leading context part when the page made one).
 * `access` is what server/model-access.js resolves; `errorFor(message)` makes the error a failed search ends the reply with (the same as the
 * page, where a search that fails ends the reply with its message). Pages found go to `onSources`.
 */
export async function withSearchPacket({ parts, history, access, signal, onSources = () => {}, errorFor = (message) => new Error(message), createTools = createWebResearchTools, getErrorMessage, readErrorBody }) {
  const { config, keyFor, language, modelInfo, streamApiCall, upstreamFetch } = access;
  const source = config.searchProvider === 'tinyfish' ? 'tinyfish' : 'tavily';
  if (!keyFor(source)) throw errorFor(getRuntimeText(language, source === 'tinyfish' ? 'tinyfishKeyRequired' : 'tavilyKeyRequired'));

  const userParts = personParts(parts);
  const text = textOf(userParts);
  const messages = [...history, { role: 'user', parts: userParts }];
  const rewrite = createSearchQueryRewriter({ streamApiCall, getApiKeyForProvider: keyFor });
  const written = await rewrite({ text, messages, modelInfo, signal });
  const query = buildTavilySearchQuery(written || withSearchContext(text, messages));
  if (!query) throw errorFor(getRuntimeText(language, 'noSearchableText'));

  const tools = createTools({ getConfig: () => config, getApiKeyForProvider: keyFor, fetchImpl: upstreamFetch, getErrorMessage, readErrorBody, normalizePageReads, normalizeTinyfishSearch });
  const data = await tools.searchWeb({ query, topic: 'general', maxResults: 6, signal });
  onSources((Array.isArray(data?.results) ? data.results : []).slice(0, 8)
    .map((result, index) => {
      const snippet = String(result.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      const date = resultDate(result);
      return { title: result.title || '', url: result.url || '', n: index + 1, ...(snippet ? { snippet } : {}), ...(date ? { date } : {}) };
    })
    .filter((found) => found.url));

  const label = searchProviderLabel(source);
  return withContextSection(parts, searchPacketSection({ packet: formatTavilySearchPacket(data, query, 'Single-model web search packet', label), providerLabel: label, modelName: modelInfo.name }));
}
