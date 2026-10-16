// The actions on a picture the AI made that send a message by themselves: "remove from the picture" (the marked part is taken out) and "change the
// ratio" (the picture is made again in another ratio). Each puts a request and the picture into the message box and sends it, as if the person had written
// it, so the reply, the cost and the history are the ones of any other picture. Both need a picture-making model to be the chosen one.
import { IMAGE_ASPECT_RATIOS, normalizeImageGenerationConfig } from '../../legacy-runtime/features/image-generation-config.js';

const approximateBytes = (dataUrl) => Math.round(String(dataUrl).length * 0.75);

export function createGeneratedImageActions({ getConversation, modelOf, modelGeneratesImages, getText, showNotification, saveAppData, setComposer, submit }) {
  const activeImageModel = () => {
    const model = modelOf(getConversation());
    return model && modelGeneratesImages(model) ? model : null;
  };

  // Tells the person what is missing when a text model is the chosen one.
  const canUse = () => {
    if (activeImageModel()) return true;
    showNotification(getText('imageActionNeedsModel', 'Switch to a picture-making model first to use this.'), 'warning');
    return false;
  };
  const ratios = () => {
    const list = activeImageModel()?.supportedImageAspectRatios;
    return Array.isArray(list) && list.length ? list : IMAGE_ASPECT_RATIOS;
  };

  const run = async ({ kind, dataUrl, descriptor, ratio }) => {
    const conversation = getConversation();
    if (!conversation || !dataUrl) return;
    if (kind === 'remove') {
      setComposer({
        text: getText('imageRemovePrompt', 'Remove the marked part of the picture and fill the background in naturally. Keep everything else the same.'),
        files: [{ name: `astra-remove-${descriptor.id}.png`, type: 'image/png', size: approximateBytes(dataUrl), base64: dataUrl, targetedEdit: true }]
      });
    } else if (kind === 'resize' && ratio) {
      // The picture goes along as the reference (it may not be the latest one), and the ratio is the one of the next picture.
      conversation.imageConfig = { ...normalizeImageGenerationConfig(conversation.imageConfig), aspectRatio: ratio };
      await saveAppData();
      setComposer({
        text: getText('imageResizePrompt', 'Change this picture to a {ratio} aspect ratio and keep the content the same.').replaceAll('{ratio}', ratio),
        files: [{ name: `astra-resize-${descriptor.id}.png`, type: descriptor.mediaType || 'image/png', size: approximateBytes(dataUrl), base64: dataUrl }]
      });
    } else {
      return;
    }
    await submit();
  };

  return { canUse, ratios, run };
}
