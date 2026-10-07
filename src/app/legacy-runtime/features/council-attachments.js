// Which attachments of a council's message need to be written down (a "packet") for the models that cannot read them, shared by the page and
// the server. A file is visual (an image or a video) or a document; a packet is needed for a kind of file when some selected model cannot read
// that kind. No browser globals: the server imports this module.

export const isVisualUploadedFile = (file) => {
  const mimeType = file?.type || file?.mimeType || file?.inlineData?.mimeType || '';
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
};

export const isUploadedAttachmentLike = (file) => Boolean(file?.inlineData || file?.base64 || file?.type || file?.mimeType);

export const getCouncilVisualFiles = (files = []) => (files || []).filter((file) => isUploadedAttachmentLike(file) && isVisualUploadedFile(file));
export const getCouncilDocumentFiles = (files = []) => (files || []).filter((file) => isUploadedAttachmentLike(file) && !isVisualUploadedFile(file));

export const createCouncilAttachmentNeed = ({ modelSupportsVision, modelSupportsDocumentUpload }) => (models = [], files = []) => {
  const selectedModels = (models || []).filter(Boolean);
  const visualFiles = getCouncilVisualFiles(files);
  const documentFiles = getCouncilDocumentFiles(files);
  const needsVisualPacket = visualFiles.length > 0 && selectedModels.some((model) => !modelSupportsVision(model));
  const needsDocumentPacket = documentFiles.length > 0 && selectedModels.some((model) => !modelSupportsDocumentUpload(model));
  return {
    needsVisualPacket,
    needsDocumentPacket,
    needsAnyPacket: needsVisualPacket || needsDocumentPacket,
    visualFiles,
    documentFiles
  };
};
