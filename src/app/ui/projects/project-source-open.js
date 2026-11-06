// What a person does with a source of a project besides reading its name: look at it (the same preview that shows a file attached to a message: text, PDF, Word, Excel, PowerPoint in a
// window, a picture or a video in the viewer of pictures) and have it (download, or on a phone the share sheet, as an attached file has: file-card-interactions.js `deliverFile`).
// The page of the sources, the side panel and the sheet of the sources of a reply, and the page of someone else's chat all use this one. Page only (it draws with `document`).
//
// `loadFile({ project, source })` gives the bytes of a file source: { mimeType, data (base64) } or null. A text is its words; a web address is opened as a link.

const lang = (value) => (typeof value === 'function' ? value() : value);
// A name a file may be saved under: no path or reserved marks, no control characters.
const safeName = (value) => Array.from(String(value ?? '')).filter((char) => char.charCodeAt(0) > 31).join('').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

const toBase64 = (value) => {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

const textFile = (source) => {
  const research = source.origin === 'research';
  const base = safeName(source.title || 'text').replace(/\.(txt|md|csv|pdf|docx?|xlsx?|pptx?|rtf|odt|json|html?)$/i, '').slice(0, 80) || 'text';
  return { name: `${base}${research ? '.md' : '.txt'}`, type: research ? 'text/markdown' : 'text/plain', base64: `data:text/plain;base64,${toBase64(source.text || '')}` };
};

/** The file a source is: { name, type, base64 } ('base64' as the attachments keep it: the data, with no prefix, is what the viewer of pictures takes), or null when it has none (a web address) or cannot be read. */
export async function sourceAsFile({ project, source, loadFile }) {
  if (!source) return null;
  if (source.kind === 'url') return null;
  if (source.kind === 'text') return textFile(source);
  const loaded = source.file ? await loadFile({ project, source }) : null;
  // A source whose original was not kept (or cannot be had now) but whose text was read: its text is what there is to look at and to have.
  if (!loaded?.data) return String(source.text || '').trim() ? textFile(source) : null;
  const type = String(loaded.mimeType || source.file?.mimeType || 'application/octet-stream');
  return { name: safeName(source.file?.name || source.title || 'file') || 'file', type, base64: `data:${type};base64,${loaded.data}` };
}

/**
 * deps: document, window, language (or a function that gives it), loadFile, notify(message, type), text(key) (the page's texts: `pjSourceOpenFailed`, `pjSourceTapAgain`), openMedia({ mimeType, data, name }, trigger) (the viewer of pictures; optional).
 * Returns { preview(project, source, trigger), download(project, source) }; both resolve true when something was done.
 */
export function createSourceOpener({ document, window = document.defaultView, language = 'zh-TW', loadFile, notify = () => {}, text = (key) => key, openMedia = null }) {
  // What was read is kept for the next tap: a phone allows the share sheet only right after a tap, and reading a file may take longer than that.
  const kept = new Map();
  const read = async (project, source) => {
    const key = `${project?.id || ''}:${source?.id || ''}`;
    if (!kept.has(key)) {
      const file = await sourceAsFile({ project, source, loadFile }).catch(() => null);
      if (file) kept.set(key, file);
      return file;
    }
    return kept.get(key);
  };
  const open = (url) => { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* a blocked window */ } };
  const preview = async (project, source, trigger = null) => {
    if (source?.kind === 'url') { if (/^https?:\/\//i.test(source.url || '')) open(source.url); return true; }
    const file = await read(project, source);
    if (!file) { notify(text('pjSourceOpenFailed'), 'error'); return false; }
    const { describeAttachment } = await import('../files/file-visual.js');
    const { family } = describeAttachment({ name: file.name, mimeType: file.type });
    if ((family === 'image' || family === 'video') && openMedia) { openMedia({ mimeType: file.type, data: file.base64.split(',')[1], name: file.name }, trigger); return true; }
    const { openUploadedFilePreview } = await import('../files/uploaded-file-preview.js');
    const shown = await openUploadedFilePreview({ document, window, file, language: lang(language), returnFocusTo: trigger });
    // A kind that has no preview (a recording, an archive, a program): it is offered as a file.
    if (!shown) return download(project, source);
    return true;
  };
  const download = async (project, source) => {
    if (source?.kind === 'url') return false;
    const file = await read(project, source);
    if (!file) { notify(text('pjSourceOpenFailed'), 'error'); return false; }
    const [{ deliverFile }, { attachmentBlob }] = await Promise.all([import('../files/file-card-interactions.js'), import('../files/attachment-thumbnail.js')]);
    const result = await deliverFile({ window, document, blob: attachmentBlob(file, { window }), fileName: file.name });
    // The phone wants a tap for the share sheet and the file took too long to be read: it is ready now, one more tap.
    if (result === 'needs-tap') { notify(text('pjSourceTapAgain'), 'success'); return false; }
    return true;
  };
  return { preview, download };
}
