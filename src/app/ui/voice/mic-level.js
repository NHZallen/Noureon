// How loud the microphone is right now, for the waveform while dictating.
// Opens the microphone beside the browser's own speech recognition (that one
// gives text, not sound). Where the browser will not share the microphone with
// it, or refuses, there is no reading and the waveform breathes gently instead.

/** Resolves to `{ read(): 0..1, stop() }`, or null when there is no reading to be had. */
export async function openMicLevel({ navigator, window }) {
  const AudioContextClass = window?.AudioContext || window?.webkitAudioContext;
  if (!AudioContextClass || typeof navigator?.mediaDevices?.getUserMedia !== 'function') return null;
  let stream = null;
  let context = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    return {
      read() {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        // Speech sits low in the raw level: lift it so ordinary talking fills most of the height.
        return Math.min(1, Math.sqrt(sum / samples.length) * 3.4);
      },
      stop() {
        stream?.getTracks?.().forEach((track) => track.stop());
        context?.close?.().catch?.(() => {});
      }
    };
  } catch {
    stream?.getTracks?.().forEach((track) => track.stop());
    context?.close?.().catch?.(() => {});
    return null;
  }
}
