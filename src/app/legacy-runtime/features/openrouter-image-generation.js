const IMAGE_API_URL = 'https://openrouter.ai/api/v1/images';

const copyIfDefined = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
};

export function buildOpenRouterImagePayload({ model, prompt, config = {}, inputReferences = [] }) {
  const payload = { model, prompt };
  copyIfDefined(payload, 'n', config.n);
  copyIfDefined(payload, 'resolution', config.resolution);
  copyIfDefined(payload, 'aspect_ratio', config.aspectRatio);
  copyIfDefined(payload, 'size', config.size);
  copyIfDefined(payload, 'quality', config.quality);
  copyIfDefined(payload, 'output_format', config.outputFormat);
  copyIfDefined(payload, 'background', config.background);
  copyIfDefined(payload, 'output_compression', config.outputCompression);
  copyIfDefined(payload, 'seed', config.seed);
  if (config.provider) payload.provider = config.provider;
  if (config.reasoningEffort) payload.reasoning = { effort: config.reasoningEffort };
  if (inputReferences.length > 0) {
    payload.input_references = inputReferences.map(url => ({
      type: 'image_url',
      image_url: { url }
    }));
  }
  return payload;
}

const normalizeImage = (image = {}) => ({
  b64Json: image.b64_json || '',
  mediaType: image.media_type || 'image/png'
});

async function readError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body?.error?.message || body?.message || text;
  } catch {
    return text || response.statusText;
  }
}

// Models that give nearly the same picture again when one request asks for several (seen on staging, 2026-10-17: two meadows of the same composition from
// Qwen Image 2.1 Turbo). For them a request for N pictures is N requests, each with its own seed, made together; the pictures come back in order.
// (The page and the server share this file, so both do it.)
export const SEPARATE_REQUEST_MODELS = Object.freeze(new Set(['qwen/qwen-image-2.1-turbo', 'qwen/qwen-image-2.1-pro']));

const randomSeed = () => Math.floor(Math.random() * 2147483646) + 1;

export function createOpenRouterImageGenerator({ fetchImpl = fetch, makeSeed = randomSeed } = {}) {
  const callOnce = async ({ apiKey, model, prompt, config, inputReferences, signal }) => {
    const response = await fetchImpl(IMAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildOpenRouterImagePayload({ model, prompt, config, inputReferences })),
      signal
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json();
    return (body.data || []).map(normalizeImage).filter(image => image.b64Json);
  };

  return async function generateOpenRouterImage({
    apiKey,
    model,
    prompt,
    config = {},
    inputReferences = [],
    signal
  }) {
    const count = Math.floor(Number(config.n)) || 1;
    if (count < 2 || !SEPARATE_REQUEST_MODELS.has(model)) {
      return { images: await callOnce({ apiKey, model, prompt, config, inputReferences, signal }) };
    }
    // A seed the person set is kept for the first and counted up for the others; without one each gets its own.
    const first = Number.isFinite(Number(config.seed)) && config.seed !== '' && config.seed !== null ? Number(config.seed) : null;
    const settled = await Promise.allSettled(Array.from({ length: count }, (_, index) => callOnce({
      apiKey, model, prompt, inputReferences, signal,
      config: { ...config, n: 1, seed: first === null ? makeSeed() : first + index }
    })));
    const images = settled.flatMap(outcome => (outcome.status === 'fulfilled' ? outcome.value : []));
    // Some pictures are better than none; with none, the first problem is the answer.
    if (!images.length) {
      const failed = settled.find(outcome => outcome.status === 'rejected');
      if (failed) throw failed.reason;
    }
    return { images };
  };
}
