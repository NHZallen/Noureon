// The wait for a picture (docs/superpowers/specs/2026-10-10-image-wait-design.md): a field of dots in the colour the person chose for the buttons,
// moving slowly like a cloud, and a line of words that goes through four stages as time passes. There is no percentage: the model gives no sign of how
// far it is, and the words are about how long it has been, not about what it is doing at the moment (see `stageForElapsed`).

// How long it has been, in seconds, when each stage begins. The last one is the honest one: it is taking long, and a picture of high quality does.
export const IMAGE_WAIT_STAGE_STARTS = Object.freeze([0, 6, 16, 40]);
const STAGE_KEYS = Object.freeze(['imageWaitStage1', 'imageWaitStage2', 'imageWaitStage3', 'imageWaitStage4']);
const FALLBACK_COLOR = '#3b82f6';
const CELL = 14; // px between two dots
const FRAME_MS = 1000 / 30;

/** The stage (0 to 3) for a time of waiting, in seconds. */
export function stageForElapsed(seconds) {
  let stage = 0;
  for (let index = 0; index < IMAGE_WAIT_STAGE_STARTS.length; index += 1) if (seconds >= IMAGE_WAIT_STAGE_STARTS[index]) stage = index;
  return stage;
}

const BLOBS = Object.freeze([
  { ax: 0.30, ay: 0.26, fx: 0.31, fy: 0.23, px: 0.0, py: 1.2, r: 0.23 },
  { ax: 0.26, ay: 0.30, fx: 0.19, fy: 0.37, px: 2.1, py: 0.4, r: 0.20 },
  { ax: 0.32, ay: 0.22, fx: 0.27, fy: 0.17, px: 4.0, py: 2.6, r: 0.25 }
]);

/** How strong the field is at a place (nx, ny in 0 to 1) at a time (seconds): 0 to 1, the sum of three soft patches that wander about, and a faint ripple. */
export function dotIntensity(nx, ny, seconds) {
  let value = 0;
  for (const blob of BLOBS) {
    const cx = 0.5 + blob.ax * Math.sin(blob.fx * seconds + blob.px);
    const cy = 0.5 + blob.ay * Math.cos(blob.fy * seconds + blob.py);
    const r = blob.r + 0.03 * Math.sin(0.5 * seconds + blob.px);
    const dx = nx - cx;
    const dy = ny - cy;
    value += Math.exp(-(dx * dx + dy * dy) / (2 * r * r));
  }
  value += 0.07 * Math.sin(7 * nx + 1.3 * seconds) * Math.sin(6 * ny - 0.9 * seconds);
  return Math.max(0, Math.min(1, value));
}

const COLOR_FORM = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]*\))$/i;
const readColor = (doc) => {
  const raw = doc?.defaultView?.getComputedStyle?.(doc.documentElement)?.getPropertyValue?.('--button-primary-bg')?.trim?.() || '';
  return COLOR_FORM.test(raw) ? raw : FALLBACK_COLOR;
};

