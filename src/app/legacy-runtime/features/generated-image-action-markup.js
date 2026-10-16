// The round icon buttons on a picture the AI made (remove from the picture, change the ratio, share): their markup. The behaviour is in
// generated-image-interactions.js (it finds them by `data-generated-image-<kind>`); the share button stays hidden until the page knows the device can share files.
const ICONS = Object.freeze({
  remove: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L14.6 3.4a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L9 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  resize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>'
});

const escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function generatedImageIconButton(kind, assetId, label = '', attributes = '') {
  return `<button type="button" data-generated-image-${kind}="${escape(assetId)}" class="generated-image-action-btn generated-image-icon-btn" title="${escape(label)}" aria-label="${escape(label)}"${attributes}>
                                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg>
                            </button>`;
}
