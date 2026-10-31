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
import { createPictureFlow } from './picture-flow.js';
import { replySteering } from '../features/reply-steering.js';
import { replyCut } from './reply-cut.js';
import { sendAnchor } from '../features/send-anchor.js';
import { liftSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { withProjectFiles } from '../projects/project-source-files.js';
import { projectOf } from '../projects/project-instructions.js';

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
  getDocument = () => globalThis.document,
  // ({ parts, firstNumber }) => the nodes of the cards of pictures a text model drew, bound and numbered: they are put in the reply as soon as they are made.
  mountPictures = null
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
    // The pictures of the project this chat is in go with the message, for a model that can see them (src/app/runtime/projects/project-source-files.js).
    // A model that calls tools looks into the files of the project by itself (project-files-access.js); what it cannot look into (a picture) goes with the message, for a model that can read it.
    const projectFiles = !synthesis && !resumeRun && projectOf(conversation)?.sources?.length ? await (await import('../projects/project-files-access.js')).createProjectFilesAccess({ conversation, toolsAllowed: Boolean(supportsToolCalling?.(modelInfo)) && !(webSearchEnabled && !webResearch?.canUse(modelInfo)) }) : null;
    if (!synthesis && !resumeRun) userParts = await withProjectFiles(userParts, conversation, modelInfo, { skipIds: projectFiles?.searchableIds, onPicked: ({ attached }) => projectFiles?.setAttached?.(attached) });
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
    const request = { userParts, modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, signal, uiLanguage, assistantMessageId, sequence, getHistorySourceIds, resumeRun, synthesis, projectFiles };
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
    const streamOptions = { projectFilesCatalog: projectFiles?.catalogText || '', modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, onSources: reply.addSearchSources, onSupports: (supports) => { reply.groundingSupports = supports; }, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER, ...prep.skillOptions,
      ...(synthesis ? { historyForApi: [], ignoreConversationWebSearch: true, requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS, additionalSystemInstruction: [prep.skillOptions.additionalSystemInstruction, synthesis.instruction].filter(Boolean).join('\n\n') } : {}) };
    // 3. Made here, or followed from the server.
    const local = createLocalReply({ streamApiCall, buildSingleModelTranslatedRequestParts, getConfig, webResearch, now }, { request, prep, reply, view, streamOptions });
    // A text model that may draw pictures: the words before a picture, the picture and the words after it are drawn in that order as they come (picture-flow.js).
    // (A page that joins the reply late is told where each picture stands, so it draws the same.)
    const flow = serverRun && !synthesis && mountPictures && serverReply?.hydrateParts && getConfig().toolModels?.image
      ? createPictureFlow({ document: getDocument(), targetElement, streamMarkdownResponse, signal, hydrateParts: (parts) => serverReply.hydrateParts(parts), mountPictures, getStage: () => view.stageElement() })
      : null;
    if (flow) {
      view.setStagePlace(flow.lastElement);
      const showEvent = view.event;
      view.event = (event) => {
        flow.handle(event);
        return showEvent(event);
      };
    }
    const runApiStream = serverRun
      ? (onChunk) => followServerReply(
        { serverReply, now, setRunStartedAt: (value) => { runStartedAt = value; }, getRunStartedAt: () => runStartedAt },
        { serverRun, reply, view, progress, signal, uiLanguage, assistantMessageId, targetElement, conversationId: conversation?.id, advanced: replyMode.advanced, runHere: local.runAdvanced },
        flow ? flow.wrap(onChunk) : onChunk
      )
      : replyMode.advanced ? local.runAdvanced : local.runStandard;
    // The [n] an answer writes become small labels as it streams (and in the final view, from the saved sources).
    const stopCitations = watchCitations(targetElement, () => reply.searchSources, { document: getDocument(), language: uiLanguage });

    let fullResponse;
    let responseRenderedInRealtime = false;
    let flowResult = null;
    // What the person adds in the box while a reply the server makes goes into it (features/reply-steering.js): its bubble stands under the reply until the reply takes the message and is cut
    // there (reply-cut.js). A reply made here, and a council's synthesis, take none.
    const steerSink = synthesis || !serverRun?.steer ? null : {
      push: async (text) => {
        const id = crypto.randomUUID();
        if ((await serverRun.steer(text, id))?.ok !== true) return false;
        replyCut.pending.setPlace(() => targetElement.closest?.('.message-item') || null);
        // Like any message the person sends, its bubble goes to the top of the chat.
        sendAnchor.anchorTo(replyCut.pending.add({ id, text }));
        return true;
      }
    };
    if (steerSink) replySteering.attach(steerSink);
    try {
      if (getOutputMode() === 'realtime' || flow) {
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
      if (steerSink) {
        replySteering.detach(steerSink);
        // A reply that was cut goes on in a new message, and what is still waiting waits on. At the end of the reply, what was added and never taken goes as the next message
        // (features/reply-steering.js).
        if (!reply.cut || signal?.aborted) {
          replyCut.pending.remove();
          replySteering.hold(reply.steersLeft, { stopped: Boolean(signal?.aborted) });
        }
      }
      // The last bubble is finished and every picture is in place before the step list goes.
      if (flow) flowResult = await flow.finish();
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

    const drewHere = Boolean(flowResult?.pictures.length);
    const composed = composeReplyText({ reply, fullResponse: drewHere ? flowResult.text : fullResponse, targetElement, aborted: Boolean(signal?.aborted), uiLanguage });
    // What the first bubble shows (the record above the words before the first picture): the rest is in the bubbles after the pictures.
    const answerStart = composed.length - liftSandboxRunBlock(composed).text.length;
    return {
      fullResponse: composed,
      viewResponse: drewHere ? composed.slice(0, answerStart + flowResult.headText.length) : null,
      picturesShown: drewHere && flowResult.shownAll,
      responseRenderedInRealtime,
      extraParts: reply.sandboxParts,
      // The reply was cut where the person's messages were taken: the message it goes on in (reply-cut.js).
      cut: signal?.aborted ? null : reply.cut || null,
      serverRun,
      pictureOffsets: drewHere ? flowResult.offsets : reply.pictureOffsets
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
