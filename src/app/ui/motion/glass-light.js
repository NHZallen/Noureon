// The light on the glass buttons turns a little as the chat scrolls, the way iOS glass catches light when
// the phone tilts. Scrolling stands in for the tilt (reading device motion needs a permission prompt on
// iOS). The angle only swings a few degrees around top-left, and only three custom properties change.

const REST_ANGLE = -135; // degrees; 0 = light from the right, -90 = from above, y grows downward
const SWING = 24;
const SCROLL_PERIOD = 320; // px of scrolling per radian of swing

export const glassLightState = (scrollTop) => {
  const degrees = REST_ANGLE + SWING * Math.sin(scrollTop / SCROLL_PERIOD);
  const radians = (degrees * Math.PI) / 180;
  const lx = Math.cos(radians);
  const ly = Math.sin(radians);
  // CSS gradient angles run clockwise from "up"; the sheen starts at the light and fades away from it.
  const sheen = (Math.atan2(-lx, ly) * 180) / Math.PI;
  return {
    lx: lx.toFixed(3),
    ly: ly.toFixed(3),
    sheen: `${(sheen + 360) % 360 | 0}deg`
  };
};

export function installGlassLight(doc = document) {
  const view = doc.defaultView;
  const scroller = doc.getElementById('chat-container');
  const workspace = doc.getElementById('chat-workspace');
  if (!view || !scroller || !workspace || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  let frame = 0;
  const apply = () => {
    frame = 0;
    const { lx, ly, sheen } = glassLightState(scroller.scrollTop);
    workspace.style.setProperty('--glass-lx', lx);
    workspace.style.setProperty('--glass-ly', ly);
    workspace.style.setProperty('--glass-sheen', sheen);
  };
  const onScroll = () => { if (!frame) frame = view.requestAnimationFrame(apply); };

  scroller.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    scroller.removeEventListener('scroll', onScroll);
    if (frame) view.cancelAnimationFrame(frame);
    ['--glass-lx', '--glass-ly', '--glass-sheen'].forEach((name) => workspace.style.removeProperty(name));
  };
}
