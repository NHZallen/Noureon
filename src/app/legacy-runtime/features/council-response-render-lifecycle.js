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
  let translationStatus = null;
  const disclosureState = new Map([
    ['preparation', true],
    ['models', true]
  ]);

  const withPresentationStatus = (progressState) => {
    if (progressState?.stage === 'translation') {
      translationStatus = { status: 'running' };
    } else if (translationStatus?.status === 'running') {
      translationStatus = { status: 'done' };
    }
    return translationStatus
      ? { ...progressState, translation: { ...translationStatus } }
      : progressState;
  };

  const captureDisclosureState = () => {
    if (typeof contentDiv.querySelectorAll !== 'function') return;
    contentDiv.querySelectorAll('[data-council-status-toggle]').forEach((toggle) => {
      const key = toggle.dataset.councilStatusToggle;
      if (key) disclosureState.set(key, toggle.getAttribute('aria-expanded') === 'true');
    });
  };

  const applyDisclosureState = (toggle, isOpen) => {
    const key = toggle.dataset.councilStatusToggle;
    const group = toggle.closest?.('[data-council-status-group]');
    const body = group?.querySelector?.(`[data-council-status-body="${key}"]`);
    toggle.setAttribute('aria-expanded', String(isOpen));
    group?.classList.toggle('is-open', isOpen);
    body?.setAttribute('aria-hidden', String(!isOpen));
  };

  const bindDisclosureControls = () => {
    if (typeof contentDiv.querySelectorAll !== 'function') return;
    contentDiv.querySelectorAll('[data-council-status-toggle]').forEach((toggle) => {
      const key = toggle.dataset.councilStatusToggle;
      const isOpen = disclosureState.get(key) ?? true;
      applyDisclosureState(toggle, isOpen);
      toggle.addEventListener('click', () => {
        const nextOpen = toggle.getAttribute('aria-expanded') !== 'true';
        disclosureState.set(key, nextOpen);
        applyDisclosureState(toggle, nextOpen);
      });
    });
  };

  const renderProgressView = (progressState) => {
    captureDisclosureState();
    contentDiv.innerHTML = renderCouncilProgress(progressState);
    bindDisclosureControls();
  };

  const renderCouncilProgressState = (progressState) => {
    if (responseRenderedInRealtime && getOutputMode() === 'realtime') return;
    latestCouncilProgress = withPresentationStatus(progressState);
    renderProgressView(latestCouncilProgress);
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
    renderProgressView(latestCouncilProgress);
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
