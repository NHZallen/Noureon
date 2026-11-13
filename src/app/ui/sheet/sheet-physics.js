// The numbers and the arithmetic behind every sheet that rises from the bottom (ui/sheet/bottom-sheet.js), measured frame by frame
// from a screen recording of the reference (60 fps, a 393 × 852 phone):
//  - the card floats: 8 from the screen at both sides and at the bottom, 28 round, its top edge at 47% of the screen (the "medium" height);
//  - pulled up, the gaps shrink in step with the top edge and are 0 when the card has its large height (its top edge just under the status bar);
//  - it follows the finger 1:1; on release a critically damped spring settles it, with no bounce (it slows down into the stop in about
//    0.4 s, whether it comes in from below or goes back to the medium height from a pull a little past it).
// Pure functions, no DOM: the engine calls them every frame and the tests call them directly.

export const SIDE_GAP = 8;
export const BOTTOM_GAP = 8;
export const RADIUS = 28;
// How tall the card is at first, as a share of the screen, when what it holds is taller than that (a shorter content makes a shorter card).
export const MEDIUM_FRACTION = 0.52;
export const STIFFNESS = 380;
const PROJECTION = 0.2;
const FLICK = 650;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/**
 * Where everything is when the card's top edge is at `top` (px from the top of the screen). `medium` and `large` are the top edges at
 * those two heights. Below the medium height the card only slides down (its size stays); above it, it grows and the gaps close.
 */
export function geometry({ top, medium, large, sideGap = SIDE_GAP, bottomGap = BOTTOM_GAP, radius = RADIUS }) {
  const progress = medium > large ? clamp((medium - top) / (medium - large), 0, 1) : 0;
  return {
    progress,
    top: Math.min(top, medium),
    shift: Math.max(0, top - medium),
    side: sideGap * (1 - progress),
    bottom: bottomGap * (1 - progress),
    bottomRadius: radius * (1 - progress)
  };
}

/** Pulled above the large height the card gives only a little (a fifth of the pull). */
export const resist = (top, large) => (top < large ? large + (top - large) * 0.2 : top);

/**
 * What a release ends in. `velocity` is px per second, down positive. `mediumHeight` is the height of the card at the medium stop.
 * Returns 'large', 'medium' or 'close'.
 */
export function decideRelease({ top, velocity = 0, medium, large, mediumHeight, expandable = true, closable = true }) {
  if (velocity > FLICK) return top < medium - 40 && expandable ? 'medium' : closable ? 'close' : 'medium';
  if (velocity < -FLICK && expandable) return 'large';
  const projected = top + velocity * PROJECTION;
  if (closable && projected > medium + mediumHeight * 0.4) return 'close';
  if (!expandable) return 'medium';
  return Math.abs(projected - large) < Math.abs(projected - medium) ? 'large' : 'medium';
}

/** One step of the spring that settles the card (semi-implicit Euler, critically damped: it only slows down into its stop). */
export function springStep({ x, v }, target, dt, { stiffness = STIFFNESS } = {}) {
  const damping = 2 * Math.sqrt(stiffness);
  const velocity = v + (-stiffness * (x - target) - damping * v) * dt;
  return { x: x + velocity * dt, v: velocity };
}

/** A speed from the last touches ([{ t (ms), y }]): the slope over the final 100 ms, px per second. */
export function velocityOf(samples) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const sample of samples) {
    if (last.t - sample.t <= 100) { first = sample; break; }
  }
  const span = last.t - first.t;
  return span > 0 ? ((last.y - first.y) / span) * 1000 : 0;
}
