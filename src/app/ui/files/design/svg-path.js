// A small SVG path reader. It turns path data (and circles and rounded
// rectangles) into absolute move/line/cubic/close segments, which both the
// SVG preview and Office custom geometry can draw. Arcs and quadratic curves
// become cubic Béziers, so every consumer needs only four segment types.

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const ARGUMENT_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function tokenize(d) {
  const tokens = [];
  let index = 0;
  while (index < d.length) {
    const char = d[index];
    if (/[\s,]/.test(char)) {
      index += 1;
    } else if (/[MLHVCSQTAZ]/i.test(char)) {
      tokens.push(char);
      index += 1;
    } else {
      NUMBER.lastIndex = index;
      const match = NUMBER.exec(d);
      if (!match) throw new Error(`invalid path data at ${index}`);
      tokens.push(Number(match[0]));
      index = NUMBER.lastIndex;
    }
  }
  return tokens;
}

// Arc flags must be separated ("a8 8 0 1 1 16 0"); the icon data is written
// that way, and compact flags ("0 1116 0") are rejected rather than misread.
function readFlag(tokens, position) {
  const token = tokens[position];
  if (token === 0 || token === 1) return [token, position + 1];
  throw new Error('invalid arc flag');
}

/** Converts one SVG arc to cubic segments (SVG implementation notes F.6). */
function arcToCubics(x1, y1, rx, ry, angle, largeArc, sweep, x2, y2) {
  if ((x1 === x2 && y1 === y2)) return [];
  if (!rx || !ry) return [{ type: 'L', x: x2, y: y2 }];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const vectorAngle = (ux, uy, vx, vy) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.min(1, Math.max(-1, dot)));
  };
  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const pieces = Math.ceil(Math.abs(delta) / (Math.PI / 2));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (theta) => [cx + rx * Math.cos(theta) * cos - ry * Math.sin(theta) * sin, cy + rx * Math.cos(theta) * sin + ry * Math.sin(theta) * cos];
  const derivative = (theta) => [-rx * Math.sin(theta) * cos - ry * Math.cos(theta) * sin, -rx * Math.sin(theta) * sin + ry * Math.cos(theta) * cos];
  const segments = [];
  for (let piece = 0; piece < pieces; piece += 1) {
    const start = theta1 + piece * step;
    const end = start + step;
    const [sx, sy] = point(start);
    const [ex, ey] = point(end);
    const [dsx, dsy] = derivative(start);
    const [dex, dey] = derivative(end);
    segments.push({ type: 'C', x1: sx + k * dsx, y1: sy + k * dsy, x2: ex - k * dex, y2: ey - k * dey, x: ex, y: ey });
  }
  // Land exactly on the end point despite rounding.
  segments[segments.length - 1].x = x2;
  segments[segments.length - 1].y = y2;
  return segments;
}

/** Parses SVG path data into absolute M/L/C/Z segments. */
export function parsePathData(d) {
  const tokens = tokenize(String(d));
  const segments = [];
  let position = 0;
  let command = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastControl = null;
  let lastQuadratic = null;
  while (position < tokens.length) {
    if (typeof tokens[position] === 'string') {
      command = tokens[position];
      position += 1;
    } else if (!command) {
      throw new Error('path data must start with a command');
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'Z') {
      segments.push({ type: 'Z' });
      x = startX;
      y = startY;
      lastControl = null;
      lastQuadratic = null;
      continue;
    }
    const args = [];
    for (let count = 0; count < ARGUMENT_COUNT[upper]; count += 1) {
      if (upper === 'A' && (count === 3 || count === 4)) {
        let flag;
        [flag, position] = readFlag(tokens, position);
        args.push(flag);
        continue;
      }
      if (typeof tokens[position] !== 'number') throw new Error(`missing arguments for ${command}`);
      args.push(tokens[position]);
      position += 1;
    }
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    let control = null;
    let quadratic = null;
    switch (upper) {
      case 'M':
        x = ox + args[0];
        y = oy + args[1];
        startX = x;
        startY = y;
        segments.push({ type: 'M', x, y });
        // Further pairs after a move are implicit line-tos.
        command = relative ? 'l' : 'L';
        break;
      case 'L':
        x = ox + args[0];
        y = oy + args[1];
        segments.push({ type: 'L', x, y });
        break;
      case 'H':
        x = (relative ? x : 0) + args[0];
        segments.push({ type: 'L', x, y });
        break;
      case 'V':
        y = (relative ? y : 0) + args[0];
        segments.push({ type: 'L', x, y });
        break;
      case 'C':
      case 'S': {
        const [x1, y1] = upper === 'C' ? [ox + args[0], oy + args[1]] : lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
        const rest = upper === 'C' ? args.slice(2) : args;
        const x2 = ox + rest[0];
        const y2 = oy + rest[1];
        x = ox + rest[2];
        y = oy + rest[3];
        segments.push({ type: 'C', x1, y1, x2, y2, x, y });
        control = [x2, y2];
        break;
      }
      case 'Q':
      case 'T': {
        const [qx, qy] = upper === 'Q' ? [ox + args[0], oy + args[1]] : lastQuadratic ? [2 * x - lastQuadratic[0], 2 * y - lastQuadratic[1]] : [x, y];
        const rest = upper === 'Q' ? args.slice(2) : args;
        const ex = ox + rest[0];
        const ey = oy + rest[1];
        segments.push({ type: 'C', x1: x + (2 / 3) * (qx - x), y1: y + (2 / 3) * (qy - y), x2: ex + (2 / 3) * (qx - ex), y2: ey + (2 / 3) * (qy - ey), x: ex, y: ey });
        x = ex;
        y = ey;
        quadratic = [qx, qy];
        break;
      }
      case 'A': {
        const ex = ox + args[5];
        const ey = oy + args[6];
        segments.push(...arcToCubics(x, y, args[0], args[1], args[2], args[3], args[4], ex, ey));
        x = ex;
        y = ey;
        break;
      }
      default:
        throw new Error(`unsupported command ${command}`);
    }
    lastControl = control;
    lastQuadratic = quadratic;
  }
  return segments;
}

