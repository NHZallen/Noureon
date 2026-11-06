// The pixel work of editing every frame of a GIF at once (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §11): the frames are laid out in one picture (a sheet: a grid, read from left to right and from top to
// bottom), the picture model changes the sheet in one go (so a change is the same in every frame), and the sheet is cut up again. What the model draws is not the original down to the pixel, so only the places that
// really changed are put back on the original frames; the rest of each frame stays what it was. Plain arrays only (RGBA in a Uint8ClampedArray): the page and the server share this file.

export const SHEET_MAX_EDGE = 2048;

/** The grid for `count` frames of `width` by `height`: columns, rows, the size of a cell (the frames are made smaller when the sheet would be longer than SHEET_MAX_EDGE) and of the sheet. */
export function sheetLayout(count, width, height, maxEdge = SHEET_MAX_EDGE) {
  // As square as the whole sheet can be (wide frames make a few more columns than rows).
  const columns = Math.ceil(Math.sqrt(count * height / width));
  const cols = Math.max(1, Math.min(count, columns));
  const rows = Math.ceil(count / cols);
  const scale = Math.min(1, maxEdge / (cols * width), maxEdge / (rows * height));
  const cellWidth = Math.max(8, Math.round(width * scale));
  const cellHeight = Math.max(8, Math.round(height * scale));
  return { count, columns: cols, rows, cellWidth, cellHeight, width: cols * cellWidth, height: rows * cellHeight };
}

/** `source` (RGBA of `fromWidth` by `fromHeight`) drawn to `width` by `height` (averaging the pixels it covers when it gets smaller, bilinear when it gets larger). */
export function resizeRgba(source, fromWidth, fromHeight, width, height) {
  if (fromWidth === width && fromHeight === height) return source;
  const out = new Uint8ClampedArray(width * height * 4);
  const xRatio = fromWidth / width;
  const yRatio = fromHeight / height;
  for (let y = 0; y < height; y += 1) {
    const y0 = y * yRatio;
    const y1 = Math.min(fromHeight, y0 + yRatio);
    for (let x = 0; x < width; x += 1) {
      const x0 = x * xRatio;
      const x1 = Math.min(fromWidth, x0 + xRatio);
      let r = 0; let g = 0; let b = 0; let a = 0; let weight = 0;
      const startY = Math.floor(y0);
      const endY = Math.max(startY, Math.ceil(y1) - 1);
      const startX = Math.floor(x0);
      const endX = Math.max(startX, Math.ceil(x1) - 1);
      for (let sy = startY; sy <= endY; sy += 1) {
        const wy = Math.max(0.0001, Math.min(sy + 1, y1) - Math.max(sy, y0));
        for (let sx = startX; sx <= endX; sx += 1) {
          const w = wy * Math.max(0.0001, Math.min(sx + 1, x1) - Math.max(sx, x0));
          const at = (Math.min(fromHeight - 1, sy) * fromWidth + Math.min(fromWidth - 1, sx)) * 4;
          const alpha = source[at + 3] * w;
          r += source[at] * alpha; g += source[at + 1] * alpha; b += source[at + 2] * alpha; a += alpha; weight += w;
        }
      }
      const to = (y * width + x) * 4;
      if (a > 0) { out[to] = r / a; out[to + 1] = g / a; out[to + 2] = b / a; }
      out[to + 3] = weight ? a / weight : 0;
    }
  }
  return out;
}

/** The sheet as RGBA: the frames (RGBA of `frameWidth` by `frameHeight`, a hole in a frame becomes white) side by side, cells that no frame fills left white. */
export function buildSheet(frames, layout, frameWidth, frameHeight) {
  const sheet = new Uint8ClampedArray(layout.width * layout.height * 4).fill(255);
  frames.forEach((rgba, index) => {
    const cell = resizeRgba(rgba, frameWidth, frameHeight, layout.cellWidth, layout.cellHeight);
    const left = (index % layout.columns) * layout.cellWidth;
    const top = Math.floor(index / layout.columns) * layout.cellHeight;
    for (let y = 0; y < layout.cellHeight; y += 1) {
      for (let x = 0; x < layout.cellWidth; x += 1) {
        const from = (y * layout.cellWidth + x) * 4;
        const to = ((top + y) * layout.width + left + x) * 4;
        const alpha = cell[from + 3] / 255;
        for (let c = 0; c < 3; c += 1) sheet[to + c] = cell[from + c] * alpha + 255 * (1 - alpha);
      }
    }
  });
  return sheet;
}

/** The cells of a sheet (RGBA of `layout.width` by `layout.height`) cut out and brought back to the size of a frame. */
export function sliceSheet(sheet, layout, frameWidth, frameHeight) {
  const cells = [];
  for (let index = 0; index < layout.count; index += 1) {
    const cell = new Uint8ClampedArray(layout.cellWidth * layout.cellHeight * 4);
    const left = (index % layout.columns) * layout.cellWidth;
    const top = Math.floor(index / layout.columns) * layout.cellHeight;
    for (let y = 0; y < layout.cellHeight; y += 1) {
      const from = ((top + y) * layout.width + left) * 4;
      cell.set(sheet.subarray(from, from + layout.cellWidth * 4), y * layout.cellWidth * 4);
    }
    cells.push(resizeRgba(cell, layout.cellWidth, layout.cellHeight, frameWidth, frameHeight));
  }
  return cells;
}

