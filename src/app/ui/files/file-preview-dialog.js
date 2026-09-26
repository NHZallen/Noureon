import { createFileCardElement } from './file-card-renderer.js';
import { getFileText } from './file-texts.js';
import { parseDelimited } from './generators/text-file.js';

const MAX_PREVIEW_LINES = 3000;
const MAX_PREVIEW_ROWS = 500;

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
  body.appendChild(renderPreviewBody({ document, window, descriptor, language, renderMarkdown, cleanups }));

  dialog.append(header, summary, body);
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
