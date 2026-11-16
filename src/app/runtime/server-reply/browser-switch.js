// A temporary switch to try the browser agent on the test site (Linear NOU-205): `?browser=1` in the address turns it on for this browser, `?browser=0` off again. It is kept in this browser
// only, and it only asks: the server decides (the list of who may use it, the settings). The switch of the "+" menu of the design (Sun) takes its place.
import { modelSupportsVision } from '../shell/model-registry.js';

const KEY = 'noureon.browserAgent';

/** Whether the request of this reply asks for the browser: the switch is on, and the model can see pictures (the page of a site is looked at through a picture). */
export function browserAsked(modelInfo, win = globalThis) {
  try {
    const given = new URLSearchParams(win.location?.search || '').get('browser');
    if (given === '1' || given === '0') win.localStorage.setItem(KEY, given);
    return win.localStorage.getItem(KEY) === '1' && Boolean(modelSupportsVision(modelInfo));
  } catch {
    return false;
  }
}
