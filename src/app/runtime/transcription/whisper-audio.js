// The sound for Whisper in this browser (whisper-browser.js): the samples of the 16 kHz mono WAV the pieces are cut as, and the name Whisper gives a language. Pure: no window, no document.

export const WHISPER_MODEL = 'onnx-community/whisper-base';

// Whisper in this browser does not find the language by itself (it takes English when none is given), so the language of the app's screen is the hint; the providers' own Whisper finds it.
const WHISPER_LANGUAGES = Object.freeze({ 'zh-TW': 'chinese', zh: 'chinese', en: 'english', fr: 'french', ru: 'russian', es: 'spanish' });
export const whisperLanguageOf = (code) => WHISPER_LANGUAGES[code] || WHISPER_LANGUAGES[String(code || '').split('-')[0]] || '';

/** The samples (Float32, -1 to 1, 16 kHz) of a 16-bit PCM WAV file that is mono: what ffmpeg makes for the pieces (project-media.js). Throws for anything else. */
export function samplesOfWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file.');
  let offset = 12;
  let format = null;
  while (offset + 8 <= bytes.byteLength) {
    const name = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (name === 'fmt ') format = { code: view.getUint16(offset + 8, true), channels: view.getUint16(offset + 10, true), rate: view.getUint32(offset + 12, true), bits: view.getUint16(offset + 22, true) };
    if (name === 'data') {
      if (!format || format.code !== 1 || format.bits !== 16 || format.channels !== 1) throw new Error('Only 16-bit mono WAV is read.');
      // A file that was written to a pipe says its data is longer than it is: what is there is taken.
      const length = Math.min(size, bytes.byteLength - offset - 8) >> 1;
      const out = new Float32Array(length);
      for (let index = 0; index < length; index += 1) out[index] = view.getInt16(offset + 8 + index * 2, true) / 32768;
      return { samples: out, rate: format.rate };
    }
    offset += 8 + size + (size & 1);
  }
  throw new Error('The WAV file has no sound.');
}