/** Draws one picture of the field on a 2d context of `width` × `height` CSS pixels. */
export function drawDots(context, { width, height, seconds, color }) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = color;
  const columns = Math.max(1, Math.floor(width / CELL));
  const rows = Math.max(1, Math.floor(height / CELL));
  const offsetX = (width - (columns - 1) * CELL) / 2;
  const offsetY = (height - (rows - 1) * CELL) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const strength = dotIntensity(columns > 1 ? column / (columns - 1) : 0.5, rows > 1 ? row / (rows - 1) : 0.5, seconds);
      context.globalAlpha = 0.1 + 0.78 * strength;
      context.beginPath();
      context.arc(offsetX + column * CELL, offsetY + row * CELL, 0.9 + (CELL * 0.46 - 0.9) * strength, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

/**
 * The behaviour of one waiting place: the words by the time that has passed, and the dots (drawn on `canvas`, moving unless the person asks for less motion).
 * Everything it needs from outside is given, so it can be tried without a page.
 */
export function createImageWait({
  host,
  label,
  canvas,
  startedAt = 0,
  now = () => Date.now(),
  language = 'zh-TW',
  texts = {},
  reducedMotion = false,
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle),
  setTimer = (callback, delay) => globalThis.setInterval(callback, delay),
  clearTimer = (handle) => globalThis.clearInterval(handle),
  color = FALLBACK_COLOR,
  size = () => ({ width: canvas?.clientWidth || 0, height: canvas?.clientHeight || 0, ratio: globalThis.devicePixelRatio || 1 })
}) {
  const begun = startedAt > 0 && startedAt <= now() ? startedAt : now();
  const wordsFor = (stage) => texts[STAGE_KEYS[stage]] || texts.fallback?.[stage] || '';
  let stage = -1;
  let frame = 0;
  let timer = null;
  let lastDraw = -Infinity;
  let running = false;
  const context = canvas?.getContext?.('2d') || null;

  const seconds = () => Math.max(0, (now() - begun) / 1000);

  const showStage = () => {
    const next = stageForElapsed(seconds());
    if (next === stage) return;
    stage = next;
    // A line that another part of the page wrote (the translation of the request, a picture that is gone) stays until it is let go.
    if (!label || label.dataset?.pinned) return;
    label.textContent = wordsFor(stage);
    label.classList?.remove('is-swap');
    if (label.offsetWidth !== undefined) void label.offsetWidth; // so that the move starts again
    label.classList?.add('is-swap');
  };

  const paint = () => {
    if (!context || !canvas) return;
    const { width, height, ratio } = size();
    if (!width || !height) return;
    const scale = Math.min(2, ratio || 1);
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawDots(context, { width, height, seconds: reducedMotion ? 3 : seconds(), color });
  };

  const tick = (time) => {
    if (!running) return;
    if (time - lastDraw >= FRAME_MS) {
      lastDraw = time;
      paint();
    }
    frame = requestFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      // The words come before the first frame, and again each second (a stage can begin at any time).
      stage = -1;
      showStage();
      timer = setTimer(showStage, 1000);
      if (reducedMotion) paint();
      else frame = requestFrame(tick);
    },
    stop() {
      running = false;
      if (frame) cancelFrame(frame);
      if (timer !== null) clearTimer(timer);
      frame = 0;
      timer = null;
    },
    /** The words of the stage are written again (a line that was pinned is let go). */
    refresh() { stage = -1; showStage(); },
    /** The place has changed size: with less motion the one picture is drawn again. */
    resize() { if (running && reducedMotion) paint(); },
    stage: () => stage
  };
}

const defineElement = () => {
  const registry = globalThis.customElements;
  const Base = globalThis.HTMLElement;
  if (!registry || !Base || registry.get('noureon-image-wait')) return;
  class ImageWaitElement extends Base {
    connectedCallback() {
      if (this.__imageWait) return;
      const doc = this.ownerDocument;
      const canvas = doc.createElement('canvas');
      canvas.className = 'generated-image-dots';
      this.appendChild(canvas);
      const language = doc.documentElement.lang || 'zh-TW';
      const bundle = globalThis.i18n || {};
      const texts = { ...(bundle['zh-TW'] || {}), ...(bundle[language] || {}) };
      const controller = createImageWait({
        host: this,
        label: this.parentElement?.querySelector?.('.generated-image-wait-label') || null,
        canvas,
        startedAt: Number(this.dataset.started) || 0,
        language,
        texts,
        reducedMotion: !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
        color: readColor(doc)
      });
      this.__imageWait = controller;
      if (typeof globalThis.ResizeObserver === 'function') {
        this.__resizeObserver = new globalThis.ResizeObserver(() => controller.resize());
        this.__resizeObserver.observe(this);
      }
      controller.start();
    }

    disconnectedCallback() {
      this.__imageWait?.stop();
      this.__resizeObserver?.disconnect?.();
      this.__imageWait = null;
      this.__resizeObserver = null;
      this.replaceChildren();
    }
  }
  registry.define('noureon-image-wait', ImageWaitElement);
};

defineElement();
