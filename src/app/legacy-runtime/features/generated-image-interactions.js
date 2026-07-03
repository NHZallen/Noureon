import { createMediaPreviewLifecycle } from './media-preview-lifecycle.js';

const EDITOR_COLORS = Object.freeze([
  { value: '#ef4444', label: '紅色' },
  { value: '#3b82f6', label: '藍色' },
  { value: '#22c55e', label: '綠色' },
  { value: '#facc15', label: '黃色' },
  { value: '#ffffff', label: '白色' }
].filter(({ value }) => value !== '#22c55e'));

const getEditorTexts = (language) => {
  if (language === 'en') return {
    title: 'Edit', hint: 'Mark the area you want changed, then confirm and describe the edit.',
    close: 'Cancel edit', brush: 'Brush', eraser: 'Eraser', size: 'Size', confirm: 'Confirm selection',
    drawingArea: 'Drawable area'
  };
  if (language === 'fr') return {
    title: 'Modifier', hint: 'Marquez la zone à modifier, confirmez, puis décrivez la retouche.',
    close: 'Annuler la retouche', brush: 'Pinceau', eraser: 'Gomme', size: 'Taille', confirm: 'Confirmer la zone',
    drawingArea: 'Zone de dessin'
  };
  return {
    title: '編輯', hint: '圈起想修改的區域，確認後再於輸入欄描述要怎麼改。',
    close: '取消編輯', brush: '畫筆', eraser: '橡皮擦', size: '粗細', confirm: '確認區域',
    drawingArea: '可繪畫區域'
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
  logWarn = (...args) => console.warn(...args)
}) {
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
    const dataUrl = await getImageDataUrl(descriptor);
    if (!dataUrl) return;
    closeExistingEditor();
    const texts = getEditorTexts(getUiLanguage());
    const actionLabels = { undo: '返回上一步', redo: '返回下一步', clear: '全部刪除' };
    const overlay = document.createElement('div');
    overlay.className = 'generated-image-editor';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', texts.title);
    overlay.innerHTML = `
      <header class="generated-image-editor-header">
        <button type="button" class="generated-image-editor-close" aria-label="${texts.close}">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </header>
      <div class="generated-image-editor-stage">
        <div class="generated-image-editor-canvas-wrap">
          <img class="generated-image-editor-photo" alt="${texts.title}" draggable="false">
          <canvas class="generated-image-editor-canvas"></canvas>
          <div class="generated-image-editor-brush-cursor" aria-hidden="true"></div>
        </div>
      </div>
      <footer class="generated-image-editor-toolbar">
        <div class="generated-image-editor-tools" aria-label="${texts.brush}">
          ${EDITOR_COLORS.map(({ value, label }, index) => `
            <button type="button" class="generated-image-editor-color${index === 0 ? ' active' : ''}" data-editor-color="${value}" aria-label="${texts.brush}：${label}" style="--editor-color:${value}"></button>
          `).join('')}
          <button type="button" class="generated-image-editor-eraser" data-editor-tool="eraser" aria-label="${texts.eraser}">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L14.6 3.4a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L9 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
          </button>
        </div>
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
        <label class="generated-image-editor-size">
          <span>${texts.size}</span>
          <span class="generated-image-editor-size-preview" aria-hidden="true"></span>
          <input type="range" min="4" max="48" value="14" step="1" aria-label="${texts.size}">
        </label>
        <button type="button" class="generated-image-editor-confirm" aria-label="${texts.confirm}" title="${texts.confirm}" disabled>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>
        </button>
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
    const syncEditorState = () => {
      annotated = ready && hasCanvasMarks();
      confirmButton.disabled = !ready || !annotated;
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
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      blockedEditorEvents.forEach(type => overlay.removeEventListener(type, blockEditorCopy));
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
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
    overlay.querySelector('.generated-image-editor-close')?.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    blockedEditorEvents.forEach(type => overlay.addEventListener(type, blockEditorCopy));
    confirmButton.addEventListener('click', async () => {
      if (!ready || !annotated) return;
      confirmButton.disabled = true;
      try {
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
        logWarn('Targeted image edit preparation failed:', error);
      }
    });

    document.addEventListener('keydown', onKeyDown);
    applyEditorMotionOrigin(document, overlay, sourceElement);
    document.body.appendChild(overlay);
    image.src = dataUrl;
  };

  const bind = (root, descriptors = []) => {
    descriptors.forEach(descriptor => {
      root.querySelectorAll(`[data-generated-image-preview="${descriptor.id}"]`).forEach(button => {
        button.addEventListener('click', async event => {
          event.stopPropagation();
          const src = await getImageDataUrl(descriptor);
          const sourceElement = root.querySelector(`[data-generated-image-id="${descriptor.id}"]`) || event.currentTarget;
          if (src) preview({
            src,
            mimeType: descriptor.mediaType || 'image/png',
            name: `astra-generated-${descriptor.id}.png`
          }, sourceElement);
        });
      });
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
