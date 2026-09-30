// How the glass header buttons answer a finger, after iOS liquid glass: pressing lifts and lights the
// button (the light follows the finger), dragging pulls it toward the finger and stretches it along the
// pull like a drop, and letting go springs it back. Letting go away from the button cancels the tap.
// One delegated listener, so buttons added later (the temporary chat controls) work without wiring.

export const GLASS_BUTTON_SELECTOR = [
  '#menu-toggle-btn',
  '#new-chat-btn-header',
  '#api-key-warning-badge',
  '#temporary-chat-entry-button',
  '#temporary-memory-button',
  '#save-temporary-chat-button'
].map((id) => `#chat-workspace > header ${id}`).join(', ');

const PRESS_SCALE = 1.1;
const MAX_PULL = 22;
const PULL_RANGE = 60;
const MAX_STRETCH = 0.2;
const SQUASH = 0.06;
const CANCEL_MARGIN = 14;

export const glassPullState = (dx, dy) => {
  const pull = (delta) => Math.sign(delta) * MAX_PULL * (1 - Math.exp(-Math.abs(delta) / PULL_RANGE));
  const ax = Math.min(Math.abs(dx) / PULL_RANGE, 1.2);
  const ay = Math.min(Math.abs(dy) / PULL_RANGE, 1.2);
  return {
    translate: `${pull(dx).toFixed(2)}px ${pull(dy).toFixed(2)}px`,
    scale: `${(PRESS_SCALE + MAX_STRETCH * ax - SQUASH * ay).toFixed(3)} ${(PRESS_SCALE + MAX_STRETCH * ay - SQUASH * ax).toFixed(3)}`
  };
};

export function installGlassButtonFeel(doc = document) {
  const view = doc.defaultView;
  if (!view || doc.documentElement.dataset.glassButtonFeel) return () => {};
  doc.documentElement.dataset.glassButtonFeel = 'true';
  let pressed = null;

  const reducedMotion = () => Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const placeLight = (rect, x, y) => {
    pressed.button.style.setProperty('--glass-x', `${Math.round(((x - rect.left) / rect.width) * 100)}%`);
    pressed.button.style.setProperty('--glass-y', `${Math.round(((y - rect.top) / rect.height) * 100)}%`);
  };

  const onDown = (event) => {
    if (pressed || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const button = event.target.closest?.(GLASS_BUTTON_SELECTOR);
    if (!button) return;
    const rect = button.getBoundingClientRect();
    pressed = { button, pointerId: event.pointerId, rect, outside: false };
    button.classList.add('is-glass-pressed');
    placeLight(rect, event.clientX, event.clientY);
  };

  const onMove = (event) => {
    if (!pressed || event.pointerId !== pressed.pointerId) return;
    const { button, rect } = pressed;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    pressed.outside = Math.abs(dx) > rect.width / 2 + CANCEL_MARGIN || Math.abs(dy) > rect.height / 2 + CANCEL_MARGIN;
    placeLight(rect, event.clientX, event.clientY);
    if (reducedMotion()) return;
    const next = glassPullState(dx, dy);
    button.style.translate = next.translate;
    button.style.scale = next.scale;
  };

  const release = (event) => {
    if (!pressed || event.pointerId !== pressed.pointerId) return;
    const { button, outside } = pressed;
    pressed = null;
    button.classList.remove('is-glass-pressed');
    button.style.translate = '';
    button.style.scale = '';
    if (event.type === 'pointerup' && outside) {
      // A touch keeps sending events to the button it began on, so the tap would still land there.
      const swallow = (clickEvent) => { clickEvent.preventDefault(); clickEvent.stopImmediatePropagation(); };
      button.addEventListener('click', swallow, { capture: true, once: true });
      view.setTimeout(() => button.removeEventListener('click', swallow, { capture: true }), 0);
    }
  };

  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerup', release);
  doc.addEventListener('pointercancel', release);

  return () => {
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', release);
    doc.removeEventListener('pointercancel', release);
    delete doc.documentElement.dataset.glassButtonFeel;
  };
}
