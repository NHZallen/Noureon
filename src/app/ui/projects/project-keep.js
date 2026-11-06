// When a member leaves a shared project, or the owner takes one out, the project may keep the conversations the member made in it (the server copies them to the owner). That can fail (the server is
// not reachable); the person who asked is then asked what to do, and is never held back: try again, go without keeping, or stop.

import { make, openSheet } from './project-parts.js';

/** Asks what to do when the project could not keep the conversations. Resolves 'retry', 'skip' or 'cancel'. */
export function askKeepFailed({ document, root, text }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => { if (answered) return; answered = true; resolve(value); };
    openSheet({
      document, root, title: text('psKeepFailedTitle'), dialog: true, close: text('psCancel'), onClose: () => answer('cancel'),
      body: (content, { close }) => {
        content.appendChild(make(document, 'p', 'pj-note', text('psKeepFailedBody')));
        const buttons = make(document, 'div', 'psh-buttons');
        const choose = (value) => () => { answer(value); close(); };
        const skip = make(document, 'button', 'pj-text-button', text('psKeepSkip'));
        skip.type = 'button';
        skip.setAttribute('data-keep-skip', '');
        skip.addEventListener('click', choose('skip'));
        const retry = make(document, 'button', 'pj-button pj-primary psh-go', text('psKeepRetry'));
        retry.type = 'button';
        retry.setAttribute('data-keep-retry', '');
        retry.addEventListener('click', choose('retry'));
        buttons.append(skip, retry);
        content.appendChild(buttons);
      }
    });
  });
}

/**
 * Has the project keep the conversations of `memberId` (the person who leaves, or the one the owner takes out), asking what to do when it cannot. Resolves { ok: true } to go on (kept, or the
 * person chose to go without) or { ok: false } when the person stopped.
 */
export async function keepConversationsOrAsk({ client, projectId, memberId = '', ask }) {
  for (;;) {
    const kept = await client.keepConversations(projectId, memberId);
    if (kept.ok) return { ok: true, kept: true, data: kept.data };
    if (kept.code === 'forbidden') return { ok: true, kept: false };
    const choice = await ask();
    if (choice === 'retry') continue;
    if (choice === 'skip') return { ok: true, kept: false };
    return { ok: false };
  }
}
