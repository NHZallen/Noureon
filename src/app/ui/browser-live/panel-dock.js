// The side panel of the browser agent on a computer takes its room from the chat the way the right-hand panel of the sources does (the page gets a `padding-right`),
// and the big one (Enlarge) takes most of the content area and leaves the chat a narrow column. The width is chosen by dragging the edge; the choice is kept in this
// browser. This module says the width to the page (`--browser-panel-w` and `html[data-browser-panel]`, read by src/styles/browser-focus.css) and draws the edge to drag.

export const PANEL_MIN = 352; // px
export const PANEL_DEFAULT = 416;
export const PANEL_MAX_SHARE = 0.6; // of the window
export const CHAT_COLUMN = '24rem'; // what the chat keeps beside the big panel
export const PANEL_KEY = 'noureon.browserPanelWidth';

export const clampWidth = (px, windowWidth = 1280) => Math.round(Math.min(Math.max(PANEL_MIN, Number(px) || PANEL_DEFAULT), Math.max(PANEL_MIN, windowWidth * PANEL_MAX_SHARE)));

export function createPanelDock({ document, storage = null }) {
  const html = document.documentElement;
  const view = () => document.defaultView;
  let width = PANEL_DEFAULT;
  try {
    const saved = Number(storage?.getItem?.(PANEL_KEY));
    if (saved) width = clampWidth(saved, view()?.innerWidth);
  } catch {
    // The choice is not kept in a window that keeps nothing.
  }
  let zoomed = false;
  let open = false;
  let handle = null;

  const apply = () => {
    if (!open) {
      html.removeAttribute('data-browser-panel');
      html.style.removeProperty('--browser-panel-w');
      return;
    }
    html.setAttribute('data-browser-panel', zoomed ? 'zoom' : 'panel');
    html.style.setProperty('--browser-panel-w', zoomed ? `calc(100vw - var(--rail-inset, 0px) - ${CHAT_COLUMN})` : `${width}px`);
  };

  return {
    get width() { return width; },
    get zoomed() { return zoomed; },
    get isOpen() { return open; },
    open(next = {}) {
      open = true;
      zoomed = Boolean(next.zoomed);
      apply();
    },
    close() {
      open = false;
      zoomed = false;
      handle?.remove();
      handle = null;
      apply();
    },
    setZoom(value) {
      zoomed = Boolean(value);
      apply();
    },
    setWidth(px) {
      width = clampWidth(px, view()?.innerWidth);
      try {
        storage?.setItem?.(PANEL_KEY, String(width));
      } catch {
        // Not kept.
      }
      apply();
    },
    /** The edge a person drags to change the width (only when the panel is not the big one). Put into the panel. */
    mountHandle(panel, label = '') {
      handle?.remove();
      handle = document.createElement('div');
      handle.className = 'bf-resize';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      if (label) { handle.setAttribute('aria-label', label); handle.title = label; }
      const onMove = (event) => { if (!zoomed) this.setWidth((view()?.innerWidth || 0) - event.clientX); };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        html.classList.remove('is-resizing-browser');
      };
      handle.addEventListener('pointerdown', (event) => {
        if (zoomed) return;
        event.preventDefault();
        html.classList.add('is-resizing-browser');
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      panel.append(handle);
      return handle;
    }
  };
}
