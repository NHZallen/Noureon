// The browser agent's work in a message that is already saved (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 16): the live card is gone with the
// reply, but the record keeps the steps and how the work ended, so the message shows the tag ("Done", "Stopped", the red cross) in the place of the card. A press opens the
// card again (the place holder of the screen and the capsule that turns it over to the steps), as it does for the one that has just finished.
//
// A message is drawn in a document of its own that is turned into text (markdown-rendering-helpers.js) and put into the page afterwards, so what is built in it with code is lost.
// Therefore the element made here is a place holder with the number of its record; the page looks for place holders that come into it and builds the card there.

/** `record`: { end: 'done' | 'failed' | 'cancelled', steps: [{ action, domain, label }], frame?: the last picture } (sandbox-run-block.js). */
const records = new Map();
let counter = 0;
let watching = false;

function fill(host) {
  if (!host || host.dataset.browserReady === '1') return;
  const entry = records.get(Number(host.dataset.browserId));
  if (!entry) return;
  host.dataset.browserReady = '1';
  const { record, language } = entry;
  import('./browser-card.js').then(({ createBrowserCard }) => {
    const document = host.ownerDocument;
    const card = createBrowserCard({ document, host, language });
    if (record.plan?.length) card.handle({ event: 'plan', tasks: record.plan });
    record.steps.forEach((step) => card.handle({ event: 'call', action: step.action, domain: step.domain, label: step.label }));
    if (record.end === 'failed') card.handle({ event: 'failed' });
    else if (record.end === 'cancelled') card.cancel();
    else card.complete();
    if (record.frame) card.setStill(record.frame);
    card.fold();
  }).catch(() => { host.dataset.browserReady = ''; });
}

const scan = (node) => {
  if (node?.nodeType !== 1) return;
  if (node.matches?.('.bcard-saved[data-browser-id]')) fill(node);
  node.querySelectorAll?.('.bcard-saved[data-browser-id]').forEach(fill);
};

// Looks at the page itself: place holders that come into it are filled (once).
function watchPage() {
  const page = globalThis.document;
  if (watching || !page?.documentElement || typeof globalThis.MutationObserver !== 'function') return;
  watching = true;
  new globalThis.MutationObserver((changes) => { for (const change of changes) change.addedNodes.forEach(scan); }).observe(page.documentElement, { childList: true, subtree: true });
  scan(page.documentElement);
}

export function browserTagElement(document, record, { language = 'zh-TW' } = {}) {
  const host = document.createElement('div');
  host.className = 'bcard-saved';
  counter += 1;
  records.set(counter, { record, language });
  // (Only the latest ones are kept: a message drawn again makes a new one.)
  if (records.size > 300) records.delete(records.keys().next().value);
  host.dataset.browserId = String(counter);
  // In the page itself the card is built at once; in a document that is only turned into text, the page fills the place holder when it gets it.
  if (!globalThis.document || document === globalThis.document) fill(host);
  else watchPage();
  return host;
}
