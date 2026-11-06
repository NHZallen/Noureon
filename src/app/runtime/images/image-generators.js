// The function that makes pictures, whoever's they are: a request names its provider (`openai` goes to OpenAI's own Images API, anything else to OpenRouter's), and the answer is
// the same for both ({ images: [{ b64Json, mediaType, aspectRatio? }] }). An SVG is written by a text model when the picture model cannot make it (svg-writer.js). Shared by the page and the server.

import { getOpenAiSafetyIdentifier } from '../reply/openai-request.js';
import { createOpenAiImageGenerator } from './openai-image-generation.js';
import { createOpenRouterImageGenerator } from './openrouter-image-generation.js';
import { SVG_WRITER_MODELS, createSvgWriter } from './svg-writer.js';

/** Does a text model write this SVG? A chat asked for it (`svgWriter`), or the picture model cannot: OpenRouter's images endpoint takes no SVG, and OpenAI's makes one from words alone, not from a picture. */
export const svgIsWrittenByTextModel = (request) => request?.config?.outputFormat === 'svg'
  && (Boolean(request.config.svgWriter) || request.provider !== 'openai' || (request.inputReferences?.length ?? 0) > 0);

export function createImageGenerator({ fetchImpl, getSafetyIdentifier = () => getOpenAiSafetyIdentifier(), askText = null } = {}) {
  const openRouter = createOpenRouterImageGenerator({ fetchImpl });
  const openAi = createOpenAiImageGenerator({ fetchImpl, getSafetyIdentifier });
  const writer = createSvgWriter({ fetchImpl, getSafetyIdentifier, askText });
  return (request) => {
    if (svgIsWrittenByTextModel(request)) {
      // A text model of the chat writes it with its own provider; a picture model's SVG is written by Luna of OpenAI or OpenRouter.
      const provider = request.config.svgWriter ? request.provider : request.provider === 'openai' ? 'openai' : 'openrouter';
      return writer({ ...request, provider, model: request.config.svgWriter ? request.model : SVG_WRITER_MODELS[provider] });
    }
    return request?.provider === 'openai' ? openAi(request) : openRouter(request);
  };
}
