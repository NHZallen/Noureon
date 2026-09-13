const DESKTOP_QUERY = '(min-width: 769px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DOCKING_DURATION_MS = 420;
const EMPTY_COMPOSER_VERTICAL_RATIO = 0.54;

export const deriveDesktopComposerLayout = ({ conversation, isDesktop }) => {
  if (!isDesktop) return 'mobile';
  if (!conversation || conversation.archived) return 'docked';
  return Array.isArray(conversation.messages) && conversation.messages.length === 0
    ? 'empty'
    : 'docked';
};

export function createDesktopComposerLayout({
  window,
  elements,
  getActiveConversation,
  ResizeObserver = window?.ResizeObserver,
  requestFrame = window?.requestAnimationFrame?.bind(window) || ((callback) => callback()),
  cancelFrame = window?.cancelAnimationFrame?.bind(window) || (() => {}),
  scheduleTimeout = window?.setTimeout?.bind(window) || globalThis.setTimeout,
  clearScheduledTimeout = window?.clearTimeout?.bind(window) || globalThis.clearTimeout
} = {}) {
  const workspace = elements?.chatWorkspace;
  const chatContainer = elements?.chatContainer;
  const inputBarContainer = elements?.inputBarContainer;
  const desktopMedia = window?.matchMedia?.(DESKTOP_QUERY);
  const reducedMotionMedia = window?.matchMedia?.(REDUCED_MOTION_QUERY);
  let measurementFrame = null;
  let dockingTimer = null;
  let resizeObserver = null;
  let emptyComposerBaselineHeight = null;
  let destroyed = false;

  const setMode = (mode, { animate = false } = {}) => {
    if (!workspace || destroyed) return mode;
    workspace.classList.toggle('composer-layout-animate', Boolean(animate));
    workspace.dataset.composerLayout = mode;
    return mode;
  };

  const measureEmptyOffset = () => {
    measurementFrame = null;
    if (destroyed || !workspace || !chatContainer || !inputBarContainer || !desktopMedia?.matches) return;

    const composerWidth = Number(inputBarContainer.firstElementChild?.offsetWidth)
      || Number(inputBarContainer.offsetWidth)
      || 0;
    if (composerWidth > 0) {
      workspace.style.setProperty('--desktop-composer-menu-width', `${Math.round(composerWidth)}px`);
    }

    const chatTop = Number(chatContainer.offsetTop) || 0;
    const chatHeight = Number(chatContainer.clientHeight) || Number(chatContainer.offsetHeight) || 0;
    const composerTop = Number(inputBarContainer.offsetTop) || 0;
    const composerHeight = Number(inputBarContainer.offsetHeight) || 0;
    if (chatHeight <= 0 || composerHeight <= 0) return;

    emptyComposerBaselineHeight = Math.min(emptyComposerBaselineHeight ?? composerHeight, composerHeight, 96);
    const targetCenter = chatTop + (chatHeight * EMPTY_COMPOSER_VERTICAL_RATIO);
    const anchoredComposerCenter = composerTop + (emptyComposerBaselineHeight * 0.5);
    const offset = Math.min(0, Math.round(targetCenter - anchoredComposerCenter));
    workspace.style.setProperty('--desktop-composer-empty-offset', `${offset}px`);
  };

  const queueMeasurement = () => {
    if (destroyed || measurementFrame !== null) return;
    measurementFrame = requestFrame(measureEmptyOffset);
  };

  const clearDockingTimer = () => {
    if (dockingTimer === null) return;
    clearScheduledTimeout(dockingTimer);
    dockingTimer = null;
  };

  const finishDocking = () => {
    clearDockingTimer();
    if (!workspace || workspace.dataset.composerLayout !== 'docking') return;
    setMode('docked');
  };

  const sync = ({ animate = false } = {}) => {
    clearDockingTimer();
    const mode = deriveDesktopComposerLayout({
      conversation: getActiveConversation?.(),
      isDesktop: Boolean(desktopMedia?.matches)
    });
    setMode(mode, { animate });
    if (mode !== 'mobile') queueMeasurement();
    if (mode === 'mobile') {
      workspace?.style?.removeProperty('--desktop-composer-empty-offset');
      workspace?.style?.removeProperty('--desktop-composer-menu-width');
    }
    return mode;
  };

  const beginFirstSubmit = () => {
    const conversation = getActiveConversation?.();
    const isFirstMessage = Array.isArray(conversation?.messages) && conversation.messages.length === 0;
    if (!desktopMedia?.matches || !isFirstMessage || workspace?.dataset.composerLayout !== 'empty') {
      return false;
    }

    if (reducedMotionMedia?.matches) {
      setMode('docked');
      return true;
    }

    queueMeasurement();
    void inputBarContainer?.offsetWidth;
    setMode('docking', { animate: true });
    clearDockingTimer();
    dockingTimer = scheduleTimeout(finishDocking, DOCKING_DURATION_MS);
    return true;
  };

  const handleTransitionEnd = (event) => {
    if (event?.target !== inputBarContainer || event?.propertyName !== 'transform') return;
    finishDocking();
  };

  const handleViewportChange = () => sync({ animate: false });
  inputBarContainer?.addEventListener?.('transitionend', handleTransitionEnd);
  desktopMedia?.addEventListener?.('change', handleViewportChange);

  if (typeof ResizeObserver === 'function' && chatContainer && inputBarContainer) {
    resizeObserver = new ResizeObserver(queueMeasurement);
    resizeObserver.observe(chatContainer);
    resizeObserver.observe(inputBarContainer);
  } else {
    window?.addEventListener?.('resize', queueMeasurement);
  }

  const destroy = () => {
    destroyed = true;
    clearDockingTimer();
    if (measurementFrame !== null) cancelFrame(measurementFrame);
    measurementFrame = null;
    resizeObserver?.disconnect?.();
    inputBarContainer?.removeEventListener?.('transitionend', handleTransitionEnd);
    desktopMedia?.removeEventListener?.('change', handleViewportChange);
    window?.removeEventListener?.('resize', queueMeasurement);
  };

  return {
    beginFirstSubmit,
    destroy,
    measureEmptyOffset,
    sync
  };
}
