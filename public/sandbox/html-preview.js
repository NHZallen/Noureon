// Page that shows an HTML file for the app's preview. It lives on the sandbox
// origin (run.noureon.com) because the app's own policy refuses inline
// scripts, and an HTML file written by a model or a person has them. Here the
// file runs in a frame of its own with sandbox="allow-scripts" and no
// allow-same-origin: an opaque origin, so it can reach neither this page's
// origin (the Python sandbox's storage and service worker) nor Noureon.
// The page only receives the source from the app by postMessage; it never
// reads anything from the file itself.

import { isAllowedAppOrigin } from './protocol.js';

const TYPE = 'noureon-html-preview';
let frame = null;

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  if (!isAllowedAppOrigin(event.origin, window.location.origin)) return;
  const message = event.data;
  if (!message || message.type !== TYPE) return;
  frame?.remove();
  frame = null;
  if (typeof message.source !== 'string') return;
  frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = 'HTML';
  frame.srcdoc = message.source;
  document.body.append(frame);
});
