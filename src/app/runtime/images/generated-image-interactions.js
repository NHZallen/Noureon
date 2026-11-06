import { setButtonBusy } from '../../ui/motion/busy-button.js';
import { createMediaPreviewLifecycle } from '../messages/media-preview-lifecycle.js';
import { bindGeneratedImageSets } from './generated-image-set.js';
import { downloadNameOf } from './generated-image-assets.js';
import { getRuntimeTexts } from '../i18n/runtime-texts.js';
import { loadGifFrames } from './gif-editor-frames.js';

const EDITOR_COLORS = Object.freeze([
  { value: '#ef4444', key: 'red' },
  { value: '#3b82f6', key: 'blue' },
  { value: '#22c55e', key: 'green' },
  { value: '#facc15', key: 'yellow' },
  { value: '#ffffff', key: 'white' }
].filter(({ value }) => value !== '#22c55e'));

const getEditorTexts = (language) => {
  const text = getRuntimeTexts(language);
  return {
    title: text.edit, hint: text.editHint, close: text.cancelEdit, brush: text.brush,
    eraser: text.eraser, size: text.size, confirm: text.confirmSelection,
    drawingArea: text.drawableArea, undo: text.undo, redo: text.redo, clear: text.clearAll,
    colors: { red: text.red, blue: text.blue, green: text.green, yellow: text.yellow, white: text.white },
    frame: text.gifFrame, play: text.gifPlay, pause: text.gifPause, frames: text.gifFrames, grid: text.gifGrid, speed: text.gifSpeed
  };
};

const getCanvasPoint = (canvas, event) => {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height)
  };
};

const getLocalPoint = (element, event) => {
  const bounds = element.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
};

const getSafeImageDimension = (value) => {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? Math.floor(dimension) : 0;
};

const applyEditorMotionOrigin = (document, overlay, sourceElement) => {
  const rect = sourceElement?.getBoundingClientRect?.();
  const viewportWidth = document.defaultView?.innerWidth || 1;
  const viewportHeight = document.defaultView?.innerHeight || 1;
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    overlay.style.setProperty('--editor-enter-x', '0px');
    overlay.style.setProperty('--editor-enter-y', '0px');
    overlay.style.setProperty('--editor-enter-scale', '.96');
    overlay.classList.add('generated-image-editor-enter');
    return;
  }
  const originX = rect.left + (rect.width / 2) - (viewportWidth / 2);
  const originY = rect.top + (rect.height / 2) - (viewportHeight / 2);
  const scaleBasisWidth = Math.min(viewportWidth * 0.86, 980);
  const scaleBasisHeight = Math.min(viewportHeight * 0.72, 680);
  const originScale = Math.max(0.08, Math.min(0.88, rect.width / scaleBasisWidth, rect.height / scaleBasisHeight));
  overlay.style.setProperty('--editor-enter-x', `${originX}px`);
  overlay.style.setProperty('--editor-enter-y', `${originY}px`);
  overlay.style.setProperty('--editor-enter-scale', String(originScale));
  overlay.classList.add('generated-image-editor-enter');
};

