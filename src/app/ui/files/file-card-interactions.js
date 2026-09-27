import { getFileBlock, rememberGeneratedFileSize } from './file-block-model.js';
import { buildFileMetaText } from './file-card-renderer.js';
import { getFileMarkdownRenderer } from './file-markdown-cards.js';
import { generateFileBlob } from './file-generators.js';
import { createBundleFileName, dedupeFileNames } from './file-name-policy.js';
import { formatFileSize, getFileText } from './file-texts.js';
import { createConversationImageResolver } from './conversation-images.js';

const MAX_CACHED_BYTES = 64 * 1024 * 1024;
const OBJECT_URL_LIFETIME_MS = 60_000;
const INSTALLED_ROOTS = new WeakMap();

function createBlobCache() {
  const entries = new Map();
  let totalBytes = 0;
  return {
    get(id) {
      const blob = entries.get(id);
      if (!blob) return null;
      // Re-insert to keep the most recently used entries at the end.
      entries.delete(id);
      entries.set(id, blob);
      return blob;
    },
    set(id, blob) {
      if (entries.has(id)) totalBytes -= entries.get(id).size;
      entries.set(id, blob);
      totalBytes += blob.size;
      for (const [oldestId, oldestBlob] of entries) {
        if (totalBytes <= MAX_CACHED_BYTES || oldestId === id) break;
        entries.delete(oldestId);
        totalBytes -= oldestBlob.size;
      }
    }
  };
}

// On iPhone and iPad only Safari follows a blob: download link. Home-screen
// apps and the other browsers there (Chrome, Firefox, Edge, the Google app)
// ignore it silently, so they get the share sheet ("Save to Files") instead.
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo/;
export function prefersShareSheet(window) {
  const navigator = window?.navigator;
  if (!navigator) return false;
  const userAgent = navigator.userAgent || '';
  const isAppleTouchDevice = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isAppleTouchDevice) return false;
  const isStandalone = navigator.standalone === true
    || Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
  return isStandalone || IOS_OTHER_BROWSER.test(userAgent);
}

/**
 * Hands a file to the user. Returns "shared", "cancelled", "downloaded" or
 * "needs-tap": the share sheet only opens during a tap, and generating the
 * file can outlast it, so the caller asks for one more tap (the file is
 * ready by then and shared at once).
 */
export async function deliverFile({ window, document, blob, fileName }) {
  const navigator = window?.navigator;
  if (prefersShareSheet(window) && typeof navigator?.share === 'function' && typeof window.File === 'function') {
    const file = new window.File([blob], fileName, { type: blob.type });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      if (navigator.userActivation && !navigator.userActivation.isActive) return 'needs-tap';
      try {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
        if (error?.name === 'NotAllowedError') return 'needs-tap';
        // Anything else: try a regular download.
      }
    }
  }

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately cancels the download in Safari and Firefox.
  window.setTimeout(() => window.URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
  return 'downloaded';
}

function setBusy(element, busy, language) {
  if (!element) return;
  element.disabled = busy;
  element.setAttribute('aria-busy', busy ? 'true' : 'false');
  const label = element.querySelector?.('.ac-file-action-label');
  if (label) {
    if (busy) {
      element.dataset.fileIdleLabel = label.textContent;
      label.textContent = getFileText(language, 'generating');
    } else if (element.dataset.fileIdleLabel) {
      label.textContent = element.dataset.fileIdleLabel;
      delete element.dataset.fileIdleLabel;
    }
  }
  element.closest?.('.ac-file-card')?.toggleAttribute?.('data-file-busy', busy);
}

function updateRenderedSizes(document, descriptor, bytes, language) {
  const sizeText = formatFileSize(language, bytes);
  document.querySelectorAll('.ac-file-card[data-file-id]').forEach((card) => {
    if (card.dataset.fileId !== descriptor.id) return;
    const meta = card.querySelector('.ac-file-meta');
    if (meta) meta.textContent = buildFileMetaText(language, descriptor, { sizeText });
  });
}

function describeError(error) {
  const message = String(error?.message || error?.name || 'unknown error').trim();
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
}

