import { patchHTML } from '../../ui/dom/patch-html.js';
import { formatSandboxRunBlock, hasSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { withCouncilRecord } from '../../ui/council/council-record.js';

export async function runCouncilResponseRenderLifecycle({
  contentDiv,
  userParts,
  signal,
  getOutputMode,
  runModelCouncil,
  renderCouncilProgress,
  createStreamingMarkdownRenderer,
  appendRendererTextGradually,
  startProgressTicker,
  stopProgressTicker,
  setCouncilRunning,
  renderCouncilControls,
  renderInputIndicators,
  requestFrame,
  // Asks the person whether a model may leave the council (resolves true when it may): { modelName } -> Promise<boolean>.
  confirmExit = async () => false,
  // The synthesis as a reply (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.2): the page's reply, drawn in this message, given
  // { targetElement, signal, userParts, ... } (a request of the council, or the council the server holds, followed from its synthesis on);
  // resolves what the reply resolves ({ fullResponse, extraParts, responseRenderedInRealtime }). Without it the synthesis is one call, written here.
  continueWithReply = null,
  now = () => Date.now()
}) {
  setCouncilRunning(true);
  renderCouncilControls();
  renderInputIndicators();

  let councilProgressTimer = null;
  let latestCouncilProgress = null;
  let responseRenderedInRealtime = false;
  let realtimeCouncilText = '';
  let realtimeCouncilRenderer = null;
  // The synthesis was handed to a reply: the message is the reply's from then on.
  let handedOver = false;
  // The members the person opened to what they searched and read (kept as the panel is drawn again).
  const openMembers = new Set();

  const renderCouncilProgressState = (progressState) => {
    if (handedOver) return;
    if (responseRenderedInRealtime && getOutputMode() === 'realtime') return;
    latestCouncilProgress = progressState;
    patchHTML(contentDiv, renderCouncilProgress({ ...progressState, openMembers }));
  };

  const renderCouncilSynthesisChunk = (chunk) => {
    if (getOutputMode() !== 'realtime') return;
    if (!responseRenderedInRealtime) {
      if (councilProgressTimer) {
        stopProgressTicker(councilProgressTimer);
        councilProgressTimer = null;
      }
      contentDiv.innerHTML = '';
      realtimeCouncilRenderer = createStreamingMarkdownRenderer(contentDiv, { preserveCouncilDetails: true });
      responseRenderedInRealtime = true;
    }
    realtimeCouncilText += chunk || '';
    realtimeCouncilRenderer?.appendText(chunk || '');
  };

  councilProgressTimer = startProgressTicker(() => {
    if (handedOver) return;
    if (responseRenderedInRealtime && getOutputMode() === 'realtime') return;
    if (!latestCouncilProgress) return;
    const startedAt = latestCouncilProgress.startedAt || now();
    latestCouncilProgress = {
      ...latestCouncilProgress,
      tick: (latestCouncilProgress.tick || 0) + 1,
      elapsedMs: now() - startedAt
    };
    patchHTML(contentDiv, renderCouncilProgress({ ...latestCouncilProgress, openMembers }));
  });

  // A model leaves when the person asks (and is sure): the panel is drawn on a timer, so the one listener is on the panel and finds the button by its mark.
  contentDiv.addEventListener?.('click', async (event) => {
    // A member opened (or closed) to what it searched and read.
    const member = event.target?.closest?.('[data-council-member]')?.dataset?.councilMember;
    if (member && latestCouncilProgress && !handedOver) {
      if (openMembers.has(member)) openMembers.delete(member);
      else openMembers.add(member);
      patchHTML(contentDiv, renderCouncilProgress({ ...latestCouncilProgress, openMembers }));
      return;
    }
    const id = event.target?.closest?.('[data-council-exit]')?.dataset?.councilExit;
    const progress = latestCouncilProgress;
    if (!id || !progress?.exit) return;
    const modelName = progress.modelStates?.find((state) => state.modelId === id)?.modelName || id;
    if (await confirmExit({ modelName })) progress.exit(id);
  });

  // The council's panel gives way to the reply that makes the synthesis.
  const continueAsReply = async (options) => {
    handedOver = true;
    if (councilProgressTimer) {
      stopProgressTicker(councilProgressTimer);
      councilProgressTimer = null;
    }
    contentDiv.innerHTML = '';
    // The timeline stays above the reply, at its last stage, until the reply is written (the saved message has its own line then).
    let held = null;
    const document = contentDiv.ownerDocument;
    if (latestCouncilProgress && document?.createElement && contentDiv.parentElement) {
      held = document.createElement('div');
      held.className = 'council-tl-hold';
      held.innerHTML = renderCouncilProgress({ ...latestCouncilProgress, stage: 'synthesis', elapsedMs: undefined, exit: null, openMembers: new Set() });
      contentDiv.parentElement.insertBefore(held, contentDiv);
    }
    try {
      const made = await continueWithReply({ targetElement: contentDiv, signal, ...options });
      return { text: String(made?.fullResponse ?? ''), extraParts: made?.extraParts || [] };
    } finally {
      held?.remove();
    }
  };
  const handOver = typeof continueWithReply === 'function' ? {
    synthesize: ({ parts, instruction, sources, synthesizer, conversation, onMemoryContextResolved }) => continueAsReply({ userParts: parts, modelInfo: synthesizer, conversation, onMemoryContextResolved, synthesis: { instruction, sources } }),
    followSynthesis: (run) => continueAsReply({ userParts, resumeRun: run, synthesis: { instruction: '', sources: [] } })
  } : {};

  try {
    const finishInterruptedResponse = () => {
      const visibleText = realtimeCouncilRenderer?.getText?.() || realtimeCouncilText;
      if (!String(visibleText || '').trim()) throw new DOMException('Aborted', 'AbortError');
      realtimeCouncilRenderer?.finish({ renderFormulas: true });
      return {
        fullResponse: visibleText,
        metadata: null,
        responseRenderedInRealtime: true
      };
    };
    let councilResult;
    try {
      councilResult = await runModelCouncil(
        userParts,
        signal,
        renderCouncilProgressState,
        renderCouncilSynthesisChunk,
        handOver
      );
    } catch (error) {
      if (!signal?.aborted) throw error;
      return finishInterruptedResponse();
    }
    // The synthesis was a reply: what it wrote (its step record, its files) is the message, with what the council adds after it. It is drawn
    // again whole (the council's blocks after the answer, the sources of the members).
    // What the message keeps of a council held here (one the server held has it already): its line, opening to its timeline.
    const councilElapsed = now() - (latestCouncilProgress?.startedAt || now());
    const recorded = (text) => (councilResult?.record ? withCouncilRecord(text, councilResult.record, { elapsedMs: councilElapsed, madeHere: councilResult.madeHere === true }) : text);
    if (councilResult?.synthesis) {
      const sources = Array.isArray(councilResult.sources) ? councilResult.sources : [];
      const text = String(councilResult.text || '');
      if (contentDiv?.dataset) contentDiv.dataset.streamRendered = 'false';
      return {
        fullResponse: recorded(sources.length && !hasSandboxRunBlock(text) ? `${formatSandboxRunBlock({ status: 'done', steps: [], sources })}${text}` : text),
        metadata: councilResult.metadata,
        extraParts: [...(councilResult.synthesis.extraParts || []), ...(councilResult.extraParts || [])],
        responseRenderedInRealtime: true
      };
    }
    if (councilProgressTimer) {
      stopProgressTicker(councilProgressTimer);
      councilProgressTimer = null;
    }
    if (signal?.aborted) return finishInterruptedResponse();
    const fullResponse = councilResult.text;
    if (getOutputMode() === 'realtime') {
      if (!realtimeCouncilRenderer) {
        contentDiv.innerHTML = '';
        realtimeCouncilRenderer = createStreamingMarkdownRenderer(contentDiv, { preserveCouncilDetails: true });
        responseRenderedInRealtime = true;
      }
      const remainingCouncilText = fullResponse.slice(realtimeCouncilText.length);
      if (remainingCouncilText) {
        await appendRendererTextGradually(
          realtimeCouncilRenderer,
          remainingCouncilText,
          signal,
          18,
          requestFrame
        );
      }
      if (signal?.aborted) return finishInterruptedResponse();
      realtimeCouncilRenderer.finish({ renderFormulas: true });
    }
    // The pages the members met are the reply's sources (its [n] link to them): kept at the head of the message, and the view is drawn again with them.
    const sources = Array.isArray(councilResult.sources) ? councilResult.sources : [];
    if ((sources.length || councilResult.record) && contentDiv?.dataset) contentDiv.dataset.streamRendered = 'false';
    return {
      fullResponse: recorded(sources.length && !hasSandboxRunBlock(fullResponse) ? `${formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: councilElapsed, sources })}${fullResponse}` : fullResponse),
      metadata: councilResult.metadata,
      ...(councilResult.extraParts?.length ? { extraParts: councilResult.extraParts } : {}),
      responseRenderedInRealtime
    };
  } finally {
    if (councilProgressTimer) {
      stopProgressTicker(councilProgressTimer);
    }
  }
}
