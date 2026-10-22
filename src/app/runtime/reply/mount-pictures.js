// Puts the pictures a text model has just drawn in the reply (picture-flow.js): their cards are made as the cards of a message are (the same markup, the same buttons),
// taken out of that message and put in the place made for them, and bound to the pictures kept for them.

/** Returns ({ parts, firstNumber, slot }) => Promise<boolean>: whether the cards are in `slot`. */
export const createMountPictures = ({ getActiveConversation, addMessageToUI, bindGeneratedImageAssets }) => async ({ parts, firstNumber, slot }) => {
  const conversation = getActiveConversation();
  const holder = addMessageToUI({ role: 'model', parts, createdAt: new Date().toISOString() }, conversation?.messages?.length || 0, false, false, { conversation });
  const nodes = [...(holder?.querySelectorAll?.('.message-stack > .generated-image-card, .message-stack > .generated-image-set') || [])];
  holder?.remove?.();
  if (!nodes.length) return false;
  slot.replaceChildren(...nodes);
  // The number of a picture is its place among the pictures of the whole message.
  slot.querySelectorAll('.generated-image-card').forEach((card, index) => {
    const chip = card.querySelector('.picture-number');
    if (chip) chip.textContent = String(firstNumber + index);
  });
  await bindGeneratedImageAssets(slot, parts.map((part) => part.generatedImage));
  return true;
};
