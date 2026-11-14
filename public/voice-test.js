// A bare test of the browser's speech recognition and microphone (staging only, for the iPhone voice input issue, NOU-200).
// None of Noureon's code: if this page also hears nothing from the second time on, the cause is the browser, not the app.
(() => {
  const started = performance.now();
  const logNode = document.getElementById('log');
  const log = (text) => {
    const seconds = ((performance.now() - started) / 1000).toFixed(2).padStart(7);
    logNode.textContent = `${seconds}s ${text}\n${logNode.textContent}`.slice(0, 20000);
  };
  const session = navigator.audioSession;
  const sessionText = () => (session ? `audioSession type=${session.type} state=${session.state}` : 'audioSession: none');
  session?.addEventListener?.('statechange', () => log(`audioSession statechange -> ${session.state}`));
  log(`ua ${navigator.userAgent}`);
  log(sessionText());

  let recognition = null;
  let run = 0;
  let mic = null;

  async function openMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    log(`mic: getUserMedia ok (track ${track?.readyState}, muted ${track?.muted}, ${track?.label || 'no label'})`);
    track?.addEventListener?.('mute', () => log('mic: track mute'));
    track?.addEventListener?.('unmute', () => log('mic: track unmute'));
    track?.addEventListener?.('ended', () => log('mic: track ended'));
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = new Context();
    if (context.state !== 'running') await context.resume().catch(() => {});
    log(`mic: audio context ${context.state}; ${sessionText()}`);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let loudest = 0;
    const read = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      loudest = Math.max(loudest, Math.sqrt(sum / samples.length));
    };
    const reader = setInterval(read, 50);
    const reporter = setInterval(() => { log(`mic: level ${loudest.toFixed(4)}`); loudest = 0; }, 1000);
    return {
      close() {
        clearInterval(reader);
        clearInterval(reporter);
        stream.getTracks().forEach((each) => each.stop());
        context.close().catch(() => {});
        log(`mic: closed; ${sessionText()}`);
      }
    };
  }

  function closeMic() {
    mic?.close();
    mic = null;
  }

  function startRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { log('no SpeechRecognition in this browser'); return; }
    run += 1;
    const label = `#${run}`;
    const current = new Recognition();
    recognition = current;
    current.lang = 'zh-TW';
    current.continuous = true;
    current.interimResults = true;
    for (const name of ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'nomatch']) {
      current.addEventListener(name, () => log(`${label} ${name}`));
    }
    current.addEventListener('result', (event) => {
      const last = event.results[event.results.length - 1];
      log(`${label} result "${last?.[0]?.transcript ?? ''}" final=${Boolean(last?.isFinal)}`);
    });
    current.addEventListener('error', (event) => log(`${label} error ${event.error}${event.message ? ` (${event.message})` : ''}`));
    current.addEventListener('end', () => {
      log(`${label} end; ${sessionText()}`);
      if (recognition === current) recognition = null;
      closeMic();
    });
    log(`${label} start(); ${sessionText()}`);
    try { current.start(); } catch (error) { log(`${label} start() threw ${error?.name || error}`); }
  }

  // E: the recognition runs in a new frame each time, and the frame is removed when it ends.
  let frame = null;
  let frameRun = 0;
  addEventListener('message', (event) => {
    if (event.origin !== location.origin || typeof event.data?.voiceTestFrame !== 'string' || !frame) return;
    log(`E${frameRun} ${event.data.voiceTestFrame}`);
    if (event.data.voiceTestFrame === 'end') { frame.remove(); frame = null; log(`E${frameRun} frame removed`); }
  });
  document.getElementById('frame-recognition').addEventListener('click', () => {
    if (busy()) return;
    frameRun += 1;
    log(`--- E${frameRun}: recognition in a new frame`);
    frame = document.createElement('iframe');
    frame.setAttribute('allow', 'microphone');
    frame.style.cssText = 'width:0;height:0;border:0;position:absolute';
    // A srcdoc frame: it has no response headers of its own, so the site's frame-ancestors 'none' and X-Frame-Options do not block it.
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><script src="/voice-test-frame.js"></script>';
    document.body.append(frame);
  });
  document.getElementById('reload').addEventListener('click', () => location.reload());

  const busy = () => {
    if (recognition || mic || frame) { log('still running: press 停止 first'); return true; }
    return false;
  };

  document.getElementById('recognition').addEventListener('click', () => {
    if (busy()) return;
    log('--- A: recognition only');
    startRecognition();
  });
  document.getElementById('mic-then-recognition').addEventListener('click', async () => {
    if (busy()) return;
    log('--- B: microphone, then recognition');
    try { mic = await openMic(); } catch (error) { log(`mic: failed ${error?.name || error}`); }
    startRecognition();
  });
  document.getElementById('mic-only').addEventListener('click', async () => {
    if (busy()) return;
    log('--- C: microphone only, 5 seconds');
    try { mic = await openMic(); } catch (error) { log(`mic: failed ${error?.name || error}`); return; }
    const opened = mic;
    setTimeout(() => { if (mic === opened) closeMic(); }, 5000);
  });
  document.getElementById('session-then-recognition').addEventListener('click', () => {
    if (busy()) return;
    log('--- D: audioSession play-and-record, then recognition');
    if (session) {
      try { session.type = 'play-and-record'; } catch (error) { log(`audioSession type failed ${error?.name || error}`); }
      log(sessionText());
    }
    startRecognition();
  });
  document.getElementById('stop').addEventListener('click', () => {
    log('--- stop');
    try { recognition?.stop(); } catch { /* it had ended */ }
    frame?.contentWindow?.postMessage('stop', location.origin);
    closeMic();
  });
  document.getElementById('clear').addEventListener('click', () => { logNode.textContent = ''; });
})();
