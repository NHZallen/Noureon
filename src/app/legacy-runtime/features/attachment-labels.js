// Tells a model which attachment is which (docs/superpowers/specs: NOU-33). A picture, a video or a file of a message reaches a model as bare data, and
// the person says "the second picture" or "the contract": each attachment is given a short line of text in front of it,
//   [Image 2 of 3 in this message: beach.png]     [File 1 of 2 in this message: contract.pdf]
// numbered from 1 within its message and its kind (pictures, videos, other files), in the order the message shows them. The line is in the request
// only: nothing is stored with the message, so the numbers cannot drift, and a message sent before this existed gets them too.
// Shared by the page and the server: no window, no document.

const KIND_NAMES = { image: 'Image', video: 'Video', file: 'File' };

/** 'image', 'video' or 'file' (anything else: a document, a sheet, audio). */
export function attachmentKind(inlineData) {
  const mimeType = String(inlineData?.mimeType || '');
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

// A name is the person's own text: kept on one line, without the brackets that close the label, and short.
const cleanName = (name) => String(name || '').replace(/[\r\n\t]+/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')').trim().slice(0, 120);

/** The text of the label ("Image 2 of 3 in this message: beach.png"). */
export function attachmentLabelText(kind, number, count, name) {
  return `${KIND_NAMES[kind] || 'File'} ${number} of ${count} in this message: ${cleanName(name)}`;
}

const hasName = (inlineData) => Boolean(cleanName(inlineData?.name));

/**
 * `parts` of one message with each named attachment marked with its label (`inlineData.attachmentLabel`); the parts are copied, never changed. A part
 * that has a label already keeps it; one without a name (a page of a vision check, a picture a reader took from a file) is left alone and not counted.
 */
export function stampAttachmentLabels(parts) {
  if (!Array.isArray(parts)) return parts;
  const counts = { image: 0, video: 0, file: 0 };
  const named = parts.filter((part) => part?.inlineData?.data && hasName(part.inlineData));
  if (!named.length) return parts;
  named.forEach((part) => { counts[attachmentKind(part.inlineData)] += 1; });
  const seen = { image: 0, video: 0, file: 0 };
  return parts.map((part) => {
    if (!part?.inlineData?.data || !hasName(part.inlineData)) return part;
    const kind = attachmentKind(part.inlineData);
    seen[kind] += 1;
    if (part.inlineData.attachmentLabel) return part;
    return { ...part, inlineData: { ...part.inlineData, attachmentLabel: attachmentLabelText(kind, seen[kind], counts[kind], part.inlineData.name) } };
  });
}

/** The messages of a history ({ role, parts }) stamped the same way: only what the person sent; the messages are copied, never changed. */
export function stampMessageLabels(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (message?.role !== 'user' || !message.parts?.some((part) => part?.inlineData?.data)) return message;
    const parts = stampAttachmentLabels(message.parts);
    return parts === message.parts ? message : { ...message, parts };
  });
}

/** `parts` with each labelled attachment preceded by its label as a text part (and the mark taken off the attachment). */
export function expandAttachmentLabels(parts) {
  if (!Array.isArray(parts) || !parts.some((part) => part?.inlineData?.attachmentLabel)) return parts;
  return parts.flatMap((part) => {
    const label = part?.inlineData?.attachmentLabel;
    if (!label) return [part];
    const { attachmentLabel: _label, ...inlineData } = part.inlineData;
    return [{ text: `[${label}]` }, { ...part, inlineData }];
  });
}

/** The messages of a history with the labels put in front of their attachments. */
export function expandMessageLabels(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (!message?.parts?.some((part) => part?.inlineData?.attachmentLabel)) return message;
    return { ...message, parts: expandAttachmentLabels(message.parts) };
  });
}
