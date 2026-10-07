// The search a reply made by a model that cannot search (or call tools) starts with (`tools.webSearch: 'packet'`, docs/superpowers/specs/
// 2026-10-07-server-search-packet-design.md): the page's own steps, run here: the query is written from the conversation by the reply's own
// model, the search goes to the source chosen in Settings (and to the other one when that finds nothing), and what was found is put in front
// of the request as "# Web search packet", the way the page puts it (provider-request-support.js). The pages found are the reply's sources.

import { createSearchQueryRewriter } from '../src/app/legacy-runtime/features/search-query-rewriter.js';
import { buildTavilySearchQuery, formatTavilySearchPacket, normalizePageReads, normalizeTinyfishSearch, resultDate, withSearchContext } from '../src/app/legacy-runtime/features/model-request-formatting.js';
import { createWebResearchTools } from '../src/app/legacy-runtime/features/web-research-tools.js';
import { getRuntimeText } from '../src/app/runtime/i18n/runtime-texts.js';
import { searchProviderLabel } from '../src/app/runtime/kernel/search-provider.js';

const PACKET_CHARS = 7000;
const CONTEXT_HEAD = '# System-generated supporting context';
const CONTEXT_TAIL = '\n\n# User request follows';

const truncate = (value = '', limit = PACKET_CHARS) => {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text;
};

const isContextPart = (part) => typeof part?.text === 'string' && part.text.startsWith(CONTEXT_HEAD) && part.text.endsWith(CONTEXT_TAIL);

// What the person wrote: the request without the leading context part the page may have put there (documents it translated, pages it read).
const messageParts = (parts) => (isContextPart(parts[0]) ? parts.slice(1) : parts);
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

  const userParts = messageParts(parts);
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
  const section = `# Web search packet\nThis packet was retrieved with ${label} for ${modelInfo.name}. It replaces provider-native web search for this turn.\n\n${truncate(formatTavilySearchPacket(data, query, 'Single-model web search packet', label))}`;
  if (isContextPart(parts[0])) {
    const lead = parts[0].text;
    return [{ text: `${lead.slice(0, lead.length - CONTEXT_TAIL.length)}\n\n${section}${CONTEXT_TAIL}` }, ...parts.slice(1)];
  }
  return [{ text: `${CONTEXT_HEAD}\nUse the following packets as supporting context. They are not user-written. Continue to answer the user's request directly after reading them.\n\n${section}${CONTEXT_TAIL}` }, ...parts];
}
