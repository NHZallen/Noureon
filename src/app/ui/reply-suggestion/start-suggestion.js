// Puts the suggested reply on the page: the view in the message box, the control of what to suggest and when (runtime/features/reply-suggestion.js), and what takes it
// away (sending a message, another conversation, typing — the view's own). Started once with the page; needs the box of the page (#message-input in #chat-form).

import { onReplyEnded } from '../../runtime/features/reply-events.js';
import { createReplySuggestion } from '../../runtime/features/reply-suggestion.js';
import { replySuggestionText } from '../../runtime/features/reply-suggestion-texts.js';
import { createReplySuggestionView } from './suggestion-view.js';

export function startReplySuggestion({ document, getConfig, getConversation, runModel, isImageConversation, getErrorPrefixes, getLanguage = () => 'en', warn = (...args) => globalThis.console?.warn?.(...args) }) {
  const editor = document.getElementById('message-input');
  const form = document.getElementById('chat-form');
  if (!editor || !form || typeof runModel !== 'function') return null;
  let controller = null;
  const view = createReplySuggestionView({ document, form, editor, getLabel: () => replySuggestionText(getLanguage(), 'use'), onAccept: () => controller?.accepted() });
  controller = createReplySuggestion({ view, getConversation, getConfig, runModel, isImageConversation, getErrorPrefixes, warn });
  // A message is sent: the suggestion was for the one before it.
  form.addEventListener('submit', () => controller.cancel(), true);
  // Another conversation (or a new one) fills the list: the suggestion stays with its own.
  const list = document.getElementById('message-list');
  const win = document.defaultView;
  if (list && typeof win?.MutationObserver === 'function') {
    new win.MutationObserver(() => { if (view.isShown() && !controller.stillValid()) controller.cancel(); }).observe(list, { childList: true });
  }
  onReplyEnded(() => controller.onReplyEnded());
  return { view, controller };
}
