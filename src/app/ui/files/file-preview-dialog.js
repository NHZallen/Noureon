import { createFileCardElement } from './file-card-renderer.js';
import { getFileText } from './file-texts.js';
import { parseDelimited } from './generators/text-file.js';

const MAX_PREVIEW_LINES = 3000;
const MAX_PREVIEW_ROWS = 500;

// Formats whose preview draws the generated file itself, page by page. Each
// renderer loads on first use and receives the same Blob a download gets.
const PAGE_RENDERERS = Object.freeze({
  word: () => import('./previews/docx-page-preview.js').then((module) => module.renderDocxPreview)
});

const describeReason = (error) => {
  const message = String(error?.message || error?.name || 'unknown error').trim();
  return message.length > 120 ? `${message.slice(0, 117)}…` : message;
};

const stripFrontMatter = (content) => String(content || '').replace(/^---\n[\s\S]*?\n---\n?/, '');

function renderSourcePreview({ document, descriptor, language }) {
  const container = document.createDocumentFragment();
  const lines = String(descriptor.content || '').split('\n');
  const pre = document.createElement('pre');
  pre.className = 'ac-file-preview-source';
  const code = document.createElement('code');
  code.textContent = lines.slice(0, MAX_PREVIEW_LINES).join('\n');
  pre.appendChild(code);
  container.appendChild(pre);
  if (lines.length > MAX_PREVIEW_LINES) {
    const note = document.createElement('p');
    note.className = 'ac-file-preview-note';
    note.textContent = getFileText(language, 'previewTruncated', { count: MAX_PREVIEW_LINES });
    container.appendChild(note);
  }
  return container;
}

function renderTablePreview({ document, descriptor, language }) {
  const delimiter = descriptor.extension === 'tsv' ? '\t' : ',';
  const rows = parseDelimited(String(descriptor.content || ''), delimiter);
  const wrapper = document.createElement('div');
  wrapper.className = 'ac-file-preview-table';
  const table = document.createElement('table');
  rows.slice(0, MAX_PREVIEW_ROWS + 1).forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((field) => {
      const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      cell.textContent = field.value;
      tr.appendChild(cell);
    });
    (rowIndex === 0 ? (table.tHead || table.createTHead()) : (table.tBodies[0] || table.createTBody())).appendChild(tr);
  });
  wrapper.appendChild(table);
  const fragment = document.createDocumentFragment();
  fragment.appendChild(wrapper);
  if (rows.length > MAX_PREVIEW_ROWS + 1) {
    const note = document.createElement('p');
    note.className = 'ac-file-preview-note';
    note.textContent = getFileText(language, 'previewTruncated', { count: MAX_PREVIEW_ROWS });
    fragment.appendChild(note);
  }
  return fragment;
}

function renderMarkdownPreview({ document, descriptor, renderMarkdown, language }) {
  if (typeof renderMarkdown !== 'function') return renderSourcePreview({ document, descriptor, language });
  const article = document.createElement('div');
  article.className = 'ac-file-preview-document prose prose-sm max-w-none';
  // renderMarkdown is the chat renderer: its output has already been through
  // DOMPurify, exactly like a model message.
  article.innerHTML = renderMarkdown(stripFrontMatter(descriptor.content));
  return article;
}

function renderSvgPreview({ document, window, descriptor, cleanups }) {
  // An <img> never executes script inside an SVG, unlike inline markup.
  const blob = new window.Blob([descriptor.content], { type: 'image/svg+xml' });
  const url = window.URL.createObjectURL(blob);
  cleanups.push(() => window.URL.revokeObjectURL(url));
  const figure = document.createElement('div');
  figure.className = 'ac-file-preview-image';
  const image = document.createElement('img');
  image.alt = descriptor.name;
  image.src = url;
  figure.appendChild(image);
  return figure;
}

function renderUnavailablePreview({ document, language }) {
  const note = document.createElement('p');
  note.className = 'ac-file-preview-note';
  note.textContent = getFileText(language, 'previewUnavailable');
  return note;
}

function createNote(document, text) {
  const note = document.createElement('p');
  note.className = 'ac-file-preview-note';
  note.textContent = text;
  return note;
}

function renderPagePreview(context, { onPageCount }) {
  const { document, window, descriptor, language, cleanups, loadBlob, pageRenderers } = context;
  const pane = document.createElement('div');
  pane.className = 'ac-file-preview-pages';
  const status = document.createElement('p');
  status.className = 'ac-file-preview-status';
  status.setAttribute('role', 'status');
  status.textContent = getFileText(language, 'previewLoading');
  const canvas = document.createElement('div');
  canvas.className = 'ac-file-preview-canvas';
  pane.append(status, canvas);

  let disposed = false;
  let rendered = null;
  cleanups.push(() => {
    disposed = true;
    rendered?.dispose();
  });

  (async () => {
    try {
      const [render, blob] = await Promise.all([pageRenderers[descriptor.family](), loadBlob()]);
      if (disposed) return;
      const result = await render(blob, canvas, { window, document });
      if (disposed) {
        result.dispose();
        return;
      }
      rendered = result;
      status.remove();
      pane.appendChild(createNote(document, getFileText(language, 'previewFontNote')));
      onPageCount(result.pageCount);
    } catch (error) {
      if (disposed) return;
      pane.replaceChildren(
        createNote(document, getFileText(language, 'previewRenderFailed', { reason: describeReason(error) })),
        renderPreviewBody(context)
      );
    }
  })();
  return pane;
}

