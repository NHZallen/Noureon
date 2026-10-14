import { getGeneratedFileSize } from './file-block-model.js';
import { formatFileCount, formatFileSize, getFileText } from './file-texts.js';
import { FAMILY_LABEL_KEYS, createFileKindIcon } from './file-visual.js';

const SVG_NS = 'http://www.w3.org/2000/svg';


const STATE_MESSAGE_KEYS = Object.freeze({
  incomplete: 'incomplete',
  blocked: 'blocked',
  'too-large': 'tooLarge',
  unavailable: 'unavailable',
  // A file made in Advanced mode whose bytes are not on this device.
  missing: 'missing'
});

// Only states whose content can still become a correct file keep the
// download action. An incomplete text file is still useful as a partial draft;
// an incomplete Office or PDF specification is not.
const canDownload = (descriptor) => (
  descriptor.state === 'ready'
  || (descriptor.state === 'incomplete' && descriptor.generator === 'text')
);

const canPreview = (descriptor) => descriptor.state !== 'blocked' && descriptor.state !== 'too-large' && descriptor.state !== 'missing';

function createSvg(document, attributes, children) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  Object.entries(attributes).forEach(([name, value]) => svg.setAttribute(name, value));
  children.forEach(([tag, childAttributes]) => {
    const child = document.createElementNS(SVG_NS, tag);
    Object.entries(childAttributes).forEach(([name, value]) => child.setAttribute(name, value));
    svg.appendChild(child);
  });
  return svg;
}

function createIcon(document, descriptor) {
  const icon = document.createElement('span');
  icon.className = 'ac-file-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(createFileKindIcon(document, descriptor.family));
  return icon;
}

