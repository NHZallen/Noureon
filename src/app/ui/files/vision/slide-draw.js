const abortIfNeeded = signal => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// A cheap fingerprint of a drawing, to tell when it stops changing.
const fingerprint = (context, width, height) => {
  const data = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 3) hash = Math.imul(hash ^ data[index], 16777619);
  return hash;
};

/**
 * A picture's own fonts load after it has been decoded, and drawing it
 * straight away leaves the text out. Draw again until three drawings in a row
 * come out the same, which means the fonts are in.
 */
export async function drawWhenFontsAreIn(context, image, { width, height, signal, embedded }) {
  const paint = () => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  };
  paint();
  if (!embedded) return;
  let previous = null;
  let same = 0;
  await sleep(120);
  for (let attempt = 0; attempt < 30; attempt++) {
    abortIfNeeded(signal);
    paint();
    const current = fingerprint(context, width, height);
    same = current === previous ? same + 1 : 0;
    if (same >= 2) return;
    previous = current;
    await sleep(100);
  }
}
