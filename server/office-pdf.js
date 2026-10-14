// Turns a Word or PowerPoint file into a PDF for the models that read a PDF better than the file itself (docs/superpowers/specs/2026-10-14-office-to-pdf-design.md): LibreOffice
// in the Python sandbox (no network), the result kept in the person's cache (server/derived-pdf-store.js) so a follow-up question does not convert the file again. A failure of
// any kind gives null, and the request goes on the other way (the text of the file, or the translator): nothing here ends a reply.

import { createHash } from 'node:crypto';

export const OFFICE_PDF_LIMITS = Object.freeze({ maxInputBytes: 50 * 1024 * 1024, maxPdfBytes: 50 * 1024 * 1024, convertMs: 100_000 });
const EXTENSIONS = Object.freeze({
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
});

// Runs in the sandbox: /input holds the file, the PDF is written to /output. The profile of LibreOffice goes to /tmp (the rest of the container is read-only).
const CONVERT_CODE = `
import glob, subprocess, sys
source = glob.glob('/input/*')[0]
done = subprocess.run(['soffice', '-env:UserInstallation=file:///tmp/lo', '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', '/output', source], capture_output=True, timeout=95)
if done.returncode != 0:
    print(done.stderr.decode('utf-8', 'replace')[:300], file=sys.stderr)
    sys.exit(1)
`;

const base64 = (bytes) => Buffer.from(bytes).toString('base64');

/** `host` is the sandbox host (server/sandbox-client.js), `derived` the cache (derived-pdf-store.js). */
export function createOfficePdfConverter({ host, derived, log = () => {}, limits = OFFICE_PDF_LIMITS }) {
  const available = Boolean(host?.configured);
  return {
    available,
    /** { mimeType: 'application/pdf', name, data } for the file `inline` ({ mimeType, name, data: base64 }) of the person, or null. */
    async convert({ userId, inline, signal }) {
      const extension = EXTENSIONS[inline?.mimeType];
      if (!available || !extension || typeof inline?.data !== 'string') return null;
      const bytes = Buffer.from(inline.data, 'base64');
      if (!bytes.byteLength || bytes.byteLength > limits.maxInputBytes) return null;
      const key = createHash('sha256').update(bytes).digest('hex');
      const name = `${String(inline.name || `document.${extension}`).replace(/\.[^.]+$/, '')}.pdf`;
      const cached = await derived.read(userId, key);
      if (cached) return { mimeType: 'application/pdf', name, data: base64(cached) };
      const sandbox = host.getSandbox({ language: 'en', signal });
      try {
        await sandbox.mount([{ name: `input.${extension}`, type: inline.mimeType, bytes }]);
        const result = await sandbox.run(CONVERT_CODE, { timeoutMs: limits.convertMs, signal });
        const pdf = result?.stopped || result?.error || result?.timedOut ? null : (result?.files || []).find((file) => /\.pdf$/i.test(file.name));
        if (!pdf || !pdf.bytes?.byteLength || pdf.bytes.byteLength > limits.maxPdfBytes) {
          log('office_pdf_failed', { reason: result?.timedOut ? 'timeout' : pdf ? 'size' : 'no-pdf' });
          return null;
        }
        await derived.write(userId, key, pdf.bytes);
        return { mimeType: 'application/pdf', name, data: base64(pdf.bytes) };
      } catch (error) {
        if (signal?.aborted) throw error;
        log('office_pdf_failed', { reason: String(error?.code || error?.name || 'error').slice(0, 60) });
        return null;
      } finally {
        await sandbox.dispose().catch(() => {});
      }
    }
  };
}

let registered = null;
/** The converter the server uses for every reply (set once at the start; null when there is no sandbox host). */
export const setOfficePdfConverter = (converter) => { registered = converter; };
export const getOfficePdfConverter = () => registered;
