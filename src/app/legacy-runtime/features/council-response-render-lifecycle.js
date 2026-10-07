import { patchHTML } from '../../ui/dom/patch-html.js';

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

  const renderCouncilProgressState = (progressState) => {
    if (responseRenderedInRealtime && getOutputMode() === 'realtime') return;
    latestCouncilProgress = progressState;
    patchHTML(contentDiv, renderCouncilProgress(progressState));
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
    if (responseRenderedInRealtime && getOutputMode() === 'realtime') return;
    if (!latestCouncilProgress) return;
    const startedAt = latestCouncilProgress.startedAt || now();
    latestCouncilProgress = {
      ...latestCouncilProgress,
      tick: (latestCouncilProgress.tick || 0) + 1,
      elapsedMs: now() - startedAt
    };
    patchHTML(contentDiv, renderCouncilProgress(latestCouncilProgress));
  });

  // A model leaves when the person asks (and is sure): the panel is drawn on a timer, so the one listener is on the panel and finds the button by its mark.
  contentDiv.addEventListener?.('click', async (event) => {
    const id = event.target?.closest?.('[data-council-exit]')?.dataset?.councilExit;
    const progress = latestCouncilProgress;
    if (!id || !progress?.exit) return;
    const modelName = progress.modelStates?.find((state) => state.modelId === id)?.modelName || id;
    if (await confirmExit({ modelName })) progress.exit(id);
  });

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
        renderCouncilSynthesisChunk
      );
    } catch (error) {
      if (!signal?.aborted) throw error;
      return finishInterruptedResponse();
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
    return {
      fullResponse,
      metadata: councilResult.metadata,
      responseRenderedInRealtime
    };
  } finally {
    if (councilProgressTimer) {
      stopProgressTicker(councilProgressTimer);
    }
  }
}
