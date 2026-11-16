// The browser agent part of noureon.com/admin (admin-page/admin-page.js): where the owner of the service looks after the browser agent (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §9): stop
// every browser, make invite codes. Whether the account may see it is decided by the page around it (the server names the people in charge, BROWSER_ADMINS); every call is checked again by the server.
// The page asks the server with the token of the session it has; it holds no password and no secret.

import * as client from '../runtime/browser-agent/browser-agent-client.js';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Draws the part into `main`, with the words of `text(key, values)`. */
export async function drawBrowserAdmin({ window, document, text, main, serverClient = client }) {
  main.replaceChildren(el(document, 'h1', 'sp-title', text('title')));

  const card = (titleKey, descKey) => {
    const section = el(document, 'section', 'sp-admin-card');
    section.appendChild(el(document, 'h2', 'sp-admin-title', text(titleKey)));
    section.appendChild(el(document, 'p', 'sp-note', text(descKey)));
    return section;
  };
  const button = (label, primary = false) => { const node = el(document, 'button', `sp-btn${primary ? ' is-primary' : ''}`, label); node.type = 'button'; return node; };

  // Stop every browser: pressed twice, because it ends what other people are doing.
  const stopCard = card('stopTitle', 'stopDesc');
  const stopRow = el(document, 'div', 'sp-report-row');
  const stop = button(text('stopAll'));
  const stopNote = el(document, 'p', 'sp-note');
  stopNote.setAttribute('role', 'status');
  let armed = false;
  stop.addEventListener('click', async () => {
    if (!armed) { armed = true; stop.textContent = text('sure'); return; }
    armed = false;
    stop.disabled = true;
    const result = await serverClient.stopAllBrowsers();
    stopNote.textContent = result.ok ? text('stopped', { n: result.stopped }) : text('failed');
    stop.textContent = text('stopAll');
    stop.disabled = false;
  });
  stopRow.append(stop);
  stopCard.append(stopRow, stopNote);

  // Invite codes for people who have no place yet.
  const codesCard = card('codesTitle', 'codesDesc');
  const codesRow = el(document, 'div', 'sp-report-row');
  const list = el(document, 'ul', 'sp-admin-reasons');
  const note = el(document, 'p', 'sp-note');
  note.setAttribute('role', 'status');
  for (const n of [1, 5, 10]) {
    const make = button(text('make', { n }), n === 1);
    make.addEventListener('click', async () => {
      make.disabled = true;
      const result = await serverClient.mintCodes(n);
      make.disabled = false;
      if (!result.ok) { note.textContent = text('failed'); return; }
      note.textContent = '';
      for (const code of result.codes) {
        const item = el(document, 'li', null, code);
        const copy = button(text('copy'));
        copy.addEventListener('click', async () => { try { await window.navigator.clipboard.writeText(code); copy.textContent = text('copied'); } catch { /* the code is on the screen */ } });
        item.append(' ', copy);
        list.append(item);
      }
    });
    codesRow.append(make);
  }
  codesCard.append(codesRow, note, list);
  main.append(stopCard, codesCard);
}
