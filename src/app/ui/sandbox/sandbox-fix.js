// Asks the model to redo a file it made with Python, in a new Advanced mode
// run (the visual check of a free-form deck uses it). The model sees the
// conversation, its earlier code, and the problems found; the files made so
// far are in /input. Loaded on demand.

import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';
import { modelSupportsToolCalling } from '../../runtime/legacy-core/model-registry.js';
import { resolveReplyMode } from '../../runtime/sandbox/file-mode.js';
import { browserSupportsSandbox } from '../../runtime/sandbox/sandbox-protocol.js';
import { collectSandboxInputs, createSandboxFileParts, sandboxDocumentBlocks, sandboxDocumentNames, withoutDuplicatedFileBlocks, withoutEmptyDocumentBlocks } from './sandbox-files.js';

/**
 * Runs one Advanced mode reply for `requestParts`. Returns null when the
 * conversation cannot use Advanced mode here (the caller then leaves the file
 * as it is), otherwise { text, run, parts, documents }.
 */
export async function runSandboxFix({
  conversation, model, config, streamApiCall, requestParts, signal, onStatus = () => {}, onEvent = () => {}, language, window = globalThis.window
}) {
  const mode = resolveReplyMode({
    conversation, config, modelInfo: model, supportsToolCalling: modelSupportsToolCalling, browserSupported: browserSupportsSandbox(window)
  });
  if (!mode.advanced) return null;
  const [{ runSandboxReply }, { getPythonSandbox }, offices] = await Promise.all([
    import('../../runtime/sandbox/sandbox-reply.js'),
    import('../../runtime/sandbox/python-sandbox.js'),
    import('./office-fonts.js')
  ]);
  const result = await runSandboxReply({
    streamApiCall,
    requestParts,
    signal,
    requestOptions: {
      modelInfo: model,
      conversation,
      // The whole conversation, so the model reads its earlier code and answer.
      historyForApi: conversation.messages,
      requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
    },
    getSandbox: (options) => getPythonSandbox({ ...options, language: config.aiDefaultLanguage || language }),
    language,
    provider: model?.provider,
    inputFiles: collectSandboxInputs(conversation),
    designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
    onStatus,
    onEvent
  });
  if (result.run?.steps?.length) await offices.embedFontsInRunOutputs(result.run).catch(() => {});
  const parts = createSandboxFileParts(result.run);
  return {
    // A file block the model wrote for a file it saved would be a second, empty card.
    text: withoutEmptyDocumentBlocks(withoutDuplicatedFileBlocks(result.text, [...parts.map((part) => part.sandboxFile.name), ...sandboxDocumentNames(result.run)])),
    run: result.run,
    parts,
    documents: sandboxDocumentBlocks(result.run)
  };
}
