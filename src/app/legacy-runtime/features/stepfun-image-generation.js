const STEP_PLAN_IMAGE_API_URL = '/api/step-plan-images';

const STEP_IMAGE_SIZES = Object.freeze({
  '1:1': '1024x1024',
  '16:9': '768x1360',
  '9:16': '1360x768',
  '4:3': '896x1184',
  '3:4': '1184x896'
});

const boundedNumber = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
};

const copyIfDefined = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
};

const getStepOptions = (config = {}) => ({
  ...config,
  ...(config.stepfun && typeof config.stepfun === 'object' ? config.stepfun : {})
});

const getMediaType = (b64Json = '') => {
  if (b64Json.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64Json.startsWith('/9j/')) return 'image/jpeg';
  if (b64Json.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
};

export function buildStepFunImagePayload({ model, prompt, config = {} }) {
  const options = getStepOptions(config);
  const payload = {
    model,
    prompt,
    response_format: 'b64_json',
    size: STEP_IMAGE_SIZES[options.aspectRatio] || STEP_IMAGE_SIZES['1:1'],
    cfg_scale: boundedNumber(options.cfgScale ?? options.cfg_scale, 1, 1, 10),
    steps: boundedNumber(options.steps, 8, 1, 50),
    text_mode: options.textMode === true || options.text_mode === true
  };
  const seed = boundedNumber(options.seed, null, 0, 2147483647);
  if (seed !== null) payload.seed = seed;
  copyIfDefined(payload, 'negative_prompt', options.negativePrompt ?? options.negative_prompt);
  return payload;
}

const makeImageFile = async (dataUrl) => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Could not read the selected image for editing');
  const blob = await response.blob();
  return new Blob([blob], { type: blob.type || 'image/png' });
};

export function buildStepFunEditForm({ model, prompt, config = {}, inputReference }) {
  if (!inputReference) throw new Error('An image is required for editing');
  const payload = buildStepFunImagePayload({ model, prompt, config });
  delete payload.size;
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => form.append(key, String(value)));
  return { form, inputReference };
}

async function readError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body?.error?.message || body?.message || body?.detail || text;
  } catch {
    return text || response.statusText;
  }
}

const normalizeImages = (body = {}) => (body.data || [])
  .filter((image) => image?.b64_json)
  .map((image) => ({
    b64Json: image.b64_json,
    mediaType: getMediaType(image.b64_json)
  }));

export function createStepFunImageGenerator({ fetchImpl = fetch } = {}) {
  return async function generateStepFunImage({
    apiKey,
    model,
    prompt,
    config = {},
    inputReferences = [],
    signal
  }) {
    if (!apiKey) throw new Error('請先在設定中填入 Step Plan API Key');
    if (inputReferences.length > 1) throw new Error('Step Image Edit 2 每次只能使用一張圖片附件。');

    const editing = inputReferences.length === 1;
    let body;
    let headers = { Authorization: `Bearer ${apiKey}` };
    if (editing) {
      const { form, inputReference } = buildStepFunEditForm({ model, prompt, config, inputReference: inputReferences[0] });
      form.set('image', await makeImageFile(inputReference), 'step-image-input.png');
      body = form;
    } else {
      headers = { ...headers, 'Content-Type': 'application/json' };
      body = JSON.stringify(buildStepFunImagePayload({ model, prompt, config }));
    }

    const response = await fetchImpl(`${STEP_PLAN_IMAGE_API_URL}?operation=${editing ? 'edits' : 'generations'}`, {
      method: 'POST',
      headers,
      body,
      signal
    });
    if (!response.ok) throw new Error(await readError(response));
    return { images: normalizeImages(await response.json()) };
  };
}
