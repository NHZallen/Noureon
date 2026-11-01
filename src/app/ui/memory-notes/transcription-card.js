// The card of the settings for speech to text (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3). It is off until the person reads where the sound goes and agrees: to the speech model
// of a provider they have a key for (a piece of a minute at a time), or nowhere (Whisper runs in this browser). Once on, it says how it is done and lets them change that or turn it off.
// Drawn with textContent only. The page gives `transcription` (runtime/transcription/page-transcription.js) and the helpers of the settings screen.

export function renderTranscriptionCard({ transcription, el, button, text, ask, showNotification, render }) {
  if (!transcription) return null;
  const card = el('section', 'pz-card mn-rebuild');
  const head = el('div', 'pz-head');
  head.append(el('h3', '', text('mnSttTitle')));
  const body = el('div', 'mn-rebuild-body');
  body.append(el('p', 'pz-sub text-[var(--text-secondary)]', text('mnSttDesc')));
  const actions = el('div', 'mn-rebuild-actions');
  const ways = transcription.providers();
  const current = ways.find((way) => way.current) || ways[0];
  const nowLine = (way) => text(way.name === 'browser' ? 'mnSttIsBrowser' : 'mnSttIs', { provider: way.label, model: way.model });

  if (transcription.isEnabled() && current) {
    body.append(el('p', 'mn-rebuild-status', nowLine(current)));
    if (ways.length > 1) {
      body.append(el('h4', 'pz-sub', text('mnSttProviderTitle')), el('p', 'pz-sub text-[var(--text-secondary)]', text('mnSttProviderDesc')));
      const choices = el('div', 'mn-rebuild-actions');
      for (const way of ways) {
        choices.append(button(way.label, way.current ? 'btn-primary mn-btn' : 'mn-btn', async () => {
          if (!way.current) await transcription.setProvider(way.name);
          render();
        }));
      }
      body.append(choices);
    }
    actions.append(button(text('mnSttOff'), 'mn-btn', async () => {
      await transcription.disable();
      showNotification(text('mnSttOffDone'), 'success');
      render();
    }));
  } else {
    actions.append(button(text('mnSttOn'), 'btn-primary mn-btn', async () => {
      const way = transcription.providers().find((item) => item.current) || transcription.providers()[0];
      if (!way) return;
      const agreed = await ask({
        title: text('mnSttConsentTitle'),
        message: text(way.name === 'browser' ? 'mnSttConsentBrowser' : 'mnSttConsentApi', { provider: way.label, model: way.model }),
        confirmLabel: text('mnSttConsentOk')
      });
      if (!agreed) return;
      const ok = await transcription.enable(way.name);
      if (!ok) showNotification(text('mnSttNotReady'), 'error');
      render();
    }));
  }
  if (actions.children.length) body.append(actions);
  card.append(head, body);
  return card;
}
