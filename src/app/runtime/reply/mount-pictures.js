// Puts the pictures a text model has just drawn in the reply (picture-flow.js): their cards are made as the cards of a message are (the same markup, the same buttons),
// taken out of that message and put in the place made for them, and bound to the pictures kept for them.

// The wait for the picture fades out (the time the field of dots takes), then the picture eases in, the way a picture of the picture model does.
const FADE_MS = 300;

const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const nextFrame = (run) => (typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(run) : globalThis.setTimeout(run, 16));

/** Returns ({ parts, firstNumber, slot }) => Promise<boolean>: whether the cards are in `slot`. */
export const createMountPictures = ({ getActiveConversation, addMessageToUI, bindGeneratedImageAssets }) => async ({ parts, firstNumber, slot }) => {
  const conversation = getActiveConversation();
  const holder = addMessageToUI({ role: 'model', parts, createdAt: new Date().toISOString() }, conversation?.messages?.length || 0, false, false, { conversation });
  const nodes = [...(holder?.querySelectorAll?.('.message-stack > .generated-image-card, .message-stack > .generated-image-set') || [])];
  holder?.remove?.();
  if (!nodes.length) return false;
  const waiting = slot.querySelector('.reply-draw-stage');
  const calm = reducedMotion();
  // The cards are made and bound while the wait is still there (out of sight), so the swap does not wait for the picture to load.
  if (waiting) {
    nodes.forEach((node) => { node.hidden = true; });
    slot.append(...nodes);
  } else {
    slot.replaceChildren(...nodes);
  }
  // The number of a picture is its place among the pictures of the whole message.
  slot.querySelectorAll('.generated-image-card').forEach((card, index) => {
    const chip = card.querySelector('.picture-number');
    if (chip) chip.textContent = String(firstNumber + index);
  });
  await bindGeneratedImageAssets(slot, parts.map((part) => part.generatedImage));
  if (!calm) slot.classList.add('generated-image-result-enter');
  if (waiting) {
    if (!calm) {
      waiting.querySelector('.generated-image-skeleton')?.classList.add('generated-image-skeleton-finalizing');
      await new Promise((resolve) => globalThis.setTimeout(resolve, FADE_MS));
    }
    waiting.remove();
    nodes.forEach((node) => { node.hidden = false; });
  }
  if (!calm) nextFrame(() => slot.classList.add('generated-image-result-visible'));
  return true;
};
