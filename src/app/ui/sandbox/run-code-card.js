// The card a run's code sits in, the way ChatGPT shows a step's code: a light card headed by the language and a
// copy button, the code below it (coloured by the page's code colouring). Used by the live step list and by the
// saved reply, so both look the same. The button has no listener of its own: the saved markup is a string, so one
// listener on the message list answers every card (app-bootstrap-lifecycle.js).

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

const element = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** `shell`: the source is a command line of a CLI tool, not Python. */
export function createCodeCard(document, source, language = 'zh-TW', { shell = false } = {}) {
  const card = element(document, 'div', 'run-code-card');
  const head = element(document, 'div', 'run-code-head');
  const label = sandboxText(language, 'copyCode');
  const copy = element(document, 'button', 'run-code-copy');
  copy.type = 'button';
  copy.title = label;
  copy.setAttribute('aria-label', label);
  copy.append(element(document, 'span', 'run-code-copy-icon'));
  head.append(element(document, 'span', 'run-code-icon'), element(document, 'span', 'run-code-name', shell ? 'Shell' : 'Python'), copy);
  // A code element inside, so the page's code colouring picks the code up once it is on screen.
  const pre = element(document, 'pre', 'ledger-code sandbox-run-code');
  pre.append(element(document, 'code', shell ? 'language-bash' : 'language-python', source));
  card.append(head, pre);
  return card;
}

/** The code a card's copy button copies. */
export const codeOfCard = (button) => button?.closest?.('.run-code-card')?.querySelector('code')?.textContent || '';
