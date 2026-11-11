// The small word that comes up when the pointer rests on a button that has no word of its own (docs/superpowers/specs/2026-11-11-interaction-overhaul-design.md §5, phase 7).
// One listener for the whole page, so every icon button has it, the ones added later too. The word is what the button already says to a screen reader: `data-tip` (a tip with
// more in it, such as the mic and its key), else `aria-label`, else `title`. The browser's own `title` bubble would come up beside it, so the title is moved to `aria-label` first.
//
// The first tip waits a little (a pointer crossing the page lights nothing); once one has been shown, the next button along the row shows its tip at once and without motion, which is
// what makes a row of icons quick to read. A mouse only: a finger has no hover. A key that moves the focus onto a button shows it at once as well. Page only.

const SHOW_DELAY_MS = 350;
const CHAIN_MS = 450; // a tip that follows another this soon is shown at once
const GAP = 8;
const MARGIN = 8;

const labelOf = (element) => (element.dataset?.tip || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim();

// A button that already says what it does in words needs no tip.
const hasWords = (element) => {
  const text = (element.innerText ?? element.textContent ?? '').trim();
  return text.length > 0;
};

export function installIconTooltips(doc = document) {
  const view = doc.defaultView;
  if (!view || doc.documentElement.dataset.iconTooltips) return () => {};
  doc.documentElement.dataset.iconTooltips = 'true';
  const canHover = () => Boolean(view.matchMedia?.('(hover: hover)').matches);

  let tip = null;
  let current = null;
  let timer = 0;
  let lastHiddenAt = -Infinity;

  const candidate = (target) => {
    const element = target instanceof view.Element ? target.closest('button, [role="button"], summary, a[aria-label]') : null;
    if (!element || element.closest('[data-no-tip]')) return null;
    return element;
  };

  // The browser's own bubble would come up beside this one: its text moves to `aria-label` (which a screen reader reads as it read the title).
  const takeTitle = (element) => {
    const title = element.getAttribute('title');
    if (title == null) return;
    if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', title);
    element.removeAttribute('title');
  };

  const place = (element, node) => {
    const rect = element.getBoundingClientRect();
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    let side = 'bottom';
    if (element.matches('.rail-btn') && rect.right + GAP + width < view.innerWidth) side = 'right';
    else if (rect.bottom + GAP + height > view.innerHeight - MARGIN) side = 'top';
    let left;
    let top;
    if (side === 'right') { left = rect.right + GAP; top = rect.top + (rect.height - height) / 2; }
    else {
      left = rect.left + (rect.width - width) / 2;
      top = side === 'top' ? rect.top - GAP - height : rect.bottom + GAP;
    }
    left = Math.max(MARGIN, Math.min(left, view.innerWidth - width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, view.innerHeight - height - MARGIN));
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
    // It grows from the side that is at the button.
    node.style.transformOrigin = side === 'right' ? 'left center' : side === 'top' ? 'center bottom' : 'center top';
  };

  const hide = () => {
    view.clearTimeout(timer);
    timer = 0;
    if (tip) {
      tip.remove();
      tip = null;
      lastHiddenAt = view.performance.now();
    }
    current = null;
  };

  const show = (element, { instant }) => {
    const text = labelOf(element);
    if (!text || !element.isConnected) return;
    takeTitle(element);
    tip?.remove();
    tip = doc.createElement('div');
    tip.className = `icon-tip${instant ? ' is-instant' : ''}`;
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    doc.body.appendChild(tip);
    place(element, tip);
    current = element;
    // One frame later, so it comes up instead of appearing.
    if (instant) tip.classList.add('is-shown');
    else view.requestAnimationFrame(() => tip?.classList.add('is-shown'));
  };

  const schedule = (element, { immediate = false } = {}) => {
    if (element === current) return;
    hide();
    if (!labelOf(element) || hasWords(element)) return;
    takeTitle(element);
    const chained = view.performance.now() - lastHiddenAt < CHAIN_MS;
    if (immediate || chained) { show(element, { instant: true }); return; }
    current = element;
    timer = view.setTimeout(() => show(element, { instant: false }), SHOW_DELAY_MS);
  };

  const onOver = (event) => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (!canHover()) return;
    const element = candidate(event.target);
    if (!element) { if (current && !tip?.contains(event.target)) hide(); return; }
    schedule(element);
  };
  const onOut = (event) => {
    if (!current) return;
    const to = event.relatedTarget;
    if (to instanceof view.Node && current.contains(to)) return;
    hide();
  };
  const onFocus = (event) => {
    const element = candidate(event.target);
    if (!element || !element.matches?.(':focus-visible')) return;
    schedule(element, { immediate: true });
  };
  const onGone = () => hide();

  doc.addEventListener('pointerover', onOver, true);
  doc.addEventListener('pointerout', onOut, true);
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('focusout', onGone, true);
  doc.addEventListener('pointerdown', onGone, true);
  doc.addEventListener('keydown', onGone, true);
  doc.addEventListener('scroll', onGone, true);
  view.addEventListener('blur', onGone);

  return () => {
    hide();
    doc.removeEventListener('pointerover', onOver, true);
    doc.removeEventListener('pointerout', onOut, true);
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('focusout', onGone, true);
    doc.removeEventListener('pointerdown', onGone, true);
    doc.removeEventListener('keydown', onGone, true);
    doc.removeEventListener('scroll', onGone, true);
    view.removeEventListener('blur', onGone);
    delete doc.documentElement.dataset.iconTooltips;
  };
}
