// The card of the settings for the search by meaning (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9, D15). It is off until the person reads what will be sent and agrees:
// the text of their past conversations goes, in groups, to the embedding model of a provider they have a key for. Once on, it shows how far the vectors are built; off throws them away.
// Drawn with textContent only. The page gives `vectors` (memory-store/page-vectors.js) and the helpers of the settings screen.

import { EMBEDDING_PROVIDERS } from '../../runtime/memory-store/embedding-client.js';

const number = (value) => new Intl.NumberFormat().format(Math.round(value));

export function renderVectorCard({ vectors, el, button, text, ask, showNotification, render }) {
  if (!vectors) return null;
  const card = el('section', 'pz-card mn-rebuild');
  const head = el('div', 'pz-head');
  head.append(el('h3', '', text('mnVecTitle')));
  const body = el('div', 'mn-rebuild-body');
  body.append(el('p', 'pz-sub text-[var(--text-secondary)]', text('mnVecDesc')));
  const state = vectors.getState();
  const provider = vectors.provider();
  const actions = el('div', 'mn-rebuild-actions');

  if (vectors.isEnabled()) {
    const line = { building: ['mnVecBuilding', 'mn-rebuild-status'], idle: ['mnVecReady', 'mn-rebuild-status'], error: ['mnVecError', 'mn-rebuild-status'] }[state.status] || ['mnVecReady', 'mn-rebuild-status'];
    body.append(el('p', line[1], text(line[0], { done: state.done, total: state.total, provider: EMBEDDING_PROVIDERS[provider]?.label || '', error: state.error })));
    if (state.status === 'error') actions.append(button(text('mnVecRetry'), 'btn-primary mn-btn', () => void vectors.sync()));
    actions.append(button(text('mnVecOff'), 'mn-btn', async () => {
      await vectors.disable();
      showNotification(text('mnVecOffDone'), 'success');
      render();
    }));
  } else if (!provider) {
    body.append(el('p', 'mn-rebuild-status mn-faint', text('mnVecNoKey')));
  } else {
    actions.append(button(text('mnVecOn'), 'btn-primary mn-btn', async () => {
      const estimate = vectors.estimate();
      const agreed = await ask({
        title: text('mnVecConsentTitle'),
        message: text('mnVecConsent', { provider: EMBEDDING_PROVIDERS[provider].label, pieces: number(estimate.pieces), chars: number(estimate.chars), tokens: number(estimate.tokens) }),
        confirmLabel: text('mnVecConsentOk')
      });
      if (!agreed) return;
      const ok = await vectors.enable(provider);
      if (!ok) showNotification(text('mnVecNoKey'), 'error');
      render();
    }));
  }
  if (actions.children.length) body.append(actions);
  card.append(head, body);
  return card;
}
