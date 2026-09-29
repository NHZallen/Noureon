// Pop-up notices in the top right corner. One short line with a small icon for
// its kind, an optional single action ("Turn on Search"), and a close button.
// At most three show at once and the rest wait; the same notice shown again
// refreshes the one on screen instead of piling up; the pointer over a notice
// holds its timer; a click on it dismisses it. How long one stays follows how
// much there is to read.

const MAX_VISIBLE = 3;
const BASE_MS = 3000;
const LONGEST_MS = 6000;
const ACTION_MS = 6000;
const MS_PER_EXTRA_CHARACTER = 40;
const SHORT_LENGTH = 40;
const LEAVE_MS = 220;
const HELD_MIN_MS = 1500;

const ICONS = Object.freeze({
  success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12.5 11 15.5 16 9.5"></polyline></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="7.5" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12.01" y2="16.5"></line></svg>',
  error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>'
});

const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

/** How long a notice stays: short ones a moment, long ones up to twice that, ones with an action longer still. */
export function noticeDuration(message, { hasAction = false } = {}) {
  if (hasAction) return ACTION_MS;
  const extra = Math.max(0, String(message || '').length - SHORT_LENGTH);
  return Math.min(LONGEST_MS, BASE_MS + extra * MS_PER_EXTRA_CHARACTER);
}

export function createToastCenter({
  document,
  getContainer,
  setTimeout,
  clearTimeout,
  requestAnimationFrame = (callback) => callback(),
  getText = (_key, fallback) => fallback
}) {
  const visible = new Set();
  const waiting = [];

  const settle = (toast) => {
    if (toast.gone) return;
    toast.gone = true;
    clearTimeout(toast.timer);
    toast.node.remove();
    visible.delete(toast);
    const next = waiting.shift();
    if (next) present(next);
  };

  const dismiss = (toast) => {
    if (toast.gone || toast.leaving) return;
    toast.leaving = true;
    clearTimeout(toast.timer);
    toast.node.classList.add('is-leaving');
    toast.timer = setTimeout(() => settle(toast), LEAVE_MS);
  };

  const startTimer = (toast, ms) => {
    clearTimeout(toast.timer);
    toast.startedAt = Date.now();
    toast.remaining = ms;
    toast.timer = setTimeout(() => dismiss(toast), ms);
  };

  function present(toast) {
    const container = getContainer();
    if (!container) throw new TypeError('The notification container is missing');
    const node = document.createElement('div');
    node.className = `notification ${toast.type}`;
    node.setAttribute('role', toast.type === 'error' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS[toast.type] || ICONS.success;
    const text = document.createElement('span');
    text.className = 'notification-text';
    text.textContent = toast.message;
    node.append(icon, text);
    if (toast.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'notification-action';
      action.textContent = toast.action.label;
      action.addEventListener('click', (event) => {
        event.stopPropagation();
        dismiss(toast);
        toast.action.onClick?.();
      });
      node.append(action);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notification-close';
    close.setAttribute('aria-label', getText('close', 'Close'));
    close.innerHTML = CLOSE_ICON;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      dismiss(toast);
    });
    node.append(close);
    node.addEventListener('click', () => dismiss(toast));
    // Under the pointer the notice waits; when the pointer leaves it gets what was left, or a moment.
    node.addEventListener('pointerenter', () => {
      if (toast.leaving) return;
      clearTimeout(toast.timer);
      toast.remaining = Math.max(HELD_MIN_MS, toast.remaining - (Date.now() - toast.startedAt));
    });
    node.addEventListener('pointerleave', () => {
      if (toast.leaving || toast.gone) return;
      startTimer(toast, toast.remaining);
    });
    toast.node = node;
    visible.add(toast);
    container.append(node);
    startTimer(toast, toast.duration);
  }

  /**
   * `options.action` is `{ label, onClick }`; `options.duration` overrides how long it stays.
   * The same message and kind shown while it is still up refreshes it.
   */
  const show = (message, type = 'success', options = {}) => {
    const text = String(message ?? '');
    const same = [...visible].find((toast) => !toast.leaving && toast.message === text && toast.type === type)
      || waiting.find((toast) => toast.message === text && toast.type === type);
    const duration = options.duration ?? noticeDuration(text, { hasAction: Boolean(options.action) });
    if (same) {
      same.duration = duration;
      if (same.node) {
        startTimer(same, duration);
        same.node.classList.remove('is-bumped');
        requestAnimationFrame(() => same.node.classList.add('is-bumped'));
      }
      return same.node || null;
    }
    const toast = { message: text, type, action: options.action || null, duration, timer: null, node: null, gone: false, leaving: false, startedAt: 0, remaining: duration };
    if (visible.size >= MAX_VISIBLE) {
      waiting.push(toast);
      return null;
    }
    present(toast);
    return toast.node;
  };

  return { show, get visibleCount() { return visible.size; }, get waitingCount() { return waiting.length; } };
}
