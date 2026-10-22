// A reply of one model, from the message sent to the text saved. The stages, each a module of its own:
//   single-model-reply-prepare.js     what kind of reply it is (Advanced mode, who searches, tools, skills, whether the server makes it)
//   single-model-reply-server.js      handed over to the server and followed
//   single-model-reply-local.js       made on this device (Python in the browser, or a stream of words)
//   single-model-reply-live-view.js   the step list and the thinking while it is made
//   single-model-reply-finish.js      the run record and the text saved
// This file joins them, and draws the wait row before the first words.

import { addNumberedSources } from '../../ui/citations/source-numbering.js';
import { watchCitations } from '../../ui/citations/citation-pills.js';
import { patchHTML } from '../../ui/dom/patch-html.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';
import { looksLikeFileTask, prepareReply } from './single-model-reply-prepare.js';
import { followServerReply, handOverToServer } from './single-model-reply-server.js';
import { createLocalReply } from './single-model-reply-local.js';
import { createReplyLiveView } from './single-model-reply-live-view.js';
import { composeReplyText, recordReplyRun } from './single-model-reply-finish.js';

// What a reply makes as it goes: the request as it stands, the pages searched (kept with the reply, shown as "Searched N sites"), its run record,
// its files and documents, and where the provider's own search cites its pages.
const createReplyRecord = ({ userParts, synthesis, replyMode }) => {
  const reply = {
    requestParts: userParts,
    searchSources: Array.isArray(synthesis?.sources) ? [...synthesis.sources] : [],
    // The provider's own web search (Gemini) reports the pages it used as the answer streams; rounds add to them. A page that was found
    // and then read is both, so each is kept once.
    addSearchSources: (found) => {
      reply.searchSources = addNumberedSources(reply.searchSources, found);
    },
    groundingSupports: [],
    // The run record (or the reason for Standard mode) kept above the answer.
    sandboxRun: !replyMode.advanced && replyMode.reason && looksLikeFileTask(userParts)
      ? { status: 'done', steps: [], fallback: replyMode.reason }
      : null,
    // Files the run made, kept as parts of the reply message, and documents the code handed to the design system, as file blocks.
    sandboxParts: [],
    // Where in the answer each picture a text model drew stood (data/picture-interleave.js).
    pictureOffsets: [],
    sandboxDocuments: ''
  };
  return reply;
};