function renderPreviewBody(context) {
  const { descriptor } = context;
  if (descriptor.extension === 'svg') return renderSvgPreview(context);
  switch (descriptor.family) {
    case 'csv':
      return renderTablePreview(context);
    case 'markdown':
    case 'word':
    case 'pdf':
      return renderMarkdownPreview(context);
    case 'excel':
    case 'powerpoint':
      return renderUnavailablePreview(context);
    default:
      return renderSourcePreview(context);
  }
}

export function openFilePreview({
  document,
  window,
  descriptor,
  language = 'zh-TW',
  renderMarkdown = null,
  loadBlob = null,
  pageRenderers = PAGE_RENDERERS,
  onDownload = () => {},
  returnFocusTo = null
}) {
  const cleanups = [];
  const dialog = document.createElement('dialog');
  dialog.className = 'ac-file-preview';
  const titleId = `ac-file-preview-title-${descriptor.id}`;
  dialog.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('header');
  header.className = 'ac-file-preview-header';
  const title = document.createElement('h2');
  title.id = titleId;
  title.className = 'ac-file-preview-title';
  title.textContent = getFileText(language, 'previewTitle', { name: descriptor.name });

  const summary = createFileCardElement(document, descriptor, { language });
  summary.classList.add('ac-file-card-compact');
  summary.querySelector('[data-file-action="preview"]')?.remove();
  const downloadButton = summary.querySelector('[data-file-action="download"]');
  if (downloadButton) {
    // The dialog handles its own download so the click is not also treated as
    // a card action by the message-list delegate.
    downloadButton.dataset.fileAction = 'preview-download';
    downloadButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDownload(downloadButton);
    });
  }

  const closeDialog = () => {
    if (typeof dialog.close === 'function') {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new window.Event('close'));
  };

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ac-file-preview-close';
  closeButton.setAttribute('aria-label', getFileText(language, 'close'));
  closeButton.title = getFileText(language, 'close');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closeDialog);

  header.append(title, closeButton);

  const body = document.createElement('div');
  body.className = 'ac-file-preview-body';
  const context = { document, window, descriptor, language, renderMarkdown, cleanups, loadBlob, pageRenderers };
  const showsPages = descriptor.state === 'ready'
    && typeof loadBlob === 'function'
    && typeof pageRenderers?.[descriptor.family] === 'function';

  const sections = [header, summary];
  if (showsPages) {
    // Page view is what the downloaded file looks like; source view is the
    // specification the model wrote.
    const toolbar = document.createElement('div');
    toolbar.className = 'ac-file-preview-toolbar';
    const switcher = document.createElement('div');
    switcher.className = 'ac-file-preview-views';
    switcher.setAttribute('role', 'group');
    const pageInfo = document.createElement('span');
    pageInfo.className = 'ac-file-preview-page-info';
    toolbar.append(switcher, pageInfo);

    let pagePane = null;
    let sourcePane = null;
    const buttons = {};
    const show = (view) => {
      if (view === 'pages' && !pagePane) {
        pagePane = renderPagePreview(context, {
          onPageCount: (count) => {
            pageInfo.textContent = getFileText(language, 'pageCount', { count });
          }
        });
        body.appendChild(pagePane);
      }
      if (view === 'source' && !sourcePane) {
        sourcePane = document.createElement('div');
        sourcePane.appendChild(renderSourcePreview(context));
        body.appendChild(sourcePane);
      }
      if (pagePane) pagePane.hidden = view !== 'pages';
      if (sourcePane) sourcePane.hidden = view !== 'source';
      Object.entries(buttons).forEach(([name, button]) => button.setAttribute('aria-pressed', String(name === view)));
      pageInfo.hidden = view !== 'pages';
    };
    [['pages', 'layoutView'], ['source', 'sourceView']].forEach(([view, labelKey]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ac-file-preview-view';
      button.dataset.previewView = view;
      button.textContent = getFileText(language, labelKey);
      button.addEventListener('click', () => show(view));
      buttons[view] = button;
      switcher.appendChild(button);
    });
    show('pages');
    sections.push(toolbar);
  } else {
    body.appendChild(renderPreviewBody(context));
  }

  dialog.append(...sections, body);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => {
    cleanups.forEach((cleanup) => cleanup());
    dialog.remove();
    returnFocusTo?.focus?.();
  });

  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  closeButton.focus?.();
  return dialog;
}
