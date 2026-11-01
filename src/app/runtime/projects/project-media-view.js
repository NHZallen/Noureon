// What the model is shown of a video or a scanned PDF of a project when it asks to look (view_project_file, docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R6 and R8), on the
// page: four frames of a video taken with ffmpeg, or a page of a scan drawn with pdf.js. A recording is not looked at. Page only.

import { frameTimes } from '../../../data/project-media.js';
import { bytesToBase64, defaultOpenPdf, defaultToolbox, fromBase64 } from './project-media-source.js';
import { getProjectFileStore } from './project-source-files.js';

/** `view(source, entry, { at, page })` resolves an array of { mimeType, data (base64), at? } (the frames), one { mimeType, data } for a page, or null. */
export function createMediaViewer({ getStore = getProjectFileStore, getToolbox = defaultToolbox, openPdf = defaultOpenPdf } = {}) {
  return async function view(source, entry, { at = null, page = null } = {}) {
    const loaded = source?.file ? await getStore()?.load(source.file) : null;
    if (!loaded) return null;
    const bytes = fromBase64(loaded.data);
    if (entry.kind === 'scan') {
      const pdf = await openPdf(bytes);
      try {
        const drawn = await pdf.render(page);
        return { mimeType: drawn.mimeType, data: bytesToBase64(drawn.bytes) };
      } finally {
        await pdf.close?.();
      }
    }
    if (entry.kind !== 'video') return null;
    const media = await (await getToolbox()).open({ data: bytes, name: source.file.name || source.title || '', mime: loaded.mimeType || source.file.mimeType || '' });
    if (!media) return null;
    try {
      const duration = entry.duration || (await media.probe()).duration;
      const frames = [];
      for (const time of frameTimes(duration, at)) {
        const frame = await media.frame(time);
        if (frame) frames.push({ mimeType: frame.mimeType, data: bytesToBase64(frame.data), at: time });
      }
      return frames;
    } finally {
      await media.close();
    }
  };
}
