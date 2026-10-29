// The function that makes pictures, whoever's they are: a request names its provider (`openai` goes to OpenAI's own Images API, anything else to OpenRouter's), and the answer is
// the same for both ({ images: [{ b64Json, mediaType, aspectRatio? }] }). Shared by the page and the server.

import { getOpenAiSafetyIdentifier } from '../reply/openai-request.js';
import { createOpenAiImageGenerator } from './openai-image-generation.js';
import { createOpenRouterImageGenerator } from './openrouter-image-generation.js';

export function createImageGenerator({ fetchImpl, getSafetyIdentifier = () => getOpenAiSafetyIdentifier() } = {}) {
  const openRouter = createOpenRouterImageGenerator({ fetchImpl });
  const openAi = createOpenAiImageGenerator({ fetchImpl, getSafetyIdentifier });
  return (request) => (request?.provider === 'openai' ? openAi(request) : openRouter(request));
}