// A small box blur (radius `radius`) of one channel, in two passes.
function blurChannel(values, width, height, radius) {
  if (radius < 1) return values;
  const pass = (input, horizontal) => {
    const out = new Float32Array(input.length);
    const length = horizontal ? width : height;
    const lines = horizontal ? height : width;
    for (let line = 0; line < lines; line += 1) {
      let sum = 0;
      const at = (i) => (horizontal ? line * width + i : i * width + line);
      for (let i = -radius; i <= radius; i += 1) sum += input[at(Math.min(length - 1, Math.max(0, i)))];
      for (let i = 0; i < length; i += 1) {
        out[at(i)] = sum / (radius * 2 + 1);
        sum += input[at(Math.min(length - 1, i + radius + 1))] - input[at(Math.max(0, i - radius))];
      }
    }
    return out;
  };
  return pass(pass(values, true), false);
}

/** How much each pixel changed (0 to 255, the biggest change of a colour after a small blur, so that grain and a pixel of shift do not count), as a Float32Array. */
export function changeMap(original, edited, width, height) {
  const channels = [0, 1, 2].map((c) => {
    const a = new Float32Array(width * height);
    const b = new Float32Array(width * height);
    for (let i = 0; i < width * height; i += 1) { a[i] = original[i * 4 + c]; b[i] = edited[i * 4 + c]; }
    return [blurChannel(a, width, height, 2), blurChannel(b, width, height, 2)];
  });
  const map = new Float32Array(width * height);
  for (let i = 0; i < map.length; i += 1) map[i] = Math.max(Math.abs(channels[0][0][i] - channels[0][1][i]), Math.abs(channels[1][0][i] - channels[1][1][i]), Math.abs(channels[2][0][i] - channels[2][1][i]));
  return map;
}

const THRESHOLDS = [48, 36, 26, 18, 12];

/**
 * The threshold of "this pixel really changed" that keeps the change the person asked for: a frame the person marked has marks on it, and the marked place must have changed. The highest threshold that keeps at
 * least `share` of the marked pixels as changed is taken (the sharpest cut that still holds the edit), or the lowest when none does. `marked` is a Uint8Array of the marked pixels, or null (then 26).
 */
export function calibrateThreshold(maps, marks, share = 0.3) {
  const pairs = maps.map((map, index) => [map, marks[index]]).filter(([, mark]) => mark);
  if (!pairs.length) return 26;
  for (const threshold of THRESHOLDS) {
    let marked = 0; let changed = 0;
    for (const [map, mark] of pairs) for (let i = 0; i < map.length; i += 1) if (mark[i]) { marked += 1; if (map[i] >= threshold) changed += 1; }
    if (marked && changed / marked >= share) return threshold;
  }
  return THRESHOLDS[THRESHOLDS.length - 1];
}

/**
 * The frame with the places that changed taken from `edited` and every other pixel from `original`. The places are the pixels whose change reaches `threshold`, grown by a few pixels and softened at the
 * edge. When more than `maxShare` of the frame changed the edit was meant for the whole picture (a new light, a new style) and `edited` is taken as it is.
 */
export function compositeChanges(original, edited, map, width, height, { threshold = 26, maxShare = 0.4, grow = 6, feather = 3 } = {}) {
  let changed = 0;
  const mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i += 1) if (map[i] >= threshold) { mask[i] = 1; changed += 1; }
  const keepAlpha = (out) => { for (let i = 3; i < out.length; i += 4) out[i] = original[i]; return out; };
  if (changed / mask.length > maxShare) return keepAlpha(Uint8ClampedArray.from(edited));
  if (!changed) return Uint8ClampedArray.from(original);
  const grown = blurChannel(mask, width, height, grow);
  for (let i = 0; i < grown.length; i += 1) grown[i] = grown[i] > 0.02 ? 1 : 0;
  const soft = blurChannel(grown, width, height, feather);
  const out = new Uint8ClampedArray(original.length);
  for (let i = 0; i < soft.length; i += 1) {
    const w = soft[i];
    for (let c = 0; c < 3; c += 1) out[i * 4 + c] = original[i * 4 + c] * (1 - w) + edited[i * 4 + c] * w;
    out[i * 4 + 3] = original[i * 4 + 3];
  }
  return out;
}

/** The places a person marked on a frame: the pixels where `annotated` (the frame with the marks drawn on it) differs from `original`, grown so that what the marks point at is inside. A Uint8Array of 0 and 1. */
export function markMask(original, annotated, width, height) {
  const spots = new Float32Array(width * height);
  let any = false;
  for (let i = 0; i < spots.length; i += 1) {
    const difference = Math.max(Math.abs(original[i * 4] - annotated[i * 4]), Math.abs(original[i * 4 + 1] - annotated[i * 4 + 1]), Math.abs(original[i * 4 + 2] - annotated[i * 4 + 2]));
    if (difference > 40) { spots[i] = 1; any = true; }
  }
  if (!any) return null;
  const grown = blurChannel(spots, width, height, Math.max(6, Math.round(Math.max(width, height) / 16)));
  const mask = new Uint8Array(spots.length);
  for (let i = 0; i < mask.length; i += 1) mask[i] = grown[i] > 0.01 ? 1 : 0;
  return mask;
}

/** The pixels over white (a hole shows as white), as buildSheet draws them. */
export function flattenRgba(rgba) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    for (let c = 0; c < 3; c += 1) out[i + c] = rgba[i + c] * alpha + 255 * (1 - alpha);
    out[i + 3] = 255;
  }
  return out;
}
