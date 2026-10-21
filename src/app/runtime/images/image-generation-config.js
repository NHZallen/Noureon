export const IMAGE_ASPECT_RATIOS = Object.freeze([
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '7:5', '5:7',
  '1:2', '2:1', '1:4', '4:1', '1:8', '8:1', '9:21', '21:9'
]);

export const IMAGE_RESOLUTIONS = Object.freeze(['512', '768', '1K', '1.5K', '2K', '4K']);
// How big each tier is, in K (the nearest tier is picked by this).
const TIER_SIZE = Object.freeze({ '512': 0.5, '768': 0.75, '1K': 1, '1.5K': 1.5, '2K': 2, '4K': 4 });

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

const ratioValue = (ratio) => {
  const [width, height] = String(ratio).split(':').map(Number);
  return width > 0 && height > 0 ? Math.log(width / height) : NaN;
};

/**
 * The ratio to use with a model that takes only `supported`: the asked-for one when it is there, otherwise the supported one
 * closest in shape ('auto' and anything unreadable go to 1:1, or the first listed). Without a list every ratio is allowed.
 */
export function resolveSupportedAspectRatio(aspectRatio, supported) {
  if (!Array.isArray(supported) || supported.length === 0 || supported.includes(aspectRatio)) return aspectRatio;
  const wanted = ratioValue(aspectRatio);
  if (Number.isNaN(wanted)) return supported.includes('1:1') ? '1:1' : supported[0];
  let best = supported[0];
  let bestGap = Infinity;
  for (const candidate of supported) {
    const gap = Math.abs(ratioValue(candidate) - wanted);
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * The resolution to use with a model that takes only `supported`: the asked-for one when it is there, otherwise the nearest tier.
 * An empty list (the model sets its own size) gives '' so nothing is sent; without a list every tier is allowed.
 */
export function resolveSupportedResolution(resolution, supported) {
  if (!Array.isArray(supported)) return resolution;
  if (supported.length === 0) return '';
  if (supported.includes(resolution)) return resolution;
  const rank = (tier) => TIER_SIZE[tier] ?? 1;
  const wanted = rank(resolution);
  let best = supported[0];
  for (const candidate of supported) {
    const gap = Math.abs(rank(candidate) - wanted);
    const bestGap = Math.abs(rank(best) - wanted);
    if (gap < bestGap || (gap === bestGap && rank(candidate) < rank(best))) best = candidate;
  }
  return best;
}
