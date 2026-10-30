// A reply of one model that the server makes (single-model-response-lifecycle.js): it is handed over (runtime/server-reply/server-reply.js),
// then followed, its words, thinking and steps drawn as they come, until the server has written it. When the server does not take it, the
// reply is made on this device (and says so when that is worth knowing).

import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import { cliIdsForReply } from '../cli/cli-state.js';
import { registerSandboxFileParts } from '../../ui/sandbox/sandbox-files.js';

// What the server says it is doing with the message's files and addresses, as the stage the wait row draws (the page's own names for them).
const DOCUMENT_STAGES = { reading: 'fileReading', pdf: 'makingPdf', translating: 'documentTranslation', links: 'linkedPages' };

/**
 * Asks the server to make the reply (when `prep.plan` says it can). Resolves { serverRun, madeHere }: the run to follow, or null, and
 * whether the server was asked and did not take it (the reply is then made here, and its line says so).
 */
export async function handOverToServer({ serverReply, getConfig, supportsVision }, request, prep) {
  const { conversation, modelInfo, userParts, uiLanguage, assistantMessageId, sequence, onMemoryContextResolved, getHistorySourceIds, requestParts } = request;
  const { plan, canCallTools, cli, replyMode, ownSearchReply, availableSkills, memoryTools, serverPrepares, hasAddresses, skillOptions } = prep;
  // A tool was chosen but cannot be used for this reply: the person is told (the reply is made without it).
  if (!canCallTools && cliIdsForReply(getConfig(), userParts).chosen.length) serverReply.notify('cli-tool-model', uiLanguage);
  else if (!plan.ok && cli.chosen.length) serverReply.notify('cli-local', uiLanguage);
  if (!plan.ok) return { serverRun: null, madeHere: false };
  const started = await serverReply.start({
    conversation,
    modelInfo,
    requestParts,
    webSearch: plan.webSearch,
    // Python runs on the server too: with the Design menu's choices and the files attached to this message.
    advanced: Boolean(plan.advanced),
    // The check of a presentation the reply writes: asked of the server when the page's setting is on and the model can see images.
    visionCheck: getConfig().visionCheckEnabled !== false && modelInfo?.outputModality !== 'image' && supportsVision?.(modelInfo)
      ? { deckDesign: conversation?.deckDesign || 'auto', advanced: replyMode.advanced }
      : null,
    designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
    cli: cli.ids,
    cliChosen: cli.chosen,
    skills: ownSearchReply ? [] : availableSkills,
    // The connectors of the person (a model that calls tools, not with the provider's own search): the server reads which ones are connected.
    connectors: canCallTools && !ownSearchReply,
    // The memory of notes: whether the reply may write to it and what the person said in this conversation (the server reads the notes from the person's table).
    memory: memoryTools?.snapshot() || null,
    // The message goes as the person sent it; the server prepares its files and addresses (the translator is the one set in Settings).
    documents: serverPrepares ? { linkedPages: hasAddresses } : null,
    inputs: userParts.filter((part) => part?.inlineData?.data).map((part) => ({
      name: part.inlineData.name || `attachment.${String(part.inlineData.mimeType || '').split('/')[1] || 'bin'}`,
      mimeType: part.inlineData.mimeType || '',
      data: part.inlineData.data
    })),
    assistantMessageId,
    sequence,
    uiLanguage,
    config: getConfig(),
    requestOptions: { onMemoryContextResolved, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER, ...skillOptions },
    getHistorySourceIds
  });
  if (started.ok) return { serverRun: started.run, madeHere: false };
  // Not taken because it could not be reached or was busy: the reply is made here, and its line says so (no notice over the page). Its sandbox
  // down: said over the page too (nothing else would tell why closing the page ends a reply with Python).
  if (started.notify === 'unreachable' || started.notify === 'busy' || started.notify === 'sandbox') {
    if (started.notify === 'sandbox') serverReply.notify('sandbox', uiLanguage);
    return { serverRun: null, madeHere: true };
  }
  if (started.notify) serverReply.notify(started.notify, uiLanguage);
  return { serverRun: null, madeHere: false };
}

/**
 * Follows the reply the server makes, drawing its words (`onChunk`), thinking and steps as they come. `reply` is the reply's own record
 * (sources, run, files); `view` is single-model-reply-live-view.js; `progress(stage, message)` draws the wait row. `runHere(onChunk)` makes
 * the reply on this device instead, when the server lost its Python before it had an answer. Resolves the text of the answer.
 */
export async function followServerReply({ serverReply, now, setRunStartedAt, getRunStartedAt }, { serverRun, reply, view, progress, signal, uiLanguage, assistantMessageId, targetElement, advanced, runHere }, onChunk) {
  let documentStageShown = false;
  try {
    const outcome = await serverRun.follow({
      signal,
      onRun: (run) => { reply.searchSources = run.sources; },
      // The seconds are the server's.
      onTiming: (elapsedMs) => {
        setRunStartedAt(now() - elapsedMs);
        view.setStartedAt(getRunStartedAt());
      },
      // What the model thinks is shown as it thinks, as in a reply made here.
      onThought: (chunk, kind, soFarMs) => view.showThinking(chunk, kind === 'summary' ? 'summary' : undefined, soFarMs),
      onThoughtEnd: (ms) => view.endThinking(ms),
      // The server is searching first (for a model that cannot search): the line the page shows when it does that itself.
      onSearching: (source) => {
        if (source && !view.answered) progress('searchTranslation', getRuntimeText(uiLanguage, source === 'tinyfish' ? 'searchingTinyfish' : 'searchingTavily'));
      },
      // The server is preparing the message's files and addresses: the same lines the page shows when it does that itself.
      onDocumentPhase: (phase) => {
        if (view.answered) return;
        const stage = DOCUMENT_STAGES[phase];
        if (stage) progress(stage);
        else if (documentStageShown) progress('preparing', 'Checking model capabilities');
        documentStageShown = Boolean(stage);
      },
      // The steps of Python (and the pages it searched) as they happen, in the same step list as a reply made here.
      // Each event says when it happened on the server, so every page draws the same times.
      onEvent: (event) => {
        if (event.type === 'reset') {
          view.resetSteps();
          return;
        }
        const at = Number.isFinite(event.t) ? getRunStartedAt() + event.t : null;
        view.noteOwnSearch(event, { at });
        view.event(at !== null ? { ...event, at } : event);
      },
      onText: (delta) => {
        view.serverText();
        onChunk(delta);
      }
    });
    if (outcome.run) {
      reply.sandboxRun = outcome.run;
      if (outcome.run.sources?.length) reply.searchSources = outcome.run.sources;
    }
    reply.steersLeft = outcome.steersLeft || [];
    reply.cut = outcome.segment || null;
    if (outcome.rewritten && targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    // The server may check the presentations of the reply too: the page then follows that check and makes none of its own.
    serverReply.noteVision?.(assistantMessageId, { vision: Boolean(serverRun.vision), visionRunId: outcome.visionRunId });
    // The files the reply made are parts of its message (their bytes are in the person's cloud storage; they are brought here).
    if (outcome.extraParts?.length) {
      reply.sandboxParts = outcome.extraParts;
      reply.pictureOffsets = outcome.pictureOffsets || [];
      registerSandboxFileParts(reply.sandboxParts);
    }
    return outcome.text;
  } catch (error) {
    // The server lost its Python before it had an answer, and this page was there: the reply is made here, with the page's own Python.
    if (error?.code === 'sandbox_unavailable' && advanced) {
      reply.sandboxRun = null;
      return runHere(onChunk);
    }
    throw serverReply.localizeError(error, uiLanguage);
  }
}
