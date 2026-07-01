const IMAGE_API_URL = 'https://openrouter.ai/api/v1/images';

const copyIfDefined = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
};

export function buildOpenRouterImagePayload({ model, prompt, config = {}, inputReferences = [], stream = false }) {
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
  if (stream) payload.stream = true;
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

async function consumeImageStream(response, onPartial) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const images = [];
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      const event = JSON.parse(data);
      if (event.type === 'error') throw new Error(event.error?.message || 'Image generation failed');
      if (event.type === 'image_generation.partial_image') {
        onPartial?.({
          index: event.partial_image_index || 0,
          b64Json: event.b64_json || '',
          mediaType: event.media_type || 'image/png'
        });
      }
      if (event.type === 'image_generation.completed') images.push(normalizeImage(event));
    }
    if (done) break;
  }
  return { images };
}

export function createOpenRouterImageGenerator({ fetchImpl = fetch } = {}) {
  return async function generateOpenRouterImage({
    apiKey,
    model,
    prompt,
    config = {},
    inputReferences = [],
    signal,
    onPartial
  }) {
    const stream = typeof onPartial === 'function';
    const response = await fetchImpl(IMAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildOpenRouterImagePayload({ model, prompt, config, inputReferences, stream })),
      signal
    });
    if (!response.ok) throw new Error(await readError(response));
    if (stream) return consumeImageStream(response, onPartial);
    const body = await response.json();
    return { images: (body.data || []).map(normalizeImage).filter(image => image.b64Json) };
  };
}
