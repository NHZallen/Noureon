// The place of a file that is still being made: the file card as it will be, with its parts drawn as quiet bars that shimmer (styles/chat-streaming.css),
// and what is going on under the bar where the file's size will be. It has the same boxes as the card (file-cards.css), so the card that takes its
// place does not move what is around it.

/** `label`: what is being done ("Redoing the presentation"); may be empty. */
export function createFileSkeleton(document, label = '') {
  const card = document.createElement('div');
  card.className = 'ac-file-card file-skeleton';
  card.setAttribute('aria-hidden', 'true');
  const icon = document.createElement('span');
  icon.className = 'ac-file-icon';
  const iconBlock = document.createElement('i');
  iconBlock.className = 'sk sk-icon';
  icon.append(iconBlock);
  const info = document.createElement('div');
  info.className = 'ac-file-info';
  const name = document.createElement('div');
  name.className = 'ac-file-kind';
  const bar = document.createElement('i');
  bar.className = 'sk sk-name';
  name.append(bar);
  const status = document.createElement('div');
  status.className = 'ac-file-link-static';
  status.textContent = label || '';
  info.append(name, status);
  card.append(icon, info);
  return card;
}
