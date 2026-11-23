// The function that makes pictures, whoever's they are: a request names its provider and goes to OpenRouter's images endpoint, and the answer is ({ images: [{ b64Json, mediaType, aspectRatio? }] }).
// An SVG is written by a text model, because the picture model cannot (svg-writer.js). Shared by the page and the server. (OpenAI's own Images API was taken out with the OpenAI provider on 2026-11-23.)

import { createOpenRouterImageGenerator } from './openrouter-image-generation.js';
import { SVG_WRITER_MODELS, createSvgWriter } from './svg-writer.js';

/** Does a text model write this SVG? Always: OpenRouter's images endpoint takes no SVG. */
export const svgIsWrittenByTextModel = (request) => request?.config?.outputFormat === 'svg';

export function createImageGenerator({ fetchImpl, askText = null } = {}) {
  const openRouter = createOpenRouterImageGenerator({ fetchImpl });
  const writer = createSvgWriter({ fetchImpl, askText });
  return (request) => {
    if (svgIsWrittenByTextModel(request)) {
      // A text model of the chat writes it with its own provider; a picture model's SVG is written by Luna through OpenRouter.
      const provider = request.config.svgWriter ? request.provider : 'openrouter';
      return writer({ ...request, provider, model: request.config.svgWriter ? request.model : SVG_WRITER_MODELS[provider] });
    }
    return openRouter(request);
  };
}
