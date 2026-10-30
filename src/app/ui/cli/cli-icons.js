// The icons of the extensions (Lucide, ISC licence): the terminal of the CLI tools (the store's entry, the "@" menu, the chip of a tool), the plug of the connectors and the wrench of the skills.

import { OFFICIAL_SKILL_ICONS, SKILL_ICON_PATHS } from '../../../data/skill-icons.js';

export const terminalIcon = (size = 20, className = '') => `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d='M12 19h8' /><path d='m4 17 6-6-6-6' /></svg>`;

/** The four squares of the Extensions page (the entry of the left menu, the page's title). */
export const extensionsIcon = (size = 20, className = '') => `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></svg>`;

/** The plug of the connectors. */
export const plugIcon = (size = 20, className = '') => `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d='M12 22v-5' /><path d='M15 8V2' /><path d='M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z' /><path d='M9 8V2' /></svg>`;

/** The wrench of the skills (a skill with no title at all). */
export const skillIcon = (size = 20, className = '') => `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z' /></svg>`;

const escapeLetter = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

/**
 * The picture of one skill: an official skill has its own icon (data/skill-icons.js), a skill the person added shows the first letter of its title (the first letter of
 * what the person sees, whatever the script), and a skill with no title at all the star. `framed` draws the letter in a small rounded frame (a chip, a menu row, which
 * have none of their own); the list of the page and the card of a draft have their own frame, so the letter is bare there.
 */
export const skillMark = (name, title, size = 20, className = '', { framed = true } = {}) => {
  const path = SKILL_ICON_PATHS[OFFICIAL_SKILL_ICONS[name]];
  if (path) return `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const letter = Array.from(String(title || name || '').trim())[0];
  if (!letter) return skillIcon(size, className);
  const frame = framed ? `border:1.5px solid currentColor;border-radius:${Math.max(4, Math.round(size * 0.28))}px;` : '';
  return `<span class="${className}" style="display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:${size}px;height:${size}px;${frame}font-weight:600;line-height:1;font-size:${Math.round(size * (framed ? 0.56 : 0.72))}px;" aria-hidden="true">${escapeLetter(letter.toUpperCase())}</span>`;
};

const escapeAttribute = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

/**
 * The picture of a tool as markup: its project's logo when the manifest has one (loaded when the list is seen), else the terminal glyph.
 * A logo that cannot be loaded is replaced by the glyph (see watchToolIcons).
 */
export const toolIconMarkup = (tool, size = 20, className = '') => (tool?.icon
  ? `<img class="cli-tool-img ${className}" src="${escapeAttribute(tool.icon)}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
  : terminalIcon(size, className));

/** Puts the glyph where a logo failed to load (pictures do not bubble "error", so it is caught on the way down). It keeps the size and classes. */
export function watchToolIcons(container, size = 20) {
  container.addEventListener('error', (event) => {
    const image = event.target;
    if (!image?.classList?.contains('cli-tool-img') || !image.parentNode) return;
    const classes = [...image.classList].filter((name) => name !== 'cli-tool-img').join(' ');
    image.outerHTML = terminalIcon(Number(image.getAttribute('width')) || size, classes);
  }, true);
}
