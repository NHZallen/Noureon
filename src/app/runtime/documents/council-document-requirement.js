import { supportsNativeDocumentExtraction } from './document-extractors.js';

export function councilNeedsAttachmentTranslator({ files = [], translationNeed = {} } = {}) {
  if (translationNeed.needsVisualPacket) return true;
  if (!translationNeed.needsDocumentPacket) return false;
  const documentFiles = files.filter(file => {
    const mimeType = file?.type || file?.mimeType || file?.inlineData?.mimeType || '';
    return mimeType && !mimeType.startsWith('image/') && !mimeType.startsWith('video/');
  });
  return !documentFiles.length || !documentFiles.every(file => supportsNativeDocumentExtraction({
    mimeType: file?.type || file?.mimeType || file?.inlineData?.mimeType,
    name: file?.name || file?.inlineData?.name
  }));
}
