// The small number in the corner of a picture (a picture the person attached, in the box and in the message, and a picture that was drawn):
// the picture's place among the pictures of its message, from 1 (src/data/conversation-pictures.js). It is the name the person and the model use to
// speak of the picture ("the second one"). It is shown only when a text model may draw pictures (src/styles/image-tool.css, `data-picture-numbers`).

/** The markup of the number, for the places that build their markup as text; nothing for a place without a number. */
export const pictureNumberHTML = (number) => (Number(number) > 0 ? `<span class="picture-number" aria-hidden="true">${Math.floor(Number(number))}</span>` : '');

/** Puts the number in the corner of `host` (changing it, or taking it away when there is none). */
export function setPictureNumber(document, host, number) {
  if (!host) return;
  const chip = host.querySelector?.(':scope > .picture-number') || null;
  if (!(Number(number) > 0)) {
    chip?.remove();
    return;
  }
  const text = String(Math.floor(Number(number)));
  if (chip) {
    if (chip.textContent !== text) chip.textContent = text;
    return;
  }
  const created = document.createElement('span');
  created.className = 'picture-number';
  created.setAttribute('aria-hidden', 'true');
  created.textContent = text;
  host.append(created);
}
