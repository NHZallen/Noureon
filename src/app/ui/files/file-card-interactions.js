import { getFileBlock, rememberGeneratedFileSize } from './file-block-model.js';
import { buildFileMetaText } from './file-card-renderer.js';
import { getFileMarkdownRenderer } from './file-markdown-cards.js';
import { generateFileBlob } from './file-generators.js';
import { createBundleFileName, dedupeFileNames } from './file-name-policy.js';
import { formatFileSize, getFileText } from './file-texts.js';

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

// iOS home-screen apps cannot follow a blob: download link; the share sheet
// ("Save to Files") is the only reliable way to hand them a file.
function prefersShareSheet(window) {
  const navigator = window?.navigator;
  if (!navigator) return false;
  const isAppleTouchDevice = /iPad|iPhone|iPod/.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = navigator.standalone === true
    || Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
  return isAppleTouchDevice && isStandalone;
}

export async function deliverFile({ window, document, blob, fileName }) {
  const navigator = window?.navigator;
  if (prefersShareSheet(window) && typeof navigator?.share === 'function' && typeof window.File === 'function') {
    const file = new window.File([blob], fileName, { type: blob.type });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
        // Fall through to a regular download when sharing is refused.
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
      loadChartImageRenderer: () => import('./generators/chart-image-export.js')
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
      await deliverFile({ window, document, blob, fileName: descriptor.name });
    } catch (error) {
      logError('File generation failed:', error);
      notify(getFileText(language, 'generateFailed', { reason: describeError(error) }), 'error');
    } finally {
      setBusy(trigger, false, language);
    }
  };

  const downloadBundle = async (trigger, descriptors) => {
    const language = getUiLanguage();
    setBusy(trigger, true, language);
    try {
      const JSZip = await loadArchive();
      const zip = new JSZip();
      const names = dedupeFileNames(descriptors.map((descriptor) => descriptor.name));
      for (const [index, descriptor] of descriptors.entries()) {
        zip.file(names[index], await resolveBlob(descriptor));
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
      await deliverFile({ window, document, blob, fileName: createBundleFileName() });
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
