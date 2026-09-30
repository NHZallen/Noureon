// Switching chats (a new chat, another chat from the sidebar) used to swap the messages in one frame: the old
// ones vanished and the new ones faded in, leaving a blank flash in between. This leaves a see-through copy of
// the part of the old chat that was on screen and fades it up and out while the new chat fades in, so the
// screen never empties. The copy is only for the eyes: the new chat is rendered at once and nothing waits.

const EXIT_MS = 190;

export function fadeOutPreviousChat({ messageList, chatContainer, document }) {
  const view = document?.defaultView;
  if (!messageList || !chatContainer || !view || typeof messageList.animate !== 'function') return false;
  if (view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
  const children = Array.from(messageList.children || []);
  if (children.length === 0) return false;

  const frame = chatContainer.getBoundingClientRect();
  if (frame.width < 8 || frame.height < 8) return false;

  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.style.cssText = [
    'position:fixed', `left:${frame.left}px`, `top:${frame.top}px`, `width:${frame.width}px`, `height:${frame.height}px`,
    'overflow:hidden', 'pointer-events:none', 'z-index:3', 'contain:paint'
  ].join(';');

  let copied = 0;
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    if (rect.bottom < frame.top) continue;
    if (rect.top > frame.bottom) break; // messages are in order, so everything after is below the screen too
    const copy = child.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    copy.style.cssText += `;position:absolute;left:${rect.left - frame.left}px;top:${rect.top - frame.top}px;width:${rect.width}px;margin:0`;
    ghost.appendChild(copy);
    copied += 1;
  }
  if (copied === 0) return false;

  document.body.appendChild(ghost);
  const remove = () => ghost.remove();
  const exit = ghost.animate(
    [{ opacity: 1, translate: '0 0', scale: '1' }, { opacity: 0, translate: '0 -10px', scale: '0.985' }],
    { duration: EXIT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
  );
  exit.onfinish = remove;
  view.setTimeout(remove, EXIT_MS + 250); // a hidden tab never finishes the animation
  return true;
}
