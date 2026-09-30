import { patchHTML } from '../../ui/dom/patch-html.js';
import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';
import { resolveReplyMode } from '../../runtime/sandbox/file-mode.js';
import { browserSupportsSandbox } from '../../runtime/sandbox/sandbox-protocol.js';
import { mayNeedFileGuidance } from '../../ui/files/file-intent.js';
import { formatSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { collectSandboxInputs, createSandboxFileParts, sandboxDocumentBlocks, withoutDuplicatedFileBlocks } from '../../ui/sandbox/sandbox-files.js';
import { createSandboxLedger } from '../../ui/sandbox/sandbox-ledger.js';
import { createThinkingBlock } from '../../ui/thinking/thinking-block.js';

// Advanced mode (Python in the browser) is loaded only for replies that use it.
const loadSandboxReply = () => Promise.all([
  import('../../runtime/sandbox/sandbox-reply.js'),
  import('../../runtime/sandbox/python-sandbox.js')
]);

// A switch to Standard mode is worth saying only when the request looks like
// a task Advanced mode is for: files, data or attachments.
const looksLikeFileTask = (parts = []) => parts.some((part) => part?.inlineData)
  || mayNeedFileGuidance(parts.map((part) => part?.text || '').join('\n'));

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
  getWindow = () => globalThis.window,
  getDocument = () => globalThis.document
}) {
  let progressTimer = null;
  let latestProgress = null;

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
      elapsedMs: now() - startedAt,
      ...extra
    };
    patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    return latestProgress;
  };

  const startTicker = (targetElement, startedAt) => {
    progressTimer = startProgressTicker(() => {
      latestProgress = {
        ...latestProgress,
        elapsedMs: now() - startedAt
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
    uiLanguage
  }) => {
    stop();
    const startedAt = now();
    latestProgress = {
      stage: 'preparing',
      message: getRuntimeText(uiLanguage, 'preparingRequest'),
      modelName: modelInfo?.name || conversation.model,
      startedAt,
      elapsedMs: 0,
      receivedChars: 0
    };

    const hasTranslationInputs = userParts.some((part) => part.inlineData) ||
      Boolean(webSearchEnabled);
    let requestParts = userParts;
    if (hasTranslationInputs) {
      renderProgress(
        targetElement,
        startedAt,
        'preparing',
        'Checking model capabilities'
      );
      startTicker(targetElement, startedAt);
      requestParts = await buildSingleModelTranslatedRequestParts(
        userParts,
        modelInfo,
        signal,
        (stage, message) => renderProgress(targetElement, startedAt, stage, message),
        { webSearchEnabled, conversation }
      );
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
        renderProgress(
          targetElement,
          startedAt,
          'streaming',
          undefined,
          { receivedChars }
        );
      }
    };
    const streamOptions = { modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER };
    const replyMode = supportsToolCalling ? resolveReplyMode({
      conversation,
      config: getConfig(),
      modelInfo,
      supportsToolCalling,
      browserSupported: browserSupportsSandbox(getWindow())
    }) : { advanced: false, reason: null };
    // The run record (or the reason for Standard mode) kept above the answer.
    let sandboxRun = !replyMode.advanced && replyMode.reason && looksLikeFileTask(userParts)
      ? { status: 'done', steps: [], fallback: replyMode.reason }
      : null;
    // Files the run made, kept as parts of the reply message.
    let sandboxParts = [];
    // Documents the code handed to the design system, as file blocks.
    let sandboxDocuments = '';
    // The step list in the message, above the answer: what the model and Python are doing now.
    let liveRun = null;
    const stepList = () => {
      if (!liveRun && targetElement.parentElement) {
        liveRun = createSandboxLedger({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language: uiLanguage });
      }
      return liveRun;
    };
    const showRunStatus = () => {};
    // A reply without Python shows the model's thinking above the answer, as it streams,
    // and folds it when the answer starts.
    let thinkingBlock = null;
    let thought = { text: '', kind: 'raw', startedAt: null, endedAt: null };
    // Whether any of the answer has arrived (stopping before it leaves the thinking interrupted).
    let answered = false;
    const showThinking = (chunk, kind) => {
      if (!chunk) return;
      thought.startedAt ??= now();
      thought = { ...thought, text: (thought.text + chunk).slice(0, 12_000), kind: kind || thought.kind };
      if (!thinkingBlock && targetElement.parentElement) {
        thinkingBlock = createThinkingBlock({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language: uiLanguage, now });
      }
      thinkingBlock?.add(chunk, kind);
    };
    // The answer has started: the thinking is over.
    const endThinking = () => {
      if (thought.startedAt !== null) thought.endedAt ??= now();
      thinkingBlock?.collapse();
    };
    const runApiStream = replyMode.advanced
      ? async (onChunk) => {
        const [{ runSandboxReply }, { getPythonSandbox }] = await loadSandboxReply();
        const result = await runSandboxReply({
          streamApiCall,
          requestParts,
          onChunk,
          signal,
          requestOptions: streamOptions,
          getSandbox: (options) => getPythonSandbox({ ...options, language: getConfig().aiDefaultLanguage || uiLanguage }),
          language: uiLanguage,
          provider: modelInfo?.provider,
          inputFiles: collectSandboxInputs(conversation, userParts),
          designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
          onStatus: showRunStatus,
          onEvent: (event) => stepList()?.event(event)
        });
        sandboxRun = result.run;
        // Word and PowerPoint files made freely get the app's fonts embedded.
        if (result.run?.steps?.length) {
          await import('../../ui/sandbox/office-fonts.js')
            .then((module) => module.embedFontsInRunOutputs(result.run))
            .catch(() => {});
        }
        sandboxParts = createSandboxFileParts(result.run);
        sandboxDocuments = sandboxDocumentBlocks(result.run);
        return withoutDuplicatedFileBlocks(result.text, sandboxParts.map((part) => part.sandboxFile.name));
      }
      : (onChunk) => streamApiCall(requestParts, (chunk) => {
        answered = true;
        endThinking();
        onChunk(chunk);
      }, signal, false, { ...streamOptions, onReasoning: showThinking });

    let fullResponse;
    let responseRenderedInRealtime = false;
    try {
      if (getOutputMode() === 'realtime') {
        stop();
        const realtimeProgress = {
          ...latestProgress,
          stage: 'streaming',
          message: undefined,
          elapsedMs: now() - startedAt
        };
        latestProgress = realtimeProgress;
        patchHTML(targetElement, renderSingleModelProgress(realtimeProgress));
        startTicker(targetElement, startedAt);
        fullResponse = await streamMarkdownResponse(
          targetElement,
          runApiStream,
          signal,
          {
            placeholderHTML: renderSingleModelProgress(realtimeProgress),
            onFirstChunk: stop
          }
        );
        responseRenderedInRealtime = true;
      } else {
        if (!progressTimer) {
          renderProgress(
            targetElement,
            startedAt,
            'streaming',
            undefined
          );
          startTicker(targetElement, startedAt);
        }
        try {
          fullResponse = await runApiStream(updateStreamingProgress);
        } catch (error) {
          if (!signal?.aborted) throw error;
          fullResponse = bufferedResponse;
        }
      }
    } finally {
      stop();
      liveRun?.remove();
      // What was thought is kept with the reply (the run record), so it is still there after a reload.
      endThinking();
      thinkingBlock?.remove();
      if (thought.text && !replyMode.advanced) {
        sandboxRun = { status: 'done', steps: [], ...(sandboxRun || {}), thought: thought.text, thoughtKind: thought.kind, thoughtMs: thought.endedAt - thought.startedAt, ...(signal?.aborted && !answered ? { thoughtInterrupted: true } : {}) };
      }
    }

    // Stopped while thinking, with nothing else to show: the reply is the interrupted thinking.
    if (!String(fullResponse || '').trim() && !sandboxRun?.steps?.length && !sandboxRun?.thought) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(getRuntimeText(uiLanguage, 'emptyResponse'));
    }
    if (sandboxRun) {
      fullResponse = `${formatSandboxRunBlock(sandboxRun)}${fullResponse || ''}${sandboxDocuments ? `

${sandboxDocuments}` : ''}`;
      // The final view is drawn again so the run row appears above the answer.
      if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    }

    return {
      fullResponse,
      responseRenderedInRealtime,
      extraParts: sandboxParts
    };
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
