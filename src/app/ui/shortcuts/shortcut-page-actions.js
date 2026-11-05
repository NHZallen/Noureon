// What the shortcuts that act on the page do: they press the buttons the page already has (the same ones a click reaches), after taking the person back to the chat when the settings or the
// Extensions are over it. The shortcuts that belong to a part (the side panel, the voice input) are registered by that part (rail.js, batch-import-voice-lifecycle.js).

import { registerShortcutAction } from './shortcut-actions.js';

/** deps: document. Registers the actions; returns a function that takes them back. */
export function registerPageActions({ document }) {
  const byId = (id) => document.getElementById(id);
  const settingsOpen = () => Boolean(byId('settings-modal')?.classList.contains('visible'));
  const storePage = () => document.querySelector('body > .cs');
  // The settings and the Extensions page lie over the chat: going back to it is what the person means by an action on the chat.
  const backToChat = () => {
    if (settingsOpen()) byId('close-settings-btn')?.click();
    if (storePage()) document.querySelector('body > .cs .cs-back')?.click();
  };
  const press = (id) => {
    const button = byId(id);
    if (!button) return false;
    button.click();
    return true;
  };
  const stops = [
    registerShortcutAction('focusComposer', () => {
      const input = byId('message-input');
      if (!input) return false;
      backToChat();
      input.focus();
      return true;
    }),
    registerShortcutAction('newChat', () => { if (!byId('new-chat-btn')) return false; backToChat(); return press('new-chat-btn'); }),
    registerShortcutAction('searchChats', () => { if (!byId('open-search-btn')) return false; backToChat(); return press('open-search-btn'); }),
    registerShortcutAction('attachFile', () => {
      const button = byId('upload-file-btn');
      // The button is not there for a model that takes no files.
      if (!button || button.style.display === 'none') return false;
      backToChat();
      button.click();
      return true;
    }),
    registerShortcutAction('goHome', () => { backToChat(); return true; }),
    registerShortcutAction('openExtensions', () => {
      if (storePage()) return true;
      if (settingsOpen()) byId('close-settings-btn')?.click();
      return press('open-cli-store-btn');
    }),
    registerShortcutAction('showShortcuts', () => {
      if (storePage()) document.querySelector('body > .cs .cs-back')?.click();
      const goTo = () => byId('settings-nav')?.querySelector('[data-section="shortcuts"]')?.click();
      if (settingsOpen()) { goTo(); return true; }
      if (!press('settings-btn')) return false;
      // The settings are built the first time they open: the part is chosen once they are there.
      const win = document.defaultView;
      win?.setTimeout?.(goTo, 80);
      return true;
    })
  ];
  return () => stops.forEach((stop) => stop());
}
