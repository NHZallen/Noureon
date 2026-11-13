// The small dial that stands for "how deeply it thinks" on a phone (the button of the thinking panel, model-picker-markup.js): a gauge of
// three quarters of a circle that fills as the level goes up, with a needle that turns with it. On a computer the button shows the name
// of the level instead and this drawing is hidden (model-picker.css). Only strings and one style setter: no browser object is needed.

// The gauge covers 270 degrees, which is 75 of the 100 units a circle is measured in here (pathLength).
const ARC = 75;

const fraction = (position, last) => Math.min(1, Math.max(0, Number(position) / Math.max(1, Number(last))));

/** The two numbers the drawing is made from, as a style text: the share of the gauge that is full and the share of the turn. */
export function dialStyle(position, last) {
  const p = fraction(position, last);
  return `--dial-p:${p.toFixed(4)};--dial-dash:${(p * ARC).toFixed(3)}`;
}

/** The gauge: its track, the filled part, the needle and the hub it turns on. A circle drawn from 3 o'clock is turned to start at 7:30. */
export function dialMarkup() {
  return '<svg class="mp-dial" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<circle class="mp-dial-track" cx="12" cy="12" r="9" pathLength="100"/>'
    + '<circle class="mp-dial-arc" cx="12" cy="12" r="9" pathLength="100"/>'
    + '<line class="mp-dial-needle" x1="12" y1="12" x2="12" y2="7.2"/>'
    + '<circle class="mp-dial-hub" cx="12" cy="12" r="1.3"/>'
    + '</svg>';
}

/** Turns the dial of a button to a level (during a drag too) and marks it when the level is not the model's default one. */
export function setDial(button, position, last, isDefault) {
  if (!button) return;
  const p = fraction(position, last);
  button.style.setProperty('--dial-p', p.toFixed(4));
  button.style.setProperty('--dial-dash', (p * ARC).toFixed(3));
  button.classList.toggle('is-custom', !isDefault);
}
