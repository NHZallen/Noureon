// How loud the microphone is right now, for the waveform while dictating.
// Opens the microphone beside the browser's own speech recognition (that one
// gives text, not sound). Where the browser will not share the microphone with
// it, or refuses, there is no reading.
//
// `onlyIfAllowed`: the microphone is opened only when the browser already says the page may use it
// (the permission is 'granted'), so that this never makes the browser ask the person a second time
// beside the question of the recognition. Where the browser cannot say (it has no such query), it is not opened.

/** Resolves to `{ read(): 0..1, stop() }`, or null when there is no reading to be had. */
export async function openMicLevel({ navigator, window, onlyIfAllowed = false, trace = () => {} }) {
  const AudioContextClass = window?.AudioContext || window?.webkitAudioContext;
  if (!AudioContextClass || typeof navigator?.mediaDevices?.getUserMedia !== 'function') {
    trace(`not offered (AudioContext ${Boolean(AudioContextClass)}, getUserMedia ${typeof navigator?.mediaDevices?.getUserMedia})`);
    return null;
  }
  if (onlyIfAllowed) {
    let granted = false;
    try {
      const state = (await navigator.permissions?.query?.({ name: 'microphone' }))?.state;
      trace(`permission query: ${state}`);
      granted = state === 'granted';
    } catch (error) {
      trace(`permission query failed: ${error?.name || error}`);
      granted = false;
    }
    if (!granted) return null;
  }
  let stream = null;
  let context = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const track = stream?.getAudioTracks?.()?.[0] || stream?.getTracks?.()?.[0];
    trace(`getUserMedia ok (track ${track?.readyState ?? '?'}, muted ${track?.muted ?? '?'})`);
    context = new AudioContextClass();
    trace(`audio context ${context.state ?? '?'}`);
    // A context made outside a touch can start suspended (a phone's browser), and a suspended one reads only silence: it is asked to run, and where it will not there is no reading.
    try { await context.resume?.(); } catch { /* it keeps its state */ }
    trace(`audio context after resume: ${context.state ?? '?'}`);
    if (context.state && context.state !== 'running') throw new Error('The audio context is not running.');
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
        // Speech sits low in the raw level: lifted, so ordinary talking is well above the noise.
        return Math.min(1, Math.sqrt(sum / samples.length) * 6);
      },
      stop() {
        stream?.getTracks?.().forEach((track) => track.stop());
        context?.close?.().catch?.(() => {});
      }
    };
  } catch (error) {
    trace(`not opened: ${error?.name || error}`);
    stream?.getTracks?.().forEach((track) => track.stop());
    context?.close?.().catch?.(() => {});
    return null;
  }
}
