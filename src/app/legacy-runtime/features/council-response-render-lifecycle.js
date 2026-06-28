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
    contentDiv.innerHTML = renderCouncilProgress(progressState);
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
    contentDiv.innerHTML = renderCouncilProgress(latestCouncilProgress);
  });

  try {
    const councilResult = await runModelCouncil(
      userParts,
      signal,
      renderCouncilProgressState,
      renderCouncilSynthesisChunk
    );
    if (councilProgressTimer) {
      stopProgressTicker(councilProgressTimer);
      councilProgressTimer = null;
    }
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
