// Shape geometry of a .pptx for the preview: the preset shapes people draw
// most (rectangles, ellipses, arrows, triangles …) and custom paths. Presets
// this does not know are drawn as rectangles.

const children = (node, name) => [...(node?.children || [])].filter((item) => item.localName === name);
const child = (node, name) => children(node, name)[0] || null;

// Outlines on a unit square.
const POLYGONS = Object.freeze({
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  rtTriangle: [[0, 0], [0, 1], [1, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  pentagon: [[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]],
  parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
  trapezoid: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]],
  rightArrow: [[0, 0.25], [0.6, 0.25], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.75], [0, 0.75]],
  leftArrow: [[1, 0.25], [0.4, 0.25], [0.4, 0], [0, 0.5], [0.4, 1], [0.4, 0.75], [1, 0.75]],
  upArrow: [[0.25, 1], [0.25, 0.4], [0, 0.4], [0.5, 0], [1, 0.4], [0.75, 0.4], [0.75, 1]],
  downArrow: [[0.25, 0], [0.25, 0.6], [0, 0.6], [0.5, 1], [1, 0.6], [0.75, 0.6], [0.75, 0]],
  chevron: [[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]],
  homePlate: [[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1]]
});
const ROUNDED = new Set(['roundRect', 'round1Rect', 'round2SameRect', 'round2DiagRect', 'snipRoundRect', 'flowChartAlternateProcess']);
const ELLIPSES = new Set(['ellipse', 'flowChartConnector', 'flowChartSummingJunction']);

function adjustment(geometry) {
  const guide = child(child(geometry, 'avLst'), 'gd');
  const match = /val\s+(-?\d+)/.exec(guide?.getAttribute('fmla') || '');
  return match ? Number(match[1]) / 100000 : null;
}

/** The element fields (shape, radius or segments) for a preset shape in `box`. */
export function presetShape(preset, geometry, box) {
  if (ELLIPSES.has(preset)) return { shape: 'ellipse' };
  if (ROUNDED.has(preset)) {
    const share = Math.min(0.5, adjustment(geometry) ?? 0.16667);
    return { shape: 'rounded', radius: Math.min(box.w, box.h) * share };
  }
  const points = POLYGONS[preset];
  if (points) {
    return {
      shape: 'custom',
      segments: [
        ...points.map(([x, y], index) => ({ type: index ? 'L' : 'M', x: x * box.w, y: y * box.h })),
        { type: 'Z' }
      ]
    };
  }
  return { shape: 'rect' };
}

/** Segments (relative to the box) of a custom geometry made of straight lines and curves. */
export function customSegments(geometry, box) {
  const segments = [];
  for (const path of children(child(geometry, 'pathLst'), 'path')) {
    const width = Number(path.getAttribute('w')) || 0;
    const height = Number(path.getAttribute('h')) || 0;
    if (!width || !height) continue;
    const sx = box.w / width;
    const sy = box.h / height;
    const point = (node) => {
      const at = child(node, 'pt');
      return at ? [Number(at.getAttribute('x')) * sx, Number(at.getAttribute('y')) * sy] : null;
    };
    let current = [0, 0];
    for (const command of path.children) {
      if (command.localName === 'moveTo') {
        const to = point(command);
        if (to) { segments.push({ type: 'M', x: to[0], y: to[1] }); current = to; }
      } else if (command.localName === 'lnTo') {
        const to = point(command);
        if (to) { segments.push({ type: 'L', x: to[0], y: to[1] }); current = to; }
      } else if (command.localName === 'cubicBezTo') {
        const points = children(command, 'pt').map((at) => [Number(at.getAttribute('x')) * sx, Number(at.getAttribute('y')) * sy]);
        if (points.length === 3) { segments.push({ type: 'C', x1: points[0][0], y1: points[0][1], x2: points[1][0], y2: points[1][1], x: points[2][0], y: points[2][1] }); current = points[2]; }
      } else if (command.localName === 'quadBezTo') {
        const points = children(command, 'pt').map((at) => [Number(at.getAttribute('x')) * sx, Number(at.getAttribute('y')) * sy]);
        if (points.length === 2) {
          const [control, end] = points;
          segments.push({
            type: 'C',
            x1: current[0] + (2 / 3) * (control[0] - current[0]), y1: current[1] + (2 / 3) * (control[1] - current[1]),
            x2: end[0] + (2 / 3) * (control[0] - end[0]), y2: end[1] + (2 / 3) * (control[1] - end[1]),
            x: end[0], y: end[1]
          });
          current = end;
        }
      } else if (command.localName === 'close') {
        segments.push({ type: 'Z' });
      }
    }
  }
  return segments.length ? segments : null;
}
