export const IMAGE_ASPECT_RATIOS = Object.freeze([
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4',
  '1:2', '2:1', '1:4', '4:1', '1:8', '8:1', '9:21', '21:9'
]);

export const IMAGE_RESOLUTIONS = Object.freeze(['512', '1K', '2K', '4K']);

export const DEFAULT_IMAGE_GENERATION_CONFIG = Object.freeze({
  aspectRatio: '1:1',
  resolution: '1K'
});

export function normalizeImageGenerationConfig(value = {}) {
  return {
    aspectRatio: IMAGE_ASPECT_RATIOS.includes(value.aspectRatio)
      ? value.aspectRatio
      : DEFAULT_IMAGE_GENERATION_CONFIG.aspectRatio,
    resolution: IMAGE_RESOLUTIONS.includes(value.resolution)
      ? value.resolution
      : DEFAULT_IMAGE_GENERATION_CONFIG.resolution
  };
}
