// What a message's files, documents and addresses go through before the model is asked (`spec.documents`, docs/superpowers/specs/2026-10-20-server-document-prep-design.md):
// the page's own steps, run here, so that a reply goes on when the page is closed. Word, PowerPoint and Excel files the model cannot read are read into text (and
// pictures), a document it cannot read (a PDF for a model that reads none) is written down by the translator model, and the addresses of the message are read.
// It is the page's code as it is (`buildSingleModelTranslatedRequestParts` of provider-request-support.js, with the server's reader and keys), so what the model is
// given is what it would be given from the page. The web search is not made here: the search packet (search-packet.js) and the model's own tools do that.
// `onPhase(phase)` says which step is going on ('reading', 'pdf', 'translating', 'links'), for the pages that watch.

import { createProviderRequestSupport } from '../src/app/runtime/reply/provider-request-support.js';
import { buildTavilySearchQuery, formatTavilySearchPacket, normalizePageReads, normalizeTinyfishSearch, withSearchContext } from '../src/app/runtime/reply/model-request-formatting.js';
import { COUNCIL_RESPONSE_CHAR_LIMIT, COUNCIL_RETRY_DELAY_MS, modelSupportsUploadedFile, modelSupportsVision, modelUsesTavilySearch } from '../src/app/runtime/shell/model-registry.js';
import { opencodeModelReadsOfficeViaPdf } from '../src/app/runtime/shell/opencode-models.js';
import { createServerOfficeReader } from './office-deps.js';

// The stages the page's code names, and what the pages that watch are told.
const PHASES = Object.freeze({ fileReading: 'reading', documentTranslation: 'translating', linkedPages: 'links' });
// A Word or PowerPoint file being turned into a PDF (for a model that reads it better so: opencode-models.js) is told as its own step, 'pdf'.

/**
 * The parts of the message made ready for the model (the same list when nothing needed it). `access` is what server/model-access.js resolves;
 * `errorFor(message)` makes the error a failed step ends the reply with (as on the page, where it ends the reply with its message).
 */
export async function withDocumentPrep({
  parts,
  spec,
  access,
  userId = '',
  signal,
  onPhase = () => {},
  onSources = () => {},
  errorFor = (message) => new Error(message),
  getErrorMessage,
  readErrorBody,
  createSupport = createProviderRequestSupport,
  // (onConvert) => the reader of Word, PowerPoint and Excel files; `onConvert()` is called before a file is turned into a PDF.
  createOfficeReader = (onConvert) => createServerOfficeReader({ userId, signal, onConvert })
}) {
  const { config, keyFor, modelInfo, streamApiCall, upstreamFetch } = access;
  const translator = spec.documents?.translator?.info || null;
  let phase = '';
  const tell = (next) => {
    if (next === phase) return;
    phase = next;
    onPhase(next);
  };
  const support = createSupport({
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    normalizeTinyfishSearch,
    normalizePageReads,
    withSearchContext,
    getErrorMessage,
    readErrorBody,
    getApiKeyForProvider: keyFor,
    getConfig: () => config,
    streamApiCall,
    fetchImpl: upstreamFetch,
    // The page asks for the translator Settings chose; with none, a document the model cannot read ends the reply with the page's own message.
    getSingleDocumentTranslatorModel: () => translator,
    modelUsesTavilySearch,
    modelSupportsUploadedFile,
    modelSupportsVision,
    modelReadsOfficeViaPdf: opencodeModelReadsOfficeViaPdf,
    officeReader: createOfficeReader(() => tell('pdf')),
    councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
    councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS
  });

  try {
    return await support.buildSingleModelTranslatedRequestParts(
      parts,
      modelInfo,
      signal,
      (stage) => tell(PHASES[stage] || phase),
      {
        // The search is made by the reply (a packet, or the model's own tools), not here.
        webSearchEnabled: false,
        // The page decided whether the addresses of this message are read (an address for a tool, or one the judging model said is not to be read, is not).
        readLinkedPages: spec.documents?.linkedPages === true,
        conversation: access.conversation,
        onSources
      }
    );
  } catch (error) {
    // A stop is a stop; anything else ends the reply with its message (free of keys: the caller scrubs it).
    if (signal?.aborted) throw error;
    throw errorFor(String(error?.message || error));
  } finally {
    tell('');
  }
}