const KAPPA = 0.5522847498;

/** A circle as four cubic quarter arcs. */
export function circleSegments(cx, cy, r) {
  const k = r * KAPPA;
  return [
    { type: 'M', x: cx + r, y: cy },
    { type: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { type: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { type: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { type: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { type: 'Z' }
  ];
}

/**
 * A rectangle whose corners have independent radii
 * [topLeft, topRight, bottomRight, bottomLeft] (arches, pills, tabs).
 */
export function roundedRectSegments(x, y, w, h, radii = 0) {
  const clamp = (value) => Math.max(0, Math.min(value, w / 2, h / 2));
  const [tl, tr, br, bl] = (Array.isArray(radii) ? radii : [radii, radii, radii, radii]).map(clamp);
  const segments = [{ type: 'M', x: x + tl, y }];
  const corner = (r, x1, y1, x2, y2, ex, ey) => {
    if (r > 0) segments.push({ type: 'C', x1, y1, x2, y2, x: ex, y: ey });
  };
  segments.push({ type: 'L', x: x + w - tr, y });
  corner(tr, x + w - tr + tr * KAPPA, y, x + w, y + tr - tr * KAPPA, x + w, y + tr);
  segments.push({ type: 'L', x: x + w, y: y + h - br });
  corner(br, x + w, y + h - br + br * KAPPA, x + w - br + br * KAPPA, y + h, x + w - br, y + h);
  segments.push({ type: 'L', x: x + bl, y: y + h });
  corner(bl, x + bl - bl * KAPPA, y + h, x, y + h - bl + bl * KAPPA, x, y + h - bl);
  segments.push({ type: 'L', x, y: y + tl });
  corner(tl, x, y + tl - tl * KAPPA, x + tl - tl * KAPPA, y, x + tl, y);
  segments.push({ type: 'Z' });
  return segments;
}

const round = (value) => Math.round(value * 1000) / 1000;

/** Serialises segments back to compact SVG path data. */
export function segmentsToPathData(segments) {
  return segments.map((segment) => {
    if (segment.type === 'Z') return 'Z';
    if (segment.type === 'C') return `C${[segment.x1, segment.y1, segment.x2, segment.y2, segment.x, segment.y].map(round).join(' ')}`;
    return `${segment.type}${round(segment.x)} ${round(segment.y)}`;
  }).join('');
}

/** Scales and moves segments: point → (point × scale + offset). */
export function transformSegments(segments, { scale = 1, scaleY = scale, dx = 0, dy = 0 } = {}) {
  return segments.map((segment) => {
    if (segment.type === 'Z') return segment;
    const next = { ...segment, x: segment.x * scale + dx, y: segment.y * scaleY + dy };
    if (segment.type === 'C') Object.assign(next, { x1: segment.x1 * scale + dx, y1: segment.y1 * scaleY + dy, x2: segment.x2 * scale + dx, y2: segment.y2 * scaleY + dy });
    return next;
  });
}

/**
 * The organic `blob` motif: CSS border-radius
 * "42% 58% 63% 37% / 41% 44% 56% 59%" in a w × h box, as four quarter
 * ellipses.
 */
export function blobSegments(w, h) {
  const k = KAPPA;
  const a = 0.42 * w;
  const b = 0.44 * h;
  const c = 0.37 * w;
  const d = 0.41 * h;
  return [
    { type: 'M', x: a, y: 0 },
    { type: 'C', x1: a + 0.58 * w * k, y1: 0, x2: w, y2: b - b * k, x: w, y: b },
    { type: 'C', x1: w, y1: b + 0.56 * h * k, x2: c + 0.63 * w * k, y2: h, x: c, y: h },
    { type: 'C', x1: c - c * k, y1: h, x2: 0, y2: d + 0.59 * h * k, x: 0, y: d },
    { type: 'C', x1: 0, y1: d - d * k, x2: a - a * k, y2: 0, x: a, y: 0 },
    { type: 'Z' }
  ];
}

/** Outline of a scene shape relative to its box (rounded, arch or blob). */
export function shapeSegments(element) {
  if (element.segments) return element.segments;
  if (element.shape === 'blob') return blobSegments(element.w, element.h);
  if (element.shape === 'arch') return roundedRectSegments(0, 0, element.w, element.h, [element.w / 2, element.w / 2, element.radius, element.radius]);
  if (element.shape === 'ellipse') return circleSegments(element.w / 2, element.h / 2, element.w / 2).map((segment) => (segment.type === 'Z' ? segment : { ...segment, y: segment.y * element.h / element.w, ...(segment.type === 'C' ? { y1: segment.y1 * element.h / element.w, y2: segment.y2 * element.h / element.w } : {}) }));
  return roundedRectSegments(0, 0, element.w, element.h, element.radius || 0);
}