export function createSingleModelResponseLifecycle({
  now = () => Date.now(),
  getOutputMode,
  renderSingleModelProgress,
  startProgressTicker,
  stopProgressTicker,
  buildSingleModelTranslatedRequestParts,
  streamApiCall,
  streamMarkdownResponse,
  playbackStreamingMarkdownResponse,
  renderIncrementalResponse,
  getOpenCouncilDetailKeys,
  restoreOpenCouncilDetails,
  getConfig = () => ({}),
  // Without it (older callers, tests) replies never use Advanced mode.
  supportsToolCalling = null,
  // (modelInfo) => whether the model can look at images: the automatic visual check of presentations is asked of the server for those.
  supportsVision = null,
  // The model's own web searching ({ canUse(modelInfo), searchWeb, openPage }, see web-research-reply.js). Without it a search is
  // a packet in front of the request.
  webResearch = null,
  // Replies run by the server ({ plan, start, notify, localizeError }, see runtime/server-reply/server-reply.js). Without it every reply is made here.
  serverReply = null,
  getWindow = () => globalThis.window,
  getDocument = () => globalThis.document
}) {
  let progressTimer = null;
  let latestProgress = null;
  // The step list is there ("Working · thinking"): it says the reply is under way, so the waiting dot is no longer drawn.
  let stepsShown = false;
  // When the reply began, for the seconds shown. For a reply the server makes it is moved to the server's own clock, so every page
  // that shows the reply shows the same seconds.
  let runStartedAt = 0;

  const stop = () => {
    if (!progressTimer) return;
    stopProgressTicker(progressTimer);
    progressTimer = null;
  };

  const renderProgress = (targetElement, startedAt, stage, message, extra = {}) => {
    latestProgress = {
      ...latestProgress,
      stage,
      message,
      elapsedMs: now() - runStartedAt,
      ...extra
    };
    if (!stepsShown) patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    return latestProgress;
  };

  const startTicker = (targetElement) => {
    progressTimer = startProgressTicker(() => {
      if (stepsShown) return;
      latestProgress = {
        ...latestProgress,
        elapsedMs: now() - runStartedAt
      };
      // Only the numbers change in place: see patch-html.js.
      patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    });
  };

  const run = async ({
    targetElement,
    userParts,
    modelInfo,
    conversation,
    webSearchEnabled = false,
    onMemoryContextResolved = () => {},
    signal,
    uiLanguage,
    // For a reply the server makes: the id and place of the message it writes, and the conversations the memory drew on.
    assistantMessageId = null,
    sequence = 0,
    getHistorySourceIds = () => [],
    // A reply the server is still making, picked up again after the page was closed or left: it is only followed.
    resumeRun = null,
    // The synthesis of a council (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.2): a reply like any other, made here, to a request
    // put together by the council: { instruction, sources } (what the synthesizer is told, and the pages the members met). It searches nothing and
    // reads no address of its request (the members did); it has no history (the request says what it needs). With `resumeRun`, the council the
    // server holds, followed from its synthesis on.
    synthesis = null
  }) => {
    if (synthesis) webSearchEnabled = false;
    stepsShown = false;
    stop();
    const startedAt = now();
    runStartedAt = startedAt;
    latestProgress = {
      stage: 'preparing',
      message: getRuntimeText(uiLanguage, 'preparingRequest'),
      modelName: modelInfo?.name || conversation.model,
      startedAt,
      elapsedMs: 0,
      receivedChars: 0
    };
    const request = { userParts, modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, signal, uiLanguage, assistantMessageId, sequence, getHistorySourceIds, resumeRun, synthesis };
    const progress = (stage, message, extra) => renderProgress(targetElement, startedAt, stage, message, extra);
    // The wait row while the files, the search packet and the addresses of the message are prepared on this page.
    const prepareHere = (options) => {
      stop();
      progress('preparing', 'Checking model capabilities');
      startTicker(targetElement, startedAt);
      return buildSingleModelTranslatedRequestParts(userParts, modelInfo, signal, (stage, message) => progress(stage, message), { conversation, onSources: reply.addSearchSources, ...options });
    };

    // 1. What kind of reply this is.
    const prep = await prepareReply({ getConfig, supportsToolCalling, webResearch, serverReply, getWindow }, request);
    const { replyMode, researchByModel, serverSearches, serverPrepares } = prep;
    const reply = createReplyRecord({ userParts, synthesis, replyMode });
    if (prep.hasTranslationInputs) {
      reply.requestParts = await prepareHere({
        webSearchEnabled: webSearchEnabled && !researchByModel && !serverSearches,
        readLinkedPages: prep.readsAddresses
      });
    }

    // 2. The server makes the reply when it can (settings, the kind of reply and the account allow it, and it takes it); the page then only
    // follows what the server writes. Otherwise it is made here, as always.
    let serverRun = resumeRun;
    // The server was asked and did not take the reply: it is made on this device, and the reply says so.
    let madeHere = false;
    if (!serverRun && prep.plan) {
      ({ serverRun, madeHere } = await handOverToServer({ serverReply, getConfig, supportsVision }, { ...request, requestParts: reply.requestParts }, prep));
    }
    // The server did not take the reply (or there is no account to make it with): the search it was to make, and the files and addresses it
    // was to prepare, are done here, as before (the files not yet prepared: the message is prepared whole, not added to).
    const preparesHere = serverPrepares && !serverRun;
    if ((serverSearches || preparesHere) && !serverRun) {
      reply.requestParts = await prepareHere({
        webSearchEnabled: Boolean(webSearchEnabled && !researchByModel),
        readLinkedPages: prep.readsAddresses,
        ...(preparesHere ? {} : { baseParts: reply.requestParts })
      });
    }

    const view = createReplyLiveView({
      targetElement,
      getDocument,
      getConfig,
      language: uiLanguage,
      now,
      serverReply,
      serverRun,
      madeHere,
      getRunStartedAt: () => runStartedAt,
      onStepsShown: () => { stepsShown = true; }
    });
    const streamOptions = { modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, onSources: reply.addSearchSources, onSupports: (supports) => { reply.groundingSupports = supports; }, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER, ...prep.skillOptions,
      ...(synthesis ? { historyForApi: [], ignoreConversationWebSearch: true, requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS, additionalSystemInstruction: [prep.skillOptions.additionalSystemInstruction, synthesis.instruction].filter(Boolean).join('\n\n') } : {}) };
    // 3. Made here, or followed from the server.
    const local = createLocalReply({ streamApiCall, buildSingleModelTranslatedRequestParts, getConfig, webResearch, now }, { request, prep, reply, view, streamOptions });
    const runApiStream = serverRun
      ? (onChunk) => followServerReply(
        { serverReply, now, setRunStartedAt: (value) => { runStartedAt = value; }, getRunStartedAt: () => runStartedAt },
        { serverRun, reply, view, progress, signal, uiLanguage, assistantMessageId, targetElement, advanced: replyMode.advanced, runHere: local.runAdvanced },
        onChunk
      )
      : replyMode.advanced ? local.runAdvanced : local.runStandard;
    // The [n] an answer writes become small labels as it streams (and in the final view, from the saved sources).
    const stopCitations = watchCitations(targetElement, () => reply.searchSources, { document: getDocument(), language: uiLanguage });

    let fullResponse;
    let responseRenderedInRealtime = false;
    try {
      if (getOutputMode() === 'realtime') {
        stop();
        const realtimeProgress = {
          ...latestProgress,
          stage: 'streaming',
          message: undefined,
          elapsedMs: now() - runStartedAt
        };
        latestProgress = realtimeProgress;
        patchHTML(targetElement, renderSingleModelProgress(realtimeProgress));
        startTicker(targetElement, startedAt);
        fullResponse = await streamMarkdownResponse(
          targetElement,
          runApiStream,
          signal,
          {
            placeholderHTML: stepsShown ? '' : renderSingleModelProgress(realtimeProgress),
            onFirstChunk: stop,
            // A council's synthesis writes folded blocks (its comparison, the members' answers): one not yet closed is drawn closed, and one the
            // person opened stays open, instead of the text flickering in and out of it.
            preserveCouncilDetails: Boolean(synthesis)
          }
        );
        responseRenderedInRealtime = true;
      } else {
        fullResponse = await streamWithWaitRow(targetElement, startedAt, runApiStream, signal);
      }
    } finally {
      stop();
      stopCitations();
      view.close();
      // 4. What was thought, searched and run is kept with the reply (the run record), so it is still there after a reload.
      recordReplyRun({
        reply,
        thought: view.thought,
        answered: view.answered,
        advanced: replyMode.advanced,
        serverRun,
        madeHere,
        aborted: Boolean(signal?.aborted),
        elapsedMs: now() - runStartedAt
      });
    }

    return {
      fullResponse: composeReplyText({ reply, fullResponse, targetElement, aborted: Boolean(signal?.aborted), uiLanguage }),
      responseRenderedInRealtime,
      extraParts: reply.sandboxParts,
      pictureOffsets: reply.pictureOffsets
    };
  };

  // A reply shown only when it is whole (not as it streams): the wait row counts what arrived. Stopped by the person, what arrived is the reply.
  const streamWithWaitRow = async (targetElement, startedAt, runApiStream, signal) => {
    if (!progressTimer) {
      renderProgress(targetElement, startedAt, 'streaming', undefined);
      startTicker(targetElement, startedAt);
    }
    let receivedChars = 0;
    let bufferedResponse = '';
    let lastProgressAt = 0;
    const updateStreamingProgress = (chunk) => {
      const text = String(chunk || '');
      bufferedResponse += text;
      receivedChars += text.length;
      const currentTime = now();
      if (currentTime - lastProgressAt > 700) {
        lastProgressAt = currentTime;
        renderProgress(targetElement, startedAt, 'streaming', undefined, { receivedChars });
      }
    };
    try {
      return await runApiStream(updateStreamingProgress);
    } catch (error) {
      if (!signal?.aborted) throw error;
      return bufferedResponse;
    }
  };

  const completeView = async ({
    targetElement,
    fullResponse,
    signal,
    responseRenderedInRealtime
  }) => {
    if (responseRenderedInRealtime && targetElement.dataset.streamRendered === 'true') {
      restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement));
      return;
    }
    if (responseRenderedInRealtime) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    if (signal?.aborted) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    await playbackStreamingMarkdownResponse(
      targetElement,
      fullResponse,
      signal,
      false
    );
  };

  return {
    completeView,
    getLatestProgress() {
      return latestProgress;
    },
    run,
    stop
  };
}
