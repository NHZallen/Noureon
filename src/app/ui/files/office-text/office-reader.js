// Puts the content of Word, PowerPoint and Excel files into the parts of a request, for the models that cannot read those files themselves (the design:
// docs/superpowers/specs/2026-10-14-office-to-pdf-design.md). One reader keeps what it read (by the content of the file), so a file in the history of a
// conversation is read once. Shared by the page and the server: no window, no document.

import { extractOffice, officeKindOf } from './office-text.js';

const MIME_EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };

const toBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/** The parts that stand for the file: its text (with what was left out told), then each picture, named by its number. */
export function officeRequestParts(content, { sendImages, label = '' }) {
  const notes = [];
  if (content.imageTotal > 0 && !sendImages) notes.push(`The file has ${content.imageTotal} image(s) that this model cannot look at.`);
  else if (content.omitted > 0) notes.push(`${content.omitted} more image(s) of the file were not sent.`);
  if (content.kind === 'xlsx' && (content.charts > 0 || content.imageTotal > 0)) notes.push('Charts and pictures of the workbook are not included.');
  // The line that numbers and names the file for the model (src/app/runtime/messages/attachment-labels.js) comes first.
  const text = [label ? `[${label}]` : '', `# File: ${content.name || 'document'} (${content.label})`, content.text, ...notes.map((note) => `(${note})`)].filter(Boolean).join('\n\n');
  const parts = [{ text }];
  if (sendImages) {
    for (const image of content.images) {
      parts.push({ text: `[Image ${image.number}${image.label ? `: ${image.label}` : ''}] of ${content.name || 'the file'}:` });
      parts.push({ inlineData: { mimeType: image.mimeType, data: toBase64(image.bytes), name: `image-${image.number}.${MIME_EXTENSION[image.mimeType] || 'png'}` } });
    }
  }
  return parts;
}

/** The default parts the page has: JSZip (the app's own) and the browser's DOMParser. The server gives its own (xmldom). */
const browserDeps = async () => ({ JSZip: (await import('jszip')).default, DOMParser: globalThis.DOMParser, shrinkImage: (await import('./shrink-image-browser.js')).shrinkImage });

const digest = async (data) => {
  const text = String(data);
  if (!globalThis.crypto?.subtle) return `${text.length}:${text.slice(0, 64)}:${text.slice(-64)}`;
  const bytes = new TextEncoder().encode(text);
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** `convertToPdf(inlineData)` (the server's, with LibreOffice) gives { mimeType, name, data } for a file, or null: it is only used for the files `viaPdf(inlineData)` says. */
export function createOfficeReader({ loadDeps = browserDeps, maxImages, convertToPdf = null } = {}) {
  const memo = new Map();
  const content = async (inlineData) => {
    const key = `${inlineData.mimeType}:${await digest(inlineData.data)}`;
    if (!memo.has(key)) {
      memo.set(key, (async () => {
        try {
          const deps = await loadDeps();
          return await extractOffice({ data: inlineData.data, mimeType: inlineData.mimeType, name: inlineData.name || '' }, { ...deps, ...(maxImages ? { maxImages } : {}) });
        } catch {
          return null;
        }
      })());
    }
    return memo.get(key);
  };

  return {
    content,
    /**
     * `parts` with each Word, PowerPoint or Excel file the model cannot read replaced by its content. A part stays as it is when the model reads it
     * (`canRead(inlineData)`), when it is not one of those files, when it could not be read, when it is mostly pictures, and, for a model that cannot see
     * pictures, when it has some and a translator model is there to describe them (`hasTranslator`).
     */
    async expandParts(parts, { canRead = () => false, viaPdf = () => false, supportsVision = false, hasTranslator = false } = {}) {
      const out = [];
      let changed = false;
      let imagesSent = 0;
      for (const part of Array.isArray(parts) ? parts : []) {
        const inline = part?.inlineData;
        if (!inline?.data || !officeKindOf({ mimeType: inline.mimeType, name: inline.name }) || canRead(inline)) {
          out.push(part);
          continue;
        }
        // A file the model reads better as a PDF (the server makes it): sent as that PDF, the text and the pictures of its pages together.
        if (convertToPdf && viaPdf(inline)) {
          const pdf = await convertToPdf(inline).catch(() => null);
          if (pdf?.data) {
            out.push({ ...part, inlineData: inline.attachmentLabel ? { ...pdf, attachmentLabel: inline.attachmentLabel } : pdf });
            changed = true;
            continue;
          }
        }
        const read = await content(inline);
        if (!read?.usable || (!supportsVision && read.imageTotal > 0 && hasTranslator)) {
          out.push(part);
          continue;
        }
        // `shrinkImage` (the page's own, from the dependencies) makes big pictures smaller before they are sent.
        const shrink = supportsVision && read.images.length ? (await loadDeps().catch(() => ({}))).shrinkImage : null;
        const images = shrink ? await Promise.all(read.images.map(async (image) => ({ ...image, ...(await shrink(image)) }))) : read.images;
        out.push(...officeRequestParts({ ...read, images }, { sendImages: supportsVision, label: inline.attachmentLabel || '' }));
        if (supportsVision) imagesSent += images.length;
        changed = true;
      }
      return { parts: out, changed, imagesSent };
    },
    /** The same for the messages of a history ({ role, parts }): the messages are copied, never changed. */
    async expandMessages(messages, options) {
      const out = [];
      for (const message of Array.isArray(messages) ? messages : []) {
        if (!message?.parts?.some((part) => part?.inlineData?.data)) {
          out.push(message);
          continue;
        }
        const { parts, changed } = await this.expandParts(message.parts, options);
        out.push(changed ? { ...message, parts } : message);
      }
      return out;
    }
  };
}
