// The place-holder of a picture that is being made: a field of dots in the person's colour (image-wait.js draws it) and a line of words that says
// where the work is. This is the markup inside `.generated-image-skeleton`, shared by the message list (a message that is waiting for its picture, also
// one found again after the page was closed) and the lifecycle that makes the picture, so the two are the same.

const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** `label` is the first words (it is replaced by the ones of the stage once image-wait.js has loaded); `startedAt` (ms) is when the picture was begun, if it was before this page drew it. */
export function imageWaitMarkup({ label = '', startedAt = 0 } = {}) {
  const started = Number(startedAt) > 0 ? ` data-started="${escapeAttribute(Math.round(Number(startedAt)))}"` : '';
  return `<span class="generated-image-wait-label">${escapeAttribute(label)}</span><noureon-image-wait${started} aria-hidden="true"></noureon-image-wait>`;
}

/** Starts loading the drawing of the dots (the element upgrades by itself when its file arrives); it is a separate file so that the chat does not carry it until a picture is waited for. */
export function loadImageWait() {
  return import('./image-wait.js').catch(() => null);
}
