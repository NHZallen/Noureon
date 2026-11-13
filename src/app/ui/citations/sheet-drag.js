// What a pull on the handle of a sheet from the bottom ends in. Shared by every such sheet (the sources, the "+" sheet), so
// they all close, grow and settle in the same way.

export const CLOSE_DISTANCE = 110;
export const EXPAND_DISTANCE = 60;
export const FAST = 0.6;

/**
 * `dy` is how far the pull went down (negative: up), `speed` how fast (px per ms, the same sign). 'large' and 'medium' are the two
 * heights of a sheet that can be pulled up; a sheet that cannot is only ever closed or left.
 */
export function decideSheetDrag({ state = 'medium', dy = 0, speed = 0, expandable = false }) {
  const down = dy > CLOSE_DISTANCE || speed > FAST;
  const up = dy < -EXPAND_DISTANCE || speed < -FAST;
  if (down) return expandable && state === 'large' ? 'medium' : 'close';
  if (up && expandable) return 'large';
  return state;
}
