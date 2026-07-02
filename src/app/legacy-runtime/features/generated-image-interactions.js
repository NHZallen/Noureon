import { createMediaPreviewLifecycle } from './media-preview-lifecycle.js';

const EDITOR_COLORS = Object.freeze([
  { value: '#ef4444', label: '紅色' },
  { value: '#3b82f6', label: '藍色' },
  { value: '#22c55e', label: '綠色' },
  { value: '#facc15', label: '黃色' },
  { value: '#ffffff', label: '白色' }
]);

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
  const preview = openPreview || ((media) => {
    previewLifecycle.openMediaPreview(media);
    document.querySelector('.media-lightbox')?.classList.add('generated-image-lightbox');
  });
  const closeExistingEditor = () => document.querySelector('.generated-image-editor')?.remove();

  const openEditor = async (descriptor) => {
    const dataUrl = await getImageDataUrl(descriptor);
    if (!dataUrl) return;
    closeExistingEditor();
    const texts = getEditorTexts(getUiLanguage());
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
          <img class="generated-image-editor-photo" alt="${texts.title}">
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
        <label class="generated-image-editor-size">
          <span>${texts.size}</span>
          <input type="range" min="4" max="48" value="14" step="1" aria-label="${texts.size}">
        </label>
        <button type="button" class="generated-image-editor-confirm" disabled>${texts.confirm}</button>
      </footer>`;

    const image = overlay.querySelector('.generated-image-editor-photo');
    const canvas = overlay.querySelector('.generated-image-editor-canvas');
    const canvasWrap = overlay.querySelector('.generated-image-editor-canvas-wrap');
    const brushCursor = overlay.querySelector('.generated-image-editor-brush-cursor');
    const confirmButton = overlay.querySelector('.generated-image-editor-confirm');
    const context = canvas?.getContext?.('2d');
    let drawing = false;
    let ready = false;
    let annotated = false;
    let currentColor = EDITOR_COLORS[0].value;
    let eraseMode = false;
    let brushSize = 14;

    const updateBrushCursorStyle = () => {
      if (!brushCursor) return;
      brushCursor.style.setProperty('--brush-size', `${brushSize}px`);
      brushCursor.style.setProperty('--brush-color', currentColor);
      brushCursor.classList.toggle('is-erasing', eraseMode);
    };
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
      annotated = true;
      confirmButton.disabled = false;
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
    };
    const continueStroke = (event) => {
      moveBrushCursor(event);
      if (!drawing || !context) return;
      const point = getCanvasPoint(canvas, event);
      context.lineTo(point.x, point.y);
      context.stroke();
    };
    const endStroke = () => { drawing = false; };

    image.addEventListener('load', () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ready = Boolean(context && canvas.width && canvas.height);
      updateBrushCursorStyle();
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
    overlay.querySelector('.generated-image-editor-size input')?.addEventListener('input', event => {
      brushSize = Number(event.currentTarget.value) || 14;
      updateBrushCursorStyle();
    });
    overlay.querySelector('.generated-image-editor-close')?.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
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
    document.body.appendChild(overlay);
    image.src = dataUrl;
  };

  const bind = (root, descriptors = []) => {
    descriptors.forEach(descriptor => {
      root.querySelectorAll(`[data-generated-image-preview="${descriptor.id}"]`).forEach(button => {
        button.addEventListener('click', async event => {
          event.stopPropagation();
          const src = await getImageDataUrl(descriptor);
          if (src) preview({
            src,
            mimeType: descriptor.mediaType || 'image/png',
            name: `astra-generated-${descriptor.id}.png`
          });
        });
      });
      root.querySelectorAll(`[data-generated-image-edit="${descriptor.id}"]`).forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          void openEditor(descriptor).catch(error => logWarn('Targeted image editor failed:', error));
        });
      });
    });
  };

  return { bind, closeExistingEditor, openEditor };
}
