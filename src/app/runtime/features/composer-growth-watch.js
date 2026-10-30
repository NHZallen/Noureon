// Keeps the message box the right height while text arrives in a way that sends no `input` event: voice typing on a phone puts its words in the box as it listens, and some keyboards
// only tell the page when they are done. Height is fixed from `input` alone (composer-input-bindings.js), so such text sat in a box of one line with the rest hidden. While the box has
// the focus this looks at it a few times a second, and also on the events around composition, and sets the height again when the text changed or no longer fits.

export function watchComposerGrowth({ textarea, adjust, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval, everyMs = 200 }) {
  if (!textarea) return () => {};
  let last = textarea.value;
  let timer = null;
  const check = () => {
    const changed = textarea.value !== last;
    // Does not fit, though there is room to grow (the box stops at its own limit).
    const clipped = textarea.scrollHeight - textarea.clientHeight > 1 && !(Number.parseFloat(textarea.style.maxHeight) <= textarea.clientHeight + 1);
    if (!changed && !clipped) return;
    last = textarea.value;
    adjust();
  };
  const start = () => { if (!timer) timer = setInterval(check, everyMs); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } check(); };
  const events = ['compositionupdate', 'compositionend', 'keyup', 'change', 'paste', 'cut'];
  textarea.addEventListener('focus', start);
  textarea.addEventListener('blur', stop);
  for (const name of events) textarea.addEventListener(name, check);
  if (textarea.ownerDocument?.activeElement === textarea) start();
  return () => {
    textarea.removeEventListener('focus', start);
    textarea.removeEventListener('blur', stop);
    for (const name of events) textarea.removeEventListener(name, check);
    if (timer) clearInterval(timer);
    timer = null;
  };
}
