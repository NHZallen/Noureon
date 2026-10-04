// The terminal glyph of the CLI tools (the store's entry, the "@" menu, the chip of a tool): a rounded screen with a prompt, one line.

export const terminalIcon = (size = 20, className = '') => `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="3.2"/><path d="m7.5 9.5 3 2.5-3 2.5"/><path d="M13 14.5h3.5"/></svg>`;

const escapeAttribute = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

/**
 * The picture of a tool as markup: its project's logo when the manifest has one (loaded when the list is seen), else the terminal glyph.
 * A logo that cannot be loaded is replaced by the glyph (see watchToolIcons).
 */
export const toolIconMarkup = (tool, size = 20, className = '') => (tool?.icon
  ? `<img class="cli-tool-img ${className}" src="${escapeAttribute(tool.icon)}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
  : terminalIcon(size, className));

/** Puts the glyph where a logo failed to load (pictures do not bubble "error", so it is caught on the way down). */
export function watchToolIcons(container, size = 20) {
  container.addEventListener('error', (event) => {
    const image = event.target;
    if (!image?.classList?.contains('cli-tool-img')) return;
    image.outerHTML = terminalIcon(size);
  }, true);
}
