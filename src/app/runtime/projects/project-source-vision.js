// A picture (or the pages of a scanned PDF) read for a project as a source (docs/superpowers/specs/2026-10-31-projects-design.md, §13): a model that sees looks at it once, when the person adds
// it, and writes down the text in it and what it shows; that text is the source (the picture itself is not kept). The model is the one of the open chat when it sees and has a key, else the first
// model that sees and has a key. Everything the browser gives (the models, the keys, the one-shot model call, shrinking a picture, drawing the pages of a PDF) comes in through `deps`.

export const VISION_PROMPT = [
  'You are reading {what} that a person added as a source to a project, so that someone who cannot see {them} can answer questions about {them} later.',
  '1. Write down all the text that is visible, exactly as it is written, keeping the order and the structure (a table as plain rows, a list as a list).',
  '2. Then describe what {they} show{s}: the kind of image, the layout, the objects and people, and for a chart or a diagram its type, its labels and every number you can read.',
  'Do not add an opening or a closing remark. Write in the language of the text in {them}, or in English when there is none.'
].join('\n');

const prompt = (many) => VISION_PROMPT
  .replaceAll('{what}', many ? 'the pages of a document' : 'a picture')
  .replaceAll('{them}', many ? 'them' : 'it')
  .replaceAll('{they}', many ? 'they' : 'it')
  .replaceAll('{s}', many ? '' : 's');

/** The model that looks at pictures: the open chat's when it sees and has a key, else the first model that sees and has a key ('' when there is none). */
export function pickVisionModel({ models = [], currentId = '', supportsVision = () => false, hasKey = () => false } = {}) {
  const usable = (model) => model && model.category !== 'image_generation' && model.outputModality !== 'image' && supportsVision(model) && hasKey(model.provider);
  const current = models.find((model) => model.id === currentId);
  return (usable(current) ? current : models.find(usable))?.id || '';
}

const toBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/**
 * deps: getModels(), supportsVision(model), hasKey(provider), getCurrentModelId(), getRunner() (the one-shot model call: ({ modelId, parts }) -> text),
 * shrinkImage({ mimeType, bytes }) -> { mimeType, bytes } (optional), renderPdfPages(bytes, { maxPages }) -> [{ mimeType, bytes }] (optional).
 * Gives { readImage(file), readScan(bytes), available() }; the readers answer { ok: true, text } or { ok: false, code } ('no_vision_model', 'unreadable', 'empty').
 */
export function createVisionReader({ getModels = () => [], supportsVision = () => false, hasKey = () => false, getCurrentModelId = () => '', getRunner = () => null, shrinkImage = async (image) => image, renderPdfPages = null, maxPages = 8 } = {}) {
  const model = () => pickVisionModel({ models: getModels(), currentId: getCurrentModelId(), supportsVision, hasKey });
  const ask = async (images, many) => {
    const modelId = model();
    const runner = getRunner();
    if (!modelId || !runner) return { ok: false, code: 'no_vision_model' };
    try {
      const parts = [{ text: prompt(many) }];
      images.forEach((image, index) => {
        if (many) parts.push({ text: `Page ${index + 1}:` });
        parts.push({ inlineData: { mimeType: image.mimeType, data: toBase64(image.bytes), name: image.name || `page-${index + 1}` } });
      });
      const text = String(await runner({ modelId, parts }) ?? '').trim();
      return text ? { ok: true, text } : { ok: false, code: 'empty' };
    } catch {
      return { ok: false, code: 'unreadable' };
    }
  };
  return {
    available: () => Boolean(model() && getRunner()),
    async readImage(file) {
      if (!model() || !getRunner()) return { ok: false, code: 'no_vision_model' };
      const image = await shrinkImage({ mimeType: file.type || 'image/jpeg', bytes: new Uint8Array(await file.arrayBuffer()), name: file.name });
      const seen = await ask([image], false);
      return seen.ok ? { ok: true, text: `[Picture: ${String(file.name || 'picture').slice(0, 120)}]\n${seen.text}` } : seen;
    },
    async readScan(bytes) {
      if (!model() || !getRunner()) return { ok: false, code: 'no_vision_model' };
      if (!renderPdfPages) return { ok: false, code: 'empty' };
      let pages;
      try { pages = await renderPdfPages(bytes, { maxPages }); } catch { return { ok: false, code: 'unreadable' }; }
      if (!pages?.length) return { ok: false, code: 'empty' };
      return ask(pages, true);
    }
  };
}
