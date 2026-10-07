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

export function createOpenRouterImageGenerator({ fetchImpl = fetch } = {}) {
  return async function generateOpenRouterImage({
    apiKey,
    model,
    prompt,
    config = {},
    inputReferences = [],
    signal
  }) {
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
    return { images: (body.data || []).map(normalizeImage).filter(image => image.b64Json) };
  };
}
