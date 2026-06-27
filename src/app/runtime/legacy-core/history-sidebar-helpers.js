export function createHistorySidebarHelpers({
  elements,
  requestAnimationFrame,
  setupMessageIntersectionObserver
}) {
  function toggleHistorySidebar(show) {
    const { historySidebar, historySidebarOverlay } = elements;
    if (show) {
      requestAnimationFrame(() => {
        setupMessageIntersectionObserver();
      });
      historySidebarOverlay.classList.remove('hidden');
      requestAnimationFrame(() => {
        historySidebar.classList.add('visible');
        historySidebarOverlay.classList.add('visible');
      });
    } else {
      historySidebar.classList.remove('visible');
      historySidebarOverlay.classList.remove('visible');
      historySidebarOverlay.addEventListener('transitionend', () => {
        if (!historySidebarOverlay.classList.contains('visible')) {
          historySidebarOverlay.classList.add('hidden');
        }
      }, { once: true });
    }
  }

  return { toggleHistorySidebar };
}
