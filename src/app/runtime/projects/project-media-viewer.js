// A picture or a video of a source of a project, in the viewer of pictures of the app (the one a picture of a message opens), with its Save and Share. Loaded when one is opened.

import { escapeHTML } from '../shell/shell-utilities.js';
import { createMediaAttachmentRenderer } from '../messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../messages/media-preview-lifecycle.js';

/** `media` is { mimeType, data (base64), name }; `getText(key, fallback)` gives the words of the viewer (Save, Share, Close) in the language of the page. */
export function openProjectMedia({ document, language = 'zh-TW', media, trigger = null, getText = (_key, fallback) => fallback }) {
  const win = document.defaultView;
  const renderer = createMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => language });
  createMediaPreviewLifecycle({ document, navigator: win.navigator, fetch: win.fetch?.bind(win), File: win.File, escapeHTML, getInlineMediaSrc: renderer.getInlineMediaSrc, getUiLanguage: () => language, getText }).openMediaPreview(media, trigger);
}
