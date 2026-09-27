// Converts a normalized presentation back to the file-block JSON protocol.
// Internal image references and derived fields are deliberately translated.
const imageForFile = (image) => {
  if (!image) return null;
  const { kind, index, name, text, alt, fit, focus } = image;
  const reference = kind === 'upload' ? { upload: index }
    : kind === 'asset' ? { src: `asset:${name}` }
      : { placeholder: text || alt || '' };
  return { ...reference, alt, fit, focus };
};

const slideForFile = (slide) => {
  const { sourceIndex: _sourceIndex, continuation: _continuation, trend: _trend, ...copy } = slide;
  if (copy.image) copy.image = imageForFile(copy.image);
  if (copy.images) copy.images = copy.images.map(({ image, ...item }) => ({ ...imageForFile(image), ...item }));
  return copy;
};

export function serializeDeckSpec(spec) {
  const design = spec.preset
    ? { preset: spec.preset, accent: spec.design.accent, accent2: spec.design.accent2 }
    : { ...spec.design };
  return JSON.stringify({
    ...spec.meta,
    language: spec.meta.language,
    design,
    slides: spec.slides.map(slideForFile)
  }, null, 2);
}
