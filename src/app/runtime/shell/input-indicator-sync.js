// Puts the chips of the message box (learning, Noura, search, council, deep research) into their container: a chip that is no longer wanted slides out, a new
// one slides in, one whose markup changed is rewritten, and the box says whether it has any (`has-indicators`). Moved out of submit-input-council-lifecycle.js,
// which is at the limit of its size; the markup and the click handlers of each chip stay there.
export function syncInputIndicatorItems({ document, container, wrapper, activeIndicators }) {
  Array.from(container.children).forEach((child) => {
    if (!activeIndicators.has(child.id)) {
      child.classList.remove('enter');
      child.classList.add('exit');
      child.addEventListener('animationend', () => {
        child.remove();
        if (container.children.length === 0) {
          wrapper.classList.remove('has-indicators');
        }
      }, { once: true });
    }
  });
  activeIndicators.forEach((indicatorData) => {
    let existingIndicator = document.getElementById(indicatorData.id);
    if (existingIndicator?.classList.contains('exit')) {
      existingIndicator.remove();
      existingIndicator = null;
    }
    if (!existingIndicator) {
      const indicator = document.createElement('div');
      indicator.id = indicatorData.id;
      indicator.className = 'input-indicator-item flex items-center justify-between text-sm font-medium px-2 py-1 rounded-full enter';
      indicator.innerHTML = indicatorData.html;
      indicator.dataset.indicatorHtml = indicatorData.html;
      container.appendChild(indicator);
      indicatorData.eventListener(indicator);
    } else if (existingIndicator.dataset.indicatorHtml !== indicatorData.html) {
      existingIndicator.innerHTML = indicatorData.html;
      existingIndicator.dataset.indicatorHtml = indicatorData.html;
      indicatorData.eventListener(existingIndicator);
    }
  });
  if (activeIndicators.size > 0) {
    wrapper.classList.add('has-indicators');
  } else if (container.children.length === 0) {
    wrapper.classList.remove('has-indicators');
  }
}
