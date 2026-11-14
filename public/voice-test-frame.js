// One recognition run inside a frame of its own (a srcdoc frame of voice-test.html, button E): it tells the page every event, and the page removes the frame when it ends.
(() => {
  const tell = (text) => parent.postMessage({ voiceTestFrame: text }, self.origin);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { tell('no SpeechRecognition in the frame'); tell('end'); return; }
  const recognition = new Recognition();
  recognition.lang = 'zh-TW';
  recognition.continuous = true;
  recognition.interimResults = true;
  for (const name of ['start', 'audiostart', 'speechstart', 'speechend', 'audioend', 'nomatch']) recognition.addEventListener(name, () => tell(name));
  recognition.addEventListener('result', (event) => {
    const last = event.results[event.results.length - 1];
    tell(`result "${last?.[0]?.transcript ?? ''}" final=${Boolean(last?.isFinal)}`);
  });
  recognition.addEventListener('error', (event) => tell(`error ${event.error}${event.message ? ` (${event.message})` : ''}`));
  recognition.addEventListener('end', () => tell('end'));
  addEventListener('message', (event) => { if (event.origin === self.origin && event.data === 'stop') { try { recognition.stop(); } catch { /* it had ended */ } } });
  try { recognition.start(); } catch (error) { tell(`start() threw ${error?.name || error}`); tell('end'); }
})();
