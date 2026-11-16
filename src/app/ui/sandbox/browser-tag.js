// The browser agent's work in a message that is already saved (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 16): the live card is gone with the
// reply, but the record keeps the steps and how the work ended, so the message shows the tag ("Done", "Cancelled", the red cross) in the place of the card. A press opens the
// card again (the place holder of the screen and the capsule that turns it over to the steps), as it does for the one that has just finished.

/** `record`: { end: 'done' | 'failed' | 'cancelled', steps: [{ action, domain, label }] } (sandbox-run-block.js). */
export function browserTagElement(document, record, { language = 'zh-TW' } = {}) {
  const host = document.createElement('div');
  host.className = 'bcard-saved';
  import('./browser-card.js').then(({ createBrowserCard }) => {
    const card = createBrowserCard({ document, host, language });
    record.steps.forEach((step) => card.handle({ event: 'call', action: step.action, domain: step.domain, label: step.label }));
    if (record.end === 'failed') card.handle({ event: 'failed' });
    else if (record.end === 'cancelled') card.cancel();
    else card.complete();
    card.fold();
  }).catch(() => {});
  return host;
}