export function installFileCardInteractions({
  root = globalThis.document,
  window = globalThis.window,
  getUiLanguage = () => 'zh-TW',
  notify = () => {},
  copyText = (text) => window.navigator.clipboard.writeText(text),
  renderMarkdown = null,
  loadArchive = () => import('../../vendors/archive-vendor.js').then((module) => module.loadArchiveVendor()),
  generate = generateFileBlob,
  logError = (...args) => console.error(...args)
} = {}) {
  if (!root?.addEventListener) return null;
  const existing = INSTALLED_ROOTS.get(root);
  if (existing) return existing;
  const document = root.ownerDocument || root;
  const cache = createBlobCache();

  const resolveBlob = async (descriptor) => {
    const cached = cache.get(descriptor.id);
    if (cached) return cached;
    const blob = await generate(descriptor, {
      language: getUiLanguage(),
      document,
      window,
      loadChartImageRenderer: () => import('./generators/chart-image-export.js'),
      resolveImage: createConversationImageResolver({ document, window })
    });
    cache.set(descriptor.id, blob);
    rememberGeneratedFileSize(descriptor.id, blob.size);
    updateRenderedSizes(document, descriptor, blob.size, getUiLanguage());
    return blob;
  };

  const downloadOne = async (trigger, descriptor) => {
    const language = getUiLanguage();
    setBusy(trigger, true, language);
    try {
      const blob = await resolveBlob(descriptor);
      const result = await deliverFile({ window, document, blob, fileName: descriptor.name });
      if (result === 'needs-tap') notify(getFileText(language, 'tapAgainToSave', { name: descriptor.name }), 'success');
    } catch (error) {
      logError('File generation failed:', error);
      notify(getFileText(language, 'generateFailed', { reason: describeError(error) }), 'error');
    } finally {
      setBusy(trigger, false, language);
    }
  };

  let pendingBundle = null;
  const downloadBundle = async (trigger, descriptors) => {
    const language = getUiLanguage();
    const ids = descriptors.map((descriptor) => descriptor.id).join(',');
    if (pendingBundle?.ids === ids) {
      const { blob, fileName } = pendingBundle;
      pendingBundle = null;
      await deliverFile({ window, document, blob, fileName });
      return;
    }
    setBusy(trigger, true, language);
    try {
      const JSZip = await loadArchive();
      const zip = new JSZip();
      const names = dedupeFileNames(descriptors.map((descriptor) => descriptor.name));
      for (const [index, descriptor] of descriptors.entries()) {
        zip.file(names[index], await resolveBlob(descriptor));
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
      const fileName = createBundleFileName();
      const result = await deliverFile({ window, document, blob, fileName });
      if (result === 'needs-tap') {
        // The bundle is not cached like single files: keep it for the next tap.
        pendingBundle = { ids: descriptors.map((descriptor) => descriptor.id).join(','), blob, fileName };
        notify(getFileText(language, 'tapAgainToSave', { name: fileName }), 'success');
      }
    } catch (error) {
      logError('File bundle generation failed:', error);
      notify(getFileText(language, 'generateFailed', { reason: describeError(error) }), 'error');
    } finally {
      setBusy(trigger, false, language);
    }
  };

  const openPreview = async (trigger, descriptor) => {
    try {
      const { openFilePreview } = await import('./file-preview-dialog.js');
      openFilePreview({
        document,
        window,
        descriptor,
        language: getUiLanguage(),
        renderMarkdown: renderMarkdown || getFileMarkdownRenderer(),
        // The page view draws the very Blob a download would deliver.
        loadBlob: () => resolveBlob(descriptor),
        onDownload: (button) => downloadOne(button, descriptor),
        returnFocusTo: trigger
      });
    } catch (error) {
      logError('File preview failed:', error);
      notify(getFileText(getUiLanguage(), 'previewUnavailable'), 'warning');
    }
  };

  const copySource = async (descriptor) => {
    const language = getUiLanguage();
    try {
      await copyText(descriptor.content);
      notify(getFileText(language, 'copied'), 'success');
    } catch {
      notify(getFileText(language, 'copyFailed'), 'error');
    }
  };

  const handleClick = (event) => {
    const trigger = event.target?.closest?.('[data-file-action]');
    if (!trigger || !root.contains?.(trigger)) return;
    const action = trigger.dataset.fileAction;
    event.preventDefault();
    if (trigger.disabled || trigger.getAttribute('aria-busy') === 'true') return;

    if (action === 'download-all') {
      const descriptors = String(trigger.dataset.fileIds || '')
        .split(',')
        .filter(Boolean)
        .map((id) => getFileBlock(id))
        .filter((descriptor) => descriptor?.state === 'ready');
      if (descriptors.length > 0) void downloadBundle(trigger, descriptors);
      return;
    }

    const descriptor = getFileBlock(trigger.dataset.fileId);
    if (!descriptor) {
      notify(getFileText(getUiLanguage(), 'generateFailed', { reason: 'file not found' }), 'error');
      return;
    }
    if (action === 'download') {
      const downloadable = descriptor.state === 'ready'
        || (descriptor.state === 'incomplete' && descriptor.generator === 'text');
      if (downloadable) void downloadOne(trigger, descriptor);
      return;
    }
    if (action === 'preview') void openPreview(trigger, descriptor);
    else if (action === 'copy') void copySource(descriptor);
  };

  root.addEventListener('click', handleClick);
  const handle = {
    dispose() {
      root.removeEventListener('click', handleClick);
      INSTALLED_ROOTS.delete(root);
    }
  };
  INSTALLED_ROOTS.set(root, handle);
  return handle;
}
