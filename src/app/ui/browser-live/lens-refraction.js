// The bending of the light at the rim of the glass circle (Allen, 2026-11-19: the flat zoom looked cheap). A lens is not a magnifier with a hard edge: the middle
// shows the picture big and even, and towards the rim the picture is squeezed, because the rim shows what is farther out (the dome of a glass ball), with a very small
// split of the colours (the three colours bend a little differently). How it is done (the way "liquid glass" is made on the web: an SVG filter with a map of
// displacements, https://kube.io/blog/liquid-glass-css-svg): a small picture (the map) says, for every point, how far to the side the filter looks for the real
// pixel; red is the way to the right, green the way down, 128 is no move. The middle of the map is 128, the rim is more and more outward. The filter is put on a
// box a little bigger than the circle (so that the rim has something outside it to look at) and the circle cuts the result round.
// Where it cannot be done well (Safari draws a picture inside a filter badly, a place without a canvas) there is no filter and the circle keeps the flat zoom.

const PAD = 1.5;                 // the box of the filter is this much bigger than the circle
const REACH = 0.36;              // how far out the rim looks, in radiuses of the circle, at the rim
const SPLIT = [1, 0.975, 0.95];  // red, green and blue bend by this much of it
const MAP_SIZE = 192;
const NS = 'http://www.w3.org/2000/svg';
let mapUrl;
let counter = 0;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The map as a PNG (made once). Points inside the first half of the radius are not moved; then more and more, outward from the middle.
function displacementMap(document) {
  if (mapUrl !== undefined) return mapUrl;
  mapUrl = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_SIZE; canvas.height = MAP_SIZE;
    const context = canvas.getContext?.('2d');
    if (!context || typeof context.createImageData !== 'function' || typeof canvas.toDataURL !== 'function') return mapUrl;
    const image = context.createImageData(MAP_SIZE, MAP_SIZE);
    const half = MAP_SIZE / 2;
    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        // In radiuses of the circle: the map is the box, and the box reaches PAD radiuses to each side of the middle.
        const dx = (x + 0.5 - half) / half * PAD;
        const dy = (y + 0.5 - half) / half * PAD;
        const r = Math.hypot(dx, dy);
        const move = r === 0 ? 0 : Math.pow(smooth(0.45, 1.05, r), 1.6);
        const o = (y * MAP_SIZE + x) * 4;
        image.data[o] = Math.round(128 + 127 * move * (dx / (r || 1)));
        image.data[o + 1] = Math.round(128 + 127 * move * (dy / (r || 1)));
        image.data[o + 2] = 128;
        image.data[o + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    mapUrl = canvas.toDataURL('image/png') || null;
  } catch {
    mapUrl = null;
  }
  return mapUrl;
}

// Safari draws the map of a filter in the wrong place when the box is moved and scaled; it keeps the flat zoom.
function worksHere(document) {
  const view = document.defaultView;
  const agent = String(view?.navigator?.userAgent || '');
  if (!agent || (/safari/i.test(agent) && !/chrome|chromium|android|firefox/i.test(agent))) return false;
  return typeof document.createElementNS === 'function' && Boolean(view?.CSS?.supports?.('filter', 'url(#a)'));
}

/**
 * Wraps the inside of a glass circle: returns { box, resize(diameter) }. `box` is the element the picture goes into (it is `PAD` times as big as the circle and
 * centred on it); `resize` tells the diameter of the circle in pixels (the displacement is measured in pixels), and `padding` how far the box sticks out on each side.
 * Returns null when the bending cannot be done here.
 */
export function createRefraction({ document, glass }) {
  if (!worksHere(document)) return null;
  const url = displacementMap(document);
  if (!url) return null;
  counter += 1;
  const id = `bl-refract-${counter}`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.style.position = 'absolute';
  const el = (name, attrs, parent) => { const node = document.createElementNS(NS, name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); parent?.append(node); return node; };
  const filter = el('filter', { id, x: '0', y: '0', width: '1', height: '1', 'color-interpolation-filters': 'sRGB' }, svg);
  const image = el('feImage', { href: url, x: '0', y: '0', width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'map' }, filter);
  image.setAttributeNS?.('http://www.w3.org/1999/xlink', 'xlink:href', url);
  const channels = [['R', '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'], ['G', '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'], ['B', '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0']];
  const displacers = channels.map(([name, matrix]) => {
    const displace = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G', result: `d${name}` }, filter);
    el('feColorMatrix', { in: `d${name}`, type: 'matrix', values: matrix, result: `c${name}` }, filter);
    return displace;
  });
  el('feComposite', { in: 'cR', in2: 'cG', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'rg' }, filter);
  el('feComposite', { in: 'rg', in2: 'cB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0' }, filter);
  const box = document.createElement('div');
  box.className = 'bl-refract';
  box.style.filter = `url(#${id})`;
  glass.append(svg, box);
  let last = 0;
  return {
    box,
    padding: (diameter) => (PAD - 1) / 2 * diameter,
    resize(diameter) {
      if (!(diameter > 0) || diameter === last) return;
      last = diameter;
      const side = diameter * PAD;
      box.style.width = `${side}px`; box.style.height = `${side}px`;
      box.style.left = `${-(side - diameter) / 2}px`; box.style.top = `${-(side - diameter) / 2}px`;
      // The most the rim looks outward is REACH radiuses; the colour value of the map is 0.5 either way, so the scale is twice that.
      const reach = REACH * (diameter / 2);
      displacers.forEach((displace, index) => displace.setAttribute('scale', String((2 * reach * SPLIT[index]).toFixed(2))));
    },
    destroy() { svg.remove(); box.remove(); }
  };
}
