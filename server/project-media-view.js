// What the model is shown of the videos and scanned PDFs of a project when it asks to look (view_project_file, docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R6 and R8), on
// the server: the file is read from the person's cloud storage like the text of a file; four frames of a video are taken with ffmpeg, a page of a scan is drawn with pdf.js. A picture is made
// small by picture-thumb.js. Nothing is kept. A recording is not looked at.

import { frameTimes } from '../src/data/project-media.js';
import { createServerMediaToolbox } from './ffmpeg-runner.js';
import { openServerPdfPages } from './pdf-page-image.js';
import { makeThumbnail } from './picture-thumb.js';

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');

/** `view(entry, { at, page })` resolves { mimeType, data } (a picture or a page), an array of { mimeType, data, at } (frames), or null. */
export function createServerMediaViewer({ files, userId, signal, toolbox = createServerMediaToolbox({ signal }), openPdf = openServerPdfPages }) {
  return async function view(entry, { at = null, page = null } = {}) {
    const bytes = await files.load({ userId, marker: { __astraCloudAsset: { path: `${userId}/${entry.fileHash}`, mimeType: entry.mimeType || '', encoding: 'base64' } } });
    if (!bytes) return null;
    if (entry.kind === 'scan') {
      const pdf = await openPdf(bytes);
      try {
        const drawn = await pdf.render(page);
        return { mimeType: drawn.mimeType, data: toBase64(drawn.bytes) };
      } finally {
        await pdf.close?.();
      }
    }
    if (entry.kind === 'video') {
      const media = await toolbox.open({ data: new Uint8Array(bytes), name: entry.name, mime: entry.mimeType || '' });
      if (!media) return null;
      try {
        const duration = entry.duration || (await media.probe()).duration;
        const frames = [];
        for (const time of frameTimes(duration, at)) {
          const frame = await media.frame(time);
          if (frame) frames.push({ mimeType: frame.mimeType, data: toBase64(frame.data), at: time });
        }
        return frames;
      } finally {
        await media.close();
      }
    }
    return entry.kind === 'audio' ? null : makeThumbnail(bytes, entry.mimeType || 'image/png');
  };
}
