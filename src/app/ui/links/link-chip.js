// A web address shown as the site's icon and a short link, the way ChatGPT shows a pasted link: in the message box while
// it is being written (composer-rich-editor.js) and in the message once it is sent (message-markup-renderer.js). The
// text of the message is still the address itself, so what the model is sent does not change.

import { findAddresses } from '../../legacy-runtime/features/linked-pages.js';

const MAX_LABEL = 48;

const escapeHTML = (value = '') => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const clip = (text) => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text);

/** The short name of an address: GitHub's owner/repo, otherwise the site and the start of the path. */
export function linkLabel(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return clip(String(url || ''));
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const path = decodeURIComponent(parsed.pathname.replace(/\/+$/, '')).replace(/^\//, '');
  if (host === 'github.com') {
    const [owner, repo] = path.split('/');
    if (owner && repo) return clip(`${owner}/${repo.replace(/\.git$/, '')}`);
  }
  return clip(path ? `${host}/${path}` : host);
}

export const linkHost = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const iconSource = (url) => {
  const host = linkHost(url);
  return host ? `https://${host}/favicon.ico` : '';
};

/** The chip as markup, for a sent message. A link opens in a new tab. */
export function renderLinkChipHTML(url) {
  const src = iconSource(url);
  const icon = `<span class="link-chip-icon">${src ? `<img src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
  return `<a class="link-chip" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(url)}">${icon}<span class="link-chip-label">${escapeHTML(linkLabel(url))}</span></a>`;
}

/** The chip as a node, for the message box: one piece that is deleted whole, and whose text is the address. */
export function createLinkChipElement(document, url) {
  const chip = document.createElement('span');
  chip.className = 'composer-link-token link-chip';
  chip.dataset.url = url;
  chip.contentEditable = 'false';
  chip.title = url;
  const icon = document.createElement('span');
  icon.className = 'link-chip-icon';
  const src = iconSource(url);
  if (src) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = src;
    image.referrerPolicy = 'no-referrer';
    icon.append(image);
  }
  const label = document.createElement('span');
  label.className = 'link-chip-label';
  label.textContent = linkLabel(url);
  chip.append(icon, label);
  return chip;
}

/** The text cut into pieces: { text } and { url }, in order, with the text between the addresses kept as it was. */
export function splitAtAddresses(text) {
  const value = String(text || '');
  const pieces = [];
  let at = 0;
  for (const { url, start, end } of findAddresses(value)) {
    if (start > at) pieces.push({ text: value.slice(at, start) });
    pieces.push({ url });
    at = end;
  }
  if (at < value.length) pieces.push({ text: value.slice(at) });
  return pieces;
}
