// The preview of a file the person attached (from its card in the message box or its row in a message): the same dialog that shows a file the model made, with the file
// as it was attached. A picture or a video has its own viewer (the app's media preview); a program's source has no preview.

import { attachmentBlob, previewableBlob } from './attachment-thumbnail.js';
import { describeAttachment } from './file-visual.js';

const TEXT_FAMILIES = new Set(['text', 'markdown', 'csv']);
const PAGE_FAMILIES = new Set(['pdf', 'word', 'powerpoint', 'excel']);

/** A file of a message or of the box, as { name, type, base64 } ({ name, mimeType, data } for a message is turned by the caller). */
export async function openUploadedFilePreview({ document, window = globalThis.window, file, language = 'zh-TW', returnFocusTo = null }) {
  const { family, extension } = describeAttachment({ name: file.name, mimeType: file.type });
  if (!TEXT_FAMILIES.has(family) && !PAGE_FAMILIES.has(family)) return false;
  const [{ openFilePreview }, { getFileMarkdownRenderer }, { deliverFile }] = await Promise.all([import('./file-preview-dialog.js'), import('./file-markdown-cards.js'), import('./file-card-interactions.js')]);
  const content = TEXT_FAMILIES.has(family) ? await attachmentBlob(file, { window }).text() : '';
  const descriptor = {
    id: String(file.id || `attachment-${Date.now()}`),
    name: file.name,
    family,
    extension,
    state: 'ready',
    policy: 'allow',
    generator: TEXT_FAMILIES.has(family) ? 'text' : 'stored',
    content,
    mime: file.type
  };
  openFilePreview({
    document,
    window,
    descriptor,
    language,
    renderMarkdown: getFileMarkdownRenderer(),
    loadBlob: () => previewableBlob(file, family, { window }),
    onDownload: () => { void deliverFile({ window, document, blob: attachmentBlob(file, { window }), fileName: file.name }); },
    returnFocusTo
  });
  return true;
}