export function createGeneratedImageInteractions({
  document,
  getImageDataUrl,
  openPreview = null,
  attachAnnotatedImage,
  getUiLanguage = () => 'zh-TW',
  navigator = globalThis.navigator,
  fetchImpl = globalThis.fetch,
  FileCtor = globalThis.File,
  escapeHTML = value => String(value ?? ''),
  getText = (_key, fallback) => fallback,
  logWarn = (...args) => console.warn(...args),
  // The editor's and the preview's stylesheet loads the first time one opens, not with the page; they open plain if it cannot load.
  loadStyles = () => import('../../../styles/generated-image-editor.css')
}) {
  let stylesLoaded = null;
  const ensureStyles = () => stylesLoaded ||= Promise.resolve().then(loadStyles).catch((error) => {
    stylesLoaded = null;
    logWarn('Loading the image editor styles failed:', error);
  });
  const previewLifecycle = openPreview ? null : createMediaPreviewLifecycle({
      document,
      navigator,
      fetch: fetchImpl,
      File: FileCtor,
      escapeHTML,
      getInlineMediaSrc: item => item.src,
      getUiLanguage,
      getText,
      logWarn
    });
  const preview = openPreview || ((media, sourceElement = null) => {
    previewLifecycle.openMediaPreview(media, sourceElement);
    document.querySelector('.media-lightbox')?.classList.add('generated-image-lightbox');
  });
  const closeExistingEditor = () => document.querySelector('.generated-image-editor')?.remove();

  const openEditor = async (descriptor, sourceElement = null) => {
    const [dataUrl] = await Promise.all([getImageDataUrl(descriptor), ensureStyles()]);
    if (!dataUrl) return;
    // A GIF is edited frame by frame: each one is shown on its own, marked on its own, and the ones that were marked are sent in their order.
    const gif = descriptor?.mediaType === 'image/gif' ? await loadGifFrames({ document, dataUrl }) : null;
    closeExistingEditor();
    const texts = getEditorTexts(getUiLanguage());
    const actionLabels = { undo: texts.undo, redo: texts.redo, clear: texts.clear };
    const overlay = document.createElement('div');
    overlay.className = `generated-image-editor${gif ? ' has-frames' : ''}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', texts.title);
    // The layout: the top bar holds the way out, the history and the confirm button; the colours and the eraser are one row under the picture. The size
    // (a round preview of the brush and a slider) is in the same footer: on a phone a row of its own over the colours, so the picture is the whole width and
    // in the middle; on a wide screen a vertical slider on the left edge.
    overlay.innerHTML = `
      <header class="generated-image-editor-header">
        <button type="button" class="generated-image-editor-close" aria-label="${texts.close}">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
        <div class="generated-image-editor-history">
          <button type="button" class="generated-image-editor-history-btn" data-editor-history="undo" aria-label="${actionLabels.undo}" disabled>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>
          </button>
          <button type="button" class="generated-image-editor-history-btn" data-editor-history="redo" aria-label="${actionLabels.redo}" disabled>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>
          </button>
          <button type="button" class="generated-image-editor-history-btn" data-editor-history="clear" aria-label="${actionLabels.clear}" disabled>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-.8 14H5.8L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
          </button>
        </div>
        <button type="button" class="generated-image-editor-confirm" aria-label="${texts.confirm}" title="${texts.confirm}" disabled>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>
        </button>
      </header>
      <div class="generated-image-editor-stage">
        <div class="generated-image-editor-canvas-wrap">
          <img class="generated-image-editor-photo" alt="${texts.title}" draggable="false">
          <canvas class="generated-image-editor-canvas"></canvas>
          ${gif ? '<img class="generated-image-editor-playback" alt="" draggable="false">' : ''}
          ${gif ? `<button type="button" class="generated-image-editor-grid" aria-pressed="false" aria-label="${texts.grid}" title="${texts.grid}"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 3.5v17M3.5 12h17"/></svg></button>` : ''}
          <div class="generated-image-editor-brush-cursor" aria-hidden="true"></div>
        </div>
      </div>
      ${gif ? `<div class="generated-image-editor-frames" role="group" aria-label="${texts.frames}">
        <button type="button" class="generated-image-editor-play" aria-label="${texts.play}">
          <svg class="play-icon" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z"/></svg>
          <svg class="pause-icon" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>
        </button>
        <div class="generated-image-editor-frame-list">${gif.frames.map((frame, index) => `<button type="button" class="generated-image-editor-frame" data-editor-frame="${index}" aria-label="${texts.frame.replace('{n}', index + 1)}"><img src="${frame.dataUrl}" alt="" draggable="false"><span>${index + 1}</span></button>`).join('')}</div>
        <button type="button" class="generated-image-editor-speed" aria-label="${texts.speed}" title="${texts.speed}">1×</button>
      </div>` : ''}
      <footer class="generated-image-editor-toolbar">
        <label class="generated-image-editor-size">
          <span class="generated-image-editor-size-preview" aria-hidden="true"></span>
          <span class="generated-image-editor-size-track">
            <input type="range" min="4" max="48" value="14" step="1" aria-label="${texts.size}">
          </span>
        </label>
        <div class="generated-image-editor-tools" aria-label="${texts.brush}">
          ${EDITOR_COLORS.map(({ value, key }, index) => `
            <button type="button" class="generated-image-editor-color${index === 0 ? ' active' : ''}" data-editor-color="${value}" aria-label="${texts.brush}: ${texts.colors[key]}" style="--editor-color:${value}"></button>
          `).join('')}
          <span class="generated-image-editor-divider" aria-hidden="true"></span>
          <button type="button" class="generated-image-editor-eraser" data-editor-tool="eraser" aria-label="${texts.eraser}">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L14.6 3.4a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L9 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
          </button>
        </div>
      </footer>`;

    const image = overlay.querySelector('.generated-image-editor-photo');
    const canvas = overlay.querySelector('.generated-image-editor-canvas');
    const canvasWrap = overlay.querySelector('.generated-image-editor-canvas-wrap');
    const brushCursor = overlay.querySelector('.generated-image-editor-brush-cursor');
    const confirmButton = overlay.querySelector('.generated-image-editor-confirm');
    const undoButton = overlay.querySelector('[data-editor-history="undo"]');
    const redoButton = overlay.querySelector('[data-editor-history="redo"]');
    const clearButton = overlay.querySelector('[data-editor-history="clear"]');
    const sizePreview = overlay.querySelector('.generated-image-editor-size-preview');
    const sizeInput = overlay.querySelector('.generated-image-editor-size input');
    const context = canvas?.getContext?.('2d');
    const blockedEditorEvents = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];
    const blockEditorCopy = (event) => event.preventDefault();
    let drawing = false;
    let ready = false;
    let annotated = false;
    let currentColor = EDITOR_COLORS[0].value;
    let eraseMode = false;
    let brushSize = 14;
    let history = [null];
    let historyIndex = 0;
    // A GIF: the marks and the history of each frame are its own, kept here while another frame is shown.
    // The last one is the sheet of all the frames (the grid), marked as one picture.
    const frameStates = gif ? [...gif.frames, null].map(() => ({ history: [null], historyIndex: 0 })) : [];
    const sheetAt = gif ? gif.frames.length : -1;
    let beforeSheet = 0;
    let speed = 1;
    let currentFrame = 0;
    let playing = false;
    let playbackTimer = null;
    const playbackImage = overlay.querySelector('.generated-image-editor-playback');
    const playButton = overlay.querySelector('.generated-image-editor-play');
    const frameButtons = [...overlay.querySelectorAll('.generated-image-editor-frame')];
    const gridButton = overlay.querySelector('.generated-image-editor-grid');
    const speedButton = overlay.querySelector('.generated-image-editor-speed');

    const updateBrushCursorStyle = () => {
      if (!brushCursor) return;
      brushCursor.style.setProperty('--brush-size', `${brushSize}px`);
      brushCursor.style.setProperty('--brush-color', currentColor);
      brushCursor.classList.toggle('is-erasing', eraseMode);
      if (sizePreview) {
        sizePreview.style.setProperty('--brush-size', `${brushSize}px`);
        sizePreview.style.setProperty('--brush-color', eraseMode ? '#fff' : currentColor);
        sizePreview.classList.toggle('is-erasing', eraseMode);
      }
    };
    const hasCanvasMarks = () => {
      if (!context || !canvas.width || !canvas.height) return false;
      const pixelCount = canvas.width * canvas.height;
      if (pixelCount > 4000000) {
        const xStep = Math.max(1, Math.floor(canvas.width / 96));
        const yStep = Math.max(1, Math.floor(canvas.height / 96));
        for (let y = 0; y < canvas.height; y += yStep) {
          for (let x = 0; x < canvas.width; x += xStep) {
            if (context.getImageData(x, y, 1, 1).data[3] > 0) return true;
          }
        }
        return false;
      }
      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) return true;
        }
      } catch (_error) {
        return false;
      }
      return false;
    };
    // The frames that have marks (the one on the screen counts by what is on the canvas, the others by the last of their history).
    const markedFrames = () => frameStates.map((state, index) => (index === currentFrame ? annotated : state.history[state.historyIndex] !== null));
    const syncEditorState = () => {
      annotated = ready && hasCanvasMarks();
      const marked = gif ? markedFrames() : [];
      confirmButton.disabled = !ready || !(gif ? marked.includes(true) : annotated);
      frameButtons.forEach((button, index) => {
        button.classList.toggle('active', index === currentFrame);
        button.classList.toggle('has-marks', Boolean(marked[index]));
      });
      gridButton?.setAttribute('aria-pressed', String(currentFrame === sheetAt));
      gridButton?.classList.toggle('has-marks', Boolean(marked[sheetAt]));
      if (undoButton) undoButton.disabled = historyIndex <= 0;
      if (redoButton) redoButton.disabled = historyIndex >= history.length - 1;
      if (clearButton) clearButton.disabled = !annotated;
      updateBrushCursorStyle();
    };
    const captureHistory = () => {
      if (!ready || !canvas) return;
      const snapshot = hasCanvasMarks() ? canvas.toDataURL('image/png') : null;
      history = history.slice(0, historyIndex + 1);
      history.push(snapshot);
      if (history.length > 24) history.shift();
      historyIndex = history.length - 1;
      syncEditorState();
    };
    const restoreSnapshot = (snapshot) => new Promise(resolve => {
      if (!context) return resolve();
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!snapshot) {
        syncEditorState();
        resolve();
        return;
      }
      const historyImage = document.createElement('img');
      historyImage.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(historyImage, 0, 0, canvas.width, canvas.height);
        syncEditorState();
        resolve();
      };
      historyImage.onerror = () => {
        syncEditorState();
        resolve();
      };
      historyImage.src = snapshot;
    });
    const moveBrushCursor = (event) => {
      if (!ready || !brushCursor || !canvasWrap) return;
      const point = getLocalPoint(canvasWrap, event);
      brushCursor.style.left = `${point.x}px`;
      brushCursor.style.top = `${point.y}px`;
      brushCursor.classList.add('is-visible');
      updateBrushCursorStyle();
    };
    const hideBrushCursor = () => {
      brushCursor?.classList.remove('is-visible');
    };
    const loadImage = (src) => new Promise((resolve, reject) => {
      const element = document.createElement('img');
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = src;
    });
    // A frame as it is with its marks on it (the live canvas for the frame on the screen, the last snapshot of its history for the others).
    const frameComposite = async (index) => {
      const output = document.createElement('canvas');
      const base = await loadImage(index === sheetAt ? gif.sheet.dataUrl : gif.frames[index].dataUrl);
      output.width = base.naturalWidth;
      output.height = base.naturalHeight;
      const outputContext = output.getContext('2d');
      outputContext.drawImage(base, 0, 0, output.width, output.height);
      const marks = index === currentFrame ? (hasCanvasMarks() ? canvas : null) : frameStates[index].history[frameStates[index].historyIndex];
      if (marks) outputContext.drawImage(typeof marks === 'string' ? await loadImage(marks) : marks, 0, 0, output.width, output.height);
      return output.toDataURL('image/png');
    };
    const stopPlayback = () => {
      if (!playing) return;
      playing = false;
      clearTimeout(playbackTimer);
      canvasWrap.classList.remove('is-playing');
      playButton?.classList.remove('is-playing');
      playButton?.setAttribute('aria-label', texts.play);
    };
    const startPlayback = async () => {
      if (!gif || playing || !ready || currentFrame === sheetAt) return;
      playing = true;
      playButton.classList.add('is-playing');
      playButton.setAttribute('aria-label', texts.pause);
      try {
        const pictures = await Promise.all(gif.frames.map((_, index) => frameComposite(index)));
        if (!playing) return;
        canvasWrap.classList.add('is-playing');
        let at = 0;
        const step = () => {
          if (!playing) return;
          playbackImage.src = pictures[at];
          const wait = Math.max(20, (gif.frames[at].delayMs || 100) / speed);
          at = (at + 1) % pictures.length;
          playbackTimer = setTimeout(step, wait);
        };
        step();
      } catch (error) {
        logWarn('Playing the frames failed:', error);
        stopPlayback();
      }
    };
    const selectFrame = (next) => {
      stopPlayback();
      if (!gif || !ready || next === currentFrame || next < 0 || next > sheetAt) return;
      frameStates[currentFrame] = { history, historyIndex };
      if (next === sheetAt) beforeSheet = currentFrame;
      const resize = (next === sheetAt) !== (currentFrame === sheetAt);
      currentFrame = next;
      ({ history, historyIndex } = frameStates[next]);
      hideBrushCursor();
      if (resize) {
        // The sheet is not the size of a frame: the canvas takes the size of the picture shown before the marks come back.
        ready = false;
        image.addEventListener('load', () => {
          canvas.width = getSafeImageDimension(image.naturalWidth);
          canvas.height = getSafeImageDimension(image.naturalHeight);
          ready = true;
          void restoreSnapshot(history[historyIndex]);
        }, { once: true });
        image.src = next === sheetAt ? gif.sheet.dataUrl : gif.frames[next].dataUrl;
      } else {
        image.src = gif.frames[next].dataUrl;
        void restoreSnapshot(history[historyIndex]);
      }
      frameButtons[next]?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    };
    const close = () => {
      stopPlayback();
      stageWatcher?.disconnect();
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      blockedEditorEvents.forEach(type => overlay.removeEventListener(type, blockEditorCopy));
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
      if (gif && currentFrame !== sheetAt && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) selectFrame(currentFrame + (event.key === 'ArrowRight' ? 1 : -1));
    };
    const selectBrush = (button) => {
      currentColor = button.dataset.editorColor;
      eraseMode = false;
      overlay.querySelectorAll('.generated-image-editor-color, .generated-image-editor-eraser')
        .forEach(item => item.classList.toggle('active', item === button));
      updateBrushCursorStyle();
    };
    const beginStroke = (event) => {
      if (!ready || !context) return;
      moveBrushCursor(event);
      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);
      const point = getCanvasPoint(canvas, event);
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      const bounds = canvas.getBoundingClientRect();
      context.lineWidth = brushSize * (canvas.width / bounds.width);
      context.globalCompositeOperation = eraseMode ? 'destination-out' : 'source-over';
      context.strokeStyle = currentColor;
      context.lineTo(point.x + 0.01, point.y + 0.01);
      context.stroke();
    };
    const continueStroke = (event) => {
      moveBrushCursor(event);
      if (!drawing || !context) return;
      const point = getCanvasPoint(canvas, event);
      context.lineTo(point.x, point.y);
      context.stroke();
    };
    const endStroke = () => {
      if (!drawing) return;
      drawing = false;
      captureHistory();
    };

    image.addEventListener('load', () => {
      canvas.width = getSafeImageDimension(image.naturalWidth);
      canvas.height = getSafeImageDimension(image.naturalHeight);
      ready = Boolean(context && canvas.width && canvas.height);
      history = [null];
      historyIndex = 0;
      updateBrushCursorStyle();
      syncEditorState();
    }, { once: true });
    canvas.addEventListener('pointerdown', beginStroke);
    canvas.addEventListener('pointermove', continueStroke);
    canvas.addEventListener('pointerenter', moveBrushCursor);
    canvas.addEventListener('pointerleave', hideBrushCursor);
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    overlay.querySelectorAll('.generated-image-editor-color').forEach(button => {
      button.addEventListener('click', () => selectBrush(button));
    });
    overlay.querySelector('.generated-image-editor-eraser')?.addEventListener('click', event => {
      eraseMode = true;
      overlay.querySelectorAll('.generated-image-editor-color, .generated-image-editor-eraser')
        .forEach(item => item.classList.toggle('active', item === event.currentTarget));
      updateBrushCursorStyle();
    });
    sizeInput?.addEventListener('input', event => {
      brushSize = Number(event.currentTarget.value) || 14;
      updateBrushCursorStyle();
    });
    undoButton?.addEventListener('click', () => {
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      void restoreSnapshot(history[historyIndex]);
    });
    redoButton?.addEventListener('click', () => {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      void restoreSnapshot(history[historyIndex]);
    });
    clearButton?.addEventListener('click', () => {
      if (!ready || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      captureHistory();
    });
    frameButtons.forEach((button, index) => button.addEventListener('click', () => selectFrame(index)));
    gridButton?.addEventListener('click', () => selectFrame(currentFrame === sheetAt ? beforeSheet : sheetAt));
    speedButton?.addEventListener('click', () => {
      void import('./gif-speed.js').then(({ openSpeedMenu, speedLabel }) => openSpeedMenu({ document, anchor: speedButton, current: speed, label: texts.speed, onPick: (next) => { speed = next; speedButton.textContent = speedLabel(next); } }));
    });
    playButton?.addEventListener('click', () => (playing ? stopPlayback() : startPlayback()));
    playbackImage?.addEventListener('pointerdown', stopPlayback);
    overlay.querySelector('.generated-image-editor-close')?.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    blockedEditorEvents.forEach(type => overlay.addEventListener(type, blockEditorCopy));
    confirmButton.addEventListener('click', async () => {
      if (!ready || !(gif ? markedFrames().includes(true) : annotated)) return;
      confirmButton.disabled = true;
      setButtonBusy(confirmButton, true);
      try {
        if (gif) {
          // The frames that have marks, in their order, each with its marks on it; which GIF they came from, which frame of how many each is, goes with them (the edited frames are put back there).
          // Marks on the grid (all the frames in one picture) are sent as that one picture; the model changes the grid and it is cut up again. `speed` (the 1×, 0.5× or 2× of the editor) is the time of the new GIF.
          const common = { count: gif.frames.length, source: descriptor.id, ...(speed !== 1 ? { speed } : {}) };
          const frames = [];
          for (const [index, marked] of markedFrames().entries()) {
            if (marked && (index === sheetAt || !markedFrames()[sheetAt])) frames.push({ dataUrl: await frameComposite(index), index: index === sheetAt ? 0 : index, ...common, ...(index === sheetAt ? { sheet: true } : {}) });
          }
          await attachAnnotatedImage({ dataUrl: frames[0].dataUrl, frames, descriptor });
          close();
          return;
        }
        const output = document.createElement('canvas');
        output.width = canvas.width;
        output.height = canvas.height;
        const outputContext = output.getContext('2d');
        outputContext.drawImage(image, 0, 0, output.width, output.height);
        outputContext.drawImage(canvas, 0, 0);
        await attachAnnotatedImage({
          dataUrl: output.toDataURL('image/png'),
          descriptor
        });
        close();
      } catch (error) {
        confirmButton.disabled = false;
        setButtonBusy(confirmButton, false);
        logWarn('Targeted image edit preparation failed:', error);
      }
    });

    document.addEventListener('keydown', onKeyDown);
    applyEditorMotionOrigin(document, overlay, sourceElement);
    document.body.appendChild(overlay);
    // The size control on the left edge stands at the middle of the picture's area (between the top bar and what is under the picture), not of the whole screen.
    const stage = overlay.querySelector('.generated-image-editor-stage');
    const centerSize = () => {
      const frame = overlay.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      overlay.style.setProperty('--stage-mid', `${box.top - frame.top + box.height / 2}px`);
    };
    const stageWatcher = typeof ResizeObserver === 'function' ? new ResizeObserver(centerSize) : null;
    stageWatcher?.observe(stage);
    overlay.addEventListener('transitionend', centerSize, { once: true });
    image.src = gif ? gif.frames[0].dataUrl : dataUrl;
  };

  const bind = (root, descriptors = []) => {
    bindGeneratedImageSets(root);
    descriptors.forEach(descriptor => {
      root.querySelectorAll(`[data-generated-image-preview="${descriptor.id}"]`).forEach(button => {
        button.addEventListener('click', async event => {
          event.stopPropagation();
          const [src] = await Promise.all([getImageDataUrl(descriptor), ensureStyles()]);
          const sourceElement = root.querySelector(`[data-generated-image-id="${descriptor.id}"]`) || event.currentTarget;
          if (src) preview({
            src,
            mimeType: descriptor.mediaType || 'image/png',
            name: downloadNameOf(descriptor, sourceElement)
          }, sourceElement);
        });
      });
      // A GIF has the speed button (1×, 0.5×, 2×) on its card.
      if (descriptor.mediaType === 'image/gif') {
        root.querySelectorAll(`[data-generated-image-card="${descriptor.id}"]`).forEach(card => {
          const picture = card.querySelector('[data-generated-image-id]');
          if (!picture || card.querySelector('.gif-speed-btn')) return;
          void import('./gif-speed.js').then(({ attachGifSpeed }) => attachGifSpeed({
            document, host: card, image: picture, getSource: () => getImageDataUrl(descriptor), label: getRuntimeTexts(getUiLanguage()).gifSpeed,
            // The download button of the card gives the GIF at the speed chosen (its link and its share sheet read these).
            onRetimed: (blob) => card.querySelectorAll(`[data-generated-image-download="${descriptor.id}"]`).forEach((link) => {
              link.dataset.originalHref ||= link.href;
              if (link.retimedUrl) URL.revokeObjectURL(link.retimedUrl);
              link.retimedBlob = blob || null;
              link.retimedUrl = blob ? URL.createObjectURL(blob) : '';
              link.href = link.retimedUrl || link.dataset.originalHref;
            })
          }));
        });
      }
      root.querySelectorAll(`[data-generated-image-edit="${descriptor.id}"]`).forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          void openEditor(descriptor, event.currentTarget).catch(error => logWarn('Targeted image editor failed:', error));
        });
      });
    });
  };

  return { bind, closeExistingEditor, openEditor };
}