function createActionIcon(document, kind) {
  const paths = {
    download: [['path', { d: 'M12 3v12' }], ['path', { d: 'm7 10 5 5 5-5' }], ['path', { d: 'M5 21h14' }]],
    preview: [['path', { d: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z' }], ['circle', { cx: '12', cy: '12', r: '2.8' }]],
    copy: [['rect', { x: '9', y: '9', width: '12', height: '12', rx: '2' }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
    bundle: [['path', { d: 'M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8' }], ['path', { d: 'M1.5 3.5h21v4.5h-21z' }], ['path', { d: 'M10 12h4' }]],
    rerun: [['path', { d: 'M3 12a9 9 0 0 1 15.5-6.2L21 8' }], ['path', { d: 'M21 3v5h-5' }], ['path', { d: 'M21 12a9 9 0 0 1-15.5 6.2L3 16' }], ['path', { d: 'M3 21v-5h5' }]]
  };
  return createSvg(document, {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.9',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: 'ac-file-action-icon'
  }, paths[kind] || []);
}

function createActionButton(document, { action, id, label, primary = false, iconKind = action }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ac-file-action${primary ? ' ac-file-action-primary' : ''}`;
  button.dataset.fileAction = action;
  if (id) button.dataset.fileId = id;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.appendChild(createActionIcon(document, iconKind));
  if (primary) {
    const text = document.createElement('span');
    text.className = 'ac-file-action-label';
    text.textContent = label;
    button.appendChild(text);
  }
  return button;
}

export function getFileFamilyLabel(language, descriptor) {
  const label = getFileText(language, FAMILY_LABEL_KEYS[descriptor.family] || 'familyText');
  return descriptor.family === 'code' && descriptor.language
    ? `${descriptor.language} ${label}`
    : label;
}

export function buildFileMetaText(language, descriptor, { sizeText = '' } = {}) {
  const parts = [getFileFamilyLabel(language, descriptor)];
  if (descriptor.stats && descriptor.stats.count > 0) {
    parts.push(getFileText(language, descriptor.stats.key, {
      count: formatFileCount(language, descriptor.stats.count)
    }));
    const also = descriptor.stats.also;
    if (also && also.count > 0) parts.push(getFileText(language, also.key, { count: formatFileCount(language, also.count) }));
  }
  if (sizeText) parts.push(sizeText);
  return parts.join(' · ');
}

// The arrow after the link of a download.
function createLinkArrow(document) {
  return createSvg(document, { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ac-file-link-arrow' }, [
    ['path', { d: 'M7 17 17 7M8.5 7H17v8.5' }]
  ]);
}

/** The name of the file for the link ("下載星河公司年度說明"): without its extension, the kind says which it is. */
const titleOf = (name) => String(name || '').replace(/\.[^./\\]{1,8}$/, '') || String(name || '');

export function createFileCardElement(document, descriptor, { language = 'zh-TW' } = {}) {
  const card = document.createElement('div');
  card.className = 'ac-file-card';
  card.dataset.fileId = descriptor.id;
  card.dataset.fileFamily = descriptor.family;
  card.dataset.fileState = descriptor.state;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${getFileText(language, 'fileCard')}: ${descriptor.name}`);

  const info = document.createElement('div');
  info.className = 'ac-file-info';
  // The kind, bold: "Word 文件（DOCX）".
  const kind = document.createElement('div');
  kind.className = 'ac-file-kind';
  const kindName = getFileFamilyLabel(language, descriptor);
  const shownExtension = String(descriptor.extension || '').slice(0, 5).toUpperCase();
  kind.textContent = shownExtension ? (language === 'zh-TW' ? `${kindName}（${shownExtension}）` : `${kindName} (${shownExtension})`) : kindName;
  info.appendChild(kind);

  // What the file holds (pages, sheets) and its size are not shown: they are in the tooltip of the link, and the link is the only line.
  const meta = document.createElement('div');
  meta.className = 'ac-file-meta';
  meta.hidden = true;
  const knownSize = getGeneratedFileSize(descriptor.id);
  meta.textContent = buildFileMetaText(language, descriptor, {
    sizeText: knownSize === null ? '' : formatFileSize(language, knownSize)
  });
  const tooltip = `${descriptor.name} · ${meta.textContent}`;

  if (canDownload(descriptor)) {
    // The link of the download: "下載星河公司年度說明 ↗".
    const download = getFileText(language, 'download');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'ac-file-action ac-file-link';
    link.dataset.fileAction = 'download';
    link.dataset.fileId = descriptor.id;
    link.title = tooltip;
    link.setAttribute('aria-label', `${download} ${descriptor.name}`);
    const text = document.createElement('span');
    text.className = 'ac-file-action-label ac-file-link-text';
    text.textContent = `${download}${language === 'zh-TW' ? '' : ' '}${titleOf(descriptor.name)}`;
    link.append(text, createLinkArrow(document));
    info.appendChild(link);
  } else {
    const name = document.createElement('div');
    name.className = 'ac-file-link-static';
    name.textContent = titleOf(descriptor.name);
    name.title = tooltip;
    info.appendChild(name);
  }
  info.appendChild(meta);

  const notices = [];
  if (STATE_MESSAGE_KEYS[descriptor.state]) {
    notices.push({
      kind: descriptor.state,
      text: getFileText(language, STATE_MESSAGE_KEYS[descriptor.state], { extension: descriptor.extension })
    });
  }
  if (descriptor.policy === 'warn' && descriptor.state !== 'blocked') {
    notices.push({ kind: 'warning', text: getFileText(language, 'scriptWarning') });
  }
  notices.forEach((notice) => {
    const element = document.createElement('div');
    element.className = `ac-file-notice ac-file-notice-${notice.kind}`;
    element.textContent = notice.text;
    info.appendChild(element);
  });

  // The preview (the eye) and the other small actions stay at the side, quiet until the pointer is near.
  const actions = document.createElement('div');
  actions.className = 'ac-file-actions';
  if (canPreview(descriptor)) {
    actions.appendChild(createActionButton(document, {
      action: 'preview',
      id: descriptor.id,
      label: getFileText(language, 'preview')
    }));
  }
  if (descriptor.state === 'missing' && descriptor.canRerun) {
    actions.appendChild(createActionButton(document, {
      action: 'rerun',
      id: descriptor.id,
      label: getFileText(language, 'rerun'),
      primary: true
    }));
  }
  // Files made in Advanced mode have no source text to copy.
  if (descriptor.state !== 'ready' && descriptor.generator !== 'stored') {
    actions.appendChild(createActionButton(document, {
      action: 'copy',
      id: descriptor.id,
      label: getFileText(language, 'copySource')
    }));
  }

  card.append(createIcon(document, descriptor), info, actions);
  return card;
}

export function createPendingFileCardElement(document, {
  name = '',
  extension = '',
  family = 'text',
  receivedCharacters = 0,
  language = 'zh-TW'
} = {}) {
  const card = document.createElement('div');
  card.className = 'ac-file-card ac-file-card-pending';
  card.dataset.fileState = 'pending';
  card.dataset.fileFamily = family;
  // The card is rebuilt as characters arrive; a live region here would make
  // screen readers re-announce it repeatedly.
  card.setAttribute('role', 'group');
  card.setAttribute('aria-busy', 'true');
  card.setAttribute('aria-label', name || getFileText(language, 'writingFile'));

  const info = document.createElement('div');
  info.className = 'ac-file-info';
  const title = document.createElement('div');
  title.className = 'ac-file-name';
  title.textContent = name || getFileText(language, 'writingFile');
  const meta = document.createElement('div');
  meta.className = 'ac-file-meta';
  meta.textContent = receivedCharacters > 0
    ? `${getFileText(language, 'writingFile')} ${getFileText(language, 'receivedCharacters', { count: formatFileCount(language, receivedCharacters) })}`
    : getFileText(language, 'writingFile');
  info.append(title, meta);

  const progress = document.createElement('span');
  progress.className = 'ac-file-progress';
  progress.setAttribute('aria-hidden', 'true');

  card.append(createIcon(document, { family, extension }), info, progress);
  return card;
}

export function createFileBundleElement(document, ids, { language = 'zh-TW' } = {}) {
  const bundle = document.createElement('div');
  bundle.className = 'ac-file-bundle';
  const button = createActionButton(document, {
    action: 'download-all',
    label: getFileText(language, 'downloadAll'),
    primary: true,
    iconKind: 'bundle'
  });
  button.dataset.fileIds = ids.join(',');
  bundle.appendChild(button);
  return bundle;
}
