// The ratios of the screen of the browser agent (design section 6): 4:3 at first, 16:9 and the upright one a person can switch to in the focus mode. The card in the
// conversation follows the choice and does not go back by itself. The host sets its virtual screen to the size.

export const RATIOS = Object.freeze({
  '4:3': Object.freeze({ width: 1024, height: 768 }),
  '16:9': Object.freeze({ width: 1280, height: 720 }),
  portrait: Object.freeze({ width: 768, height: 1024 })
});
export const DEFAULT_RATIO = '4:3';
export const RATIO_KEYS = Object.freeze(Object.keys(RATIOS));

export const isRatio = (key) => Object.prototype.hasOwnProperty.call(RATIOS, key);
export const ratioOf = (key) => RATIOS[isRatio(key) ? key : DEFAULT_RATIO];
/** The value of CSS `aspect-ratio` for a ratio. */
export const cssRatio = (key) => {
  const { width, height } = ratioOf(key);
  return `${width} / ${height}`;
};
