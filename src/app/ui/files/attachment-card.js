// The card of a file in the message box: a picture of its first page (or the icon of its kind while that is being drawn, or when there is none), and under it the
// icon of its kind and its name; a cross takes it away. It opens the preview of the file when there is one to show (a program's source has none).

import { drawAttachmentThumbnail } from './attachment-thumbnail.js';
import { THUMBNAIL_FAMILIES, THUMBNAIL_MAX_BYTES, createFileKindIcon, describeAttachment, fileKindLabel } from './file-visual.js';

const PAGE_FAMILIES = new Set(['pdf', 'word', 'powerpoint', 'excel']);
const PREVIEW_FAMILIES = new Set(['image', 'video', 'pdf', 'word', 'powerpoint', 'excel', 'text', 'markdown', 'csv']);

export const attachmentFamily = (file) => describeAttachment({ name: file?.name, mimeType: file?.type }).family;
export const isPreviewable = (file) => PREVIEW_FAMILIES.has(attachmentFamily(file));
/** True when a picture of the first page is made for the file (not for a big file, nor for a program's source). */
export const hasThumbnail = (file) => THUMBNAIL_FAMILIES.includes(attachmentFamily(file)) && Number(file?.size || 0) <= THUMBNAIL_MAX_BYTES;

const removeIcon = (document) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-preview-remove';
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  return button;
};

/**
 * `cache` (a Map) keeps what was drawn for a file between two draws of the row, so adding a second file does not draw the first again.
 * Returns { element, video } (`video`: the <video> to make a thumbnail of, when the file is one).
 */
export function createAttachmentCard(document, file, { window = globalThis.window, language = 'zh-TW', cache = new Map(), onOpen = () => {}, onRemove = () => {} } = {}) {
  const kind = describeAttachment({ name: file.name, mimeType: file.type });
  const { family } = kind;
  const openable = isPreviewable(file);
  const card = document.createElement('div');
  card.className = 'ac-attach-card file-preview-item';
  card.dataset.fileFamily = family;
  card.dataset.openable = String(openable);
  card.title = `${file.name} · ${fileKindLabel(language, kind)}`;
  if (openable) {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', file.name);
    card.addEventListener('click', () => onOpen(file, card));
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      onOpen(file, card);
    });
  }

  const thumb = document.createElement('div');
  thumb.className = 'ac-attach-thumb';
  thumb.appendChild(createFileKindIcon(document, family));
  let video = null;
  if (family === 'image') {
    thumb.dataset.state = 'media';
    const image = document.createElement('img');
    image.src = file.base64;
    image.alt = '';
    thumb.appendChild(image);
  } else if (family === 'video') {
    thumb.dataset.state = 'media';
    thumb.innerHTML += `<video src="${file.base64}" preload="auto" muted playsinline data-video-thumbnail></video><span class="message-media-play file-preview-play" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg></span>`;
    video = thumb.querySelector('video');
    card.classList.add('file-preview-video');
  } else if (hasThumbnail(file)) {
    const spinner = document.createElement('span');
    spinner.className = 'ac-attach-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    thumb.appendChild(spinner);
    let entry = cache.get(file.id);
    if (!entry) {
      const host = document.createElement('div');
      host.className = 'ac-attach-host';
      entry = { host, state: 'loading', thumb: null, dispose: null };
      cache.set(file.id, entry);
      // The host must be in the page while it is drawn (the previews measure it).
      thumb.appendChild(host);
      entry.thumb = thumb;
      drawAttachmentThumbnail({ document, window, file, family, host }).then((result) => {
        entry.dispose = result?.dispose || null;
        entry.state = result ? 'ready' : 'icon';
        if (entry.thumb) entry.thumb.dataset.state = entry.state;
        // The scale of a page (the previews fit it to the width of the host) is made again now that the host has its size.
        if (result) window.dispatchEvent?.(new window.Event('resize'));
      });
    } else {
      thumb.appendChild(entry.host);
      entry.thumb = thumb;
    }
    thumb.dataset.state = entry.state;
  } else {
    thumb.dataset.state = 'icon';
  }

  const meta = document.createElement('div');
  meta.className = 'ac-attach-meta';
  const name = document.createElement('span');
  name.className = 'ac-attach-name';
  name.textContent = file.name;
  meta.append(createFileKindIcon(document, family), name);

  const remove = removeIcon(document);
  remove.setAttribute('aria-label', file.name);
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    const entry = cache.get(file.id);
    entry?.dispose?.();
    cache.delete(file.id);
    onRemove(file);
  });
  card.append(thumb, meta, remove);
  return { element: card, video };
}

export { PAGE_FAMILIES };
