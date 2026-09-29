import { visionText } from './vision-texts.js';

/** A persistent, cancellable notification for the background visual check. */
export function createVisionProgressNotification({ document, notificationContainer, language, controller }) {
  const notification = document.createElement('div');
  notification.className = 'notification vision-check-progress';
  notification.style.cssText = 'display:flex;align-items:center;gap:1rem;max-width:calc(100vw - 3rem);box-sizing:border-box;overflow-wrap:anywhere;animation:fadeInRight .3s ease';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = visionText(language, 'preparing');
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = visionText(language, 'stop');
  stop.style.cssText = 'flex:none;border:1px solid currentColor;border-radius:.35rem;padding:.2rem .65rem;background:transparent;color:inherit;cursor:pointer';
  stop.addEventListener('click', () => controller.abort());
  const remove = () => {
    controller.signal.removeEventListener('abort', remove);
    notification.remove();
  };
  controller.signal.addEventListener('abort', remove, { once: true });
  notification.append(status, stop);
  notificationContainer.appendChild(notification);
  return {
    set(key, values) { status.textContent = visionText(language, key, values); },
    // Free text (what the sandbox is doing while a deck is redone).
    setText(text) { status.textContent = text; },
    remove
  };
}
