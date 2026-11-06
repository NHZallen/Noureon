// The playback speed of a GIF on a picture card and in the preview (the 1× / 0.5× / 2× button, as ChatGPT has it; docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §12). A browser plays a GIF at its own
// speed and has no way to change it, so for a speed other than 1× the frames are read (gif-editor-frames.js) and shown one after the other at their own time divided by the speed; at 1× the GIF itself is put back.

const SPEEDS = [1, 0.5, 2];

/** Adds the speed button to `host` for the GIF of `image` (an <img>); `getSource()` gives the GIF as a data address; `label` is the name of the button for a screen reader. Returns the button. */
export function attachGifSpeed({ document, host, image, getSource, label }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gif-speed-btn';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = '1×';
  let speed = 1;
  let frames = null;
  let timer = null;
  let original = '';
  let token = 0;
  const stop = () => { clearTimeout(timer); timer = null; };
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    event.preventDefault();
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    button.textContent = `${speed}×`;
    const mine = ++token;
    stop();
    if (speed === 1) {
      if (original) image.src = original;
      return;
    }
    if (!original) original = image.src;
    if (!frames) {
      const source = await getSource();
      const { loadGifFrames } = await import('./gif-editor-frames.js');
      frames = source ? await loadGifFrames({ document, dataUrl: source }) : null;
    }
    if (!frames || mine !== token) return;
    let at = 0;
    const step = () => {
      if (mine !== token || !image.isConnected) return;
      image.src = frames.frames[at].dataUrl;
      const wait = Math.max(20, (frames.frames[at].delayMs || 100) / speed);
      at = (at + 1) % frames.frames.length;
      timer = setTimeout(step, wait);
    };
    step();
  });
  host.appendChild(button);
  return button;
}
