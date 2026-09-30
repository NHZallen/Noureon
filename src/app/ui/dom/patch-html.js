// Puts new markup into an element that is redrawn on a timer (a progress panel counting seconds) by changing only
// the text that differs, when the new markup has the same shape as what is there.
//
// Replacing the elements on every tick broke taps on iPhone: when new elements appear right after a tap, WebKit
// takes the tap for a hover and sends no click, so buttons near a ticking panel needed several taps. It also
// reopened a panel the person had folded. The `open` attribute of a details element is the person's choice, so it
// is neither compared nor copied.

const sameShape = (current, next) => {
  if (current.nodeType !== next.nodeType) return false;
  if (current.nodeType === 3) return true;
  if (current.nodeType !== 1) return current.nodeType === next.nodeType;
  if (current.tagName !== next.tagName) return false;
  const attributes = (node) => [...node.attributes].filter((attribute) => attribute.name !== 'open').map((attribute) => `${attribute.name}=${attribute.value}`).join('\u0000');
  if (attributes(current) !== attributes(next)) return false;
  return sameChildren(current, next);
};

const sameChildren = (current, next) => {
  if (current.childNodes.length !== next.childNodes.length) return false;
  for (let index = 0; index < current.childNodes.length; index += 1) {
    if (!sameShape(current.childNodes[index], next.childNodes[index])) return false;
  }
  return true;
};

const copyText = (current, next) => {
  for (let index = 0; index < current.childNodes.length; index += 1) {
    const from = next.childNodes[index];
    const to = current.childNodes[index];
    if (to.nodeType === 3) {
      if (to.data !== from.data) to.data = from.data;
    } else if (to.nodeType === 1) {
      copyText(to, from);
    }
  }
};

export function patchHTML(target, html) {
  if (!target) return;
  const document = target.ownerDocument;
  const template = document?.createElement?.('template');
  if (!template || !('content' in template)) {
    target.innerHTML = html;
    return;
  }
  template.innerHTML = html;
  if (sameChildren(target, template.content)) {
    copyText(target, template.content);
    return;
  }
  target.innerHTML = html;
}
