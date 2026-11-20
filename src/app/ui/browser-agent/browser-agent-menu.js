// The "Browser agent" row of the "＋" menu (and, through the hidden button, of the sheet of a phone): a switch for the conversation that is open (docs/superpowers/specs/2026-11-16-browser-agent-design.md,
// §2.3). It is a button of the menu that the sheet reads like the others (id `browser-agent-menu-btn`, `is-active` when on). A model that cannot see pictures cannot use it: the row stays, greyed, and says why when
// pressed. Someone who has no place yet is told to redeem an invite code in the settings. The choice is kept per conversation in this browser (runtime/server-reply/browser-switch.js).

import { SERVICES, provideService } from '../../runtime/services.js';
import { renderComposerToolIcon } from '../../composer-tool-icons.js';
import { isBrowserOn, setBrowserOn } from '../../runtime/server-reply/browser-switch.js';
import { modelSupportsVision } from '../../runtime/shell/model-registry.js';
import * as browserClient from '../../runtime/browser-agent/browser-agent-client.js';
import { asksForBrowser } from '../../runtime/browser-agent/browser-intent.js';
import { verdictOf } from '../../runtime/decisions/decision-store.js';
import { getBrowserStatus } from '../../runtime/browser-agent/browser-status-client.js';
import { createBrowserIdleWatch } from './browser-idle-watch.js';
import { BROWSER_SWITCH_EVENT } from './browser-chip.js';
import { collapseTriggers } from '../../runtime/features/popover-escape.js';

export const BROWSER_MENU_BUTTON_ID = 'browser-agent-menu-btn';
const ACCESS_KEPT_MS = 60_000;

/**
 * deps: document, getActiveConversation(), normalizeConversationModel(conversation), text(key), client ({ getAccess }), showNotification(message, kind), now().
 * Returns { sync, toggle }: `sync()` puts the row up to date for the conversation that is open (the menu calls it before it opens).
 */
export function createBrowserAgentMenu({ document, getActiveConversation, normalizeConversationModel, text, client, showNotification = () => {}, now = Date.now }) {
  let access = null;
  let askedAt = 0;

  // A press on the row closes the menu, like the other rows (the choice is shown by the chip of the box).
  const closeMenu = () => {
    document.querySelectorAll('.popover.visible').forEach((popover) => popover.classList.remove('visible'));
    collapseTriggers(document);
  };

  const ensureButton = () => {
    const popover = document.getElementById('file-options-popover');
    if (!popover) return null;
    let button = document.getElementById(BROWSER_MENU_BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BROWSER_MENU_BUTTON_ID;
      button.type = 'button';
      button.className = 'w-full text-left px-4 py-2 text-sm hover:bg-[var(--hover-bg)] flex items-center gap-3';
      button.addEventListener('click', () => { closeMenu(); void toggle(); });
      popover.insertBefore(button, document.getElementById('learning-mode-btn') || null);
    }
    return button;
  };

  const visionOf = (conversation) => {
    try { return Boolean(modelSupportsVision(normalizeConversationModel(conversation))); } catch { return false; }
  };

  function sync() {
    const button = ensureButton();
    if (!button) return null;
    const conversation = getActiveConversation();
    const label = text('baMenuLabel');
    if (button.dataset.label !== label) {
      button.dataset.label = label;
      button.innerHTML = `${renderComposerToolIcon('browserAgent')}<span class="composer-menu-copy"><span class="composer-menu-label"></span><span class="composer-menu-description"></span></span>`;
      button.querySelector('.composer-menu-label').textContent = label;
      button.querySelector('.composer-menu-description').textContent = text('baMenuDescription');
    }
    // A temporary chat (kept on this device only) is never made on the server, so there is no browser for it. (`isTemporary` alone is a new chat that has no message yet: it has the row.)
    const available = Boolean(conversation) && conversation.retentionMode !== 'ephemeral';
    const sees = available && visionOf(conversation);
    button.style.display = available ? 'flex' : 'none';
    button.style.opacity = sees ? '' : '0.5';
    button.classList.toggle('is-active', sees && isBrowserOn(conversation?.id));
    button.setAttribute('aria-pressed', String(sees && isBrowserOn(conversation?.id)));
    return button;
  }

  // The chip of the box draws again (browser-chip.js).
  const tellSwitchChanged = () => { try { (document.defaultView || globalThis).dispatchEvent(new (document.defaultView || globalThis).CustomEvent(BROWSER_SWITCH_EVENT)); } catch { /* the chip follows at the next change of the box */ } };

  async function toggle() {
    const conversation = getActiveConversation();
    if (!conversation) return;
    if (!visionOf(conversation)) { showNotification(text('baMenuNoVision'), 'warning'); return; }
    const on = isBrowserOn(conversation.id);
    // Turning it off needs no answer from the server; turning it on asks whether this person has a place (kept for a minute).
    if (!on) {
      if (!access || now() - askedAt > ACCESS_KEPT_MS) {
        try { access = await client.getAccess(); askedAt = now(); } catch { access = { ok: false }; }
      }
      if (!access.ok) { access = null; showNotification(text('baMenuUnavailable'), 'warning'); return; }
      if (!access.allowed) { showNotification(text('baMenuNeedInvite'), 'warning'); return; }
    }
    const kept = setBrowserOn(conversation.id, !on);
    sync();
    // The chip in the box says it is on or off (browser-chip.js); a line in the corner is only for a switch that could not be kept.
    if (!on && !kept) showNotification(text('baMenuUnavailable'), 'warning');
    tellSwitchChanged();
  }

  // Whether the message asks for a browser: the judgement of the Decisions model (the question `browser`, decision-client.js) when there is one, the short list of phrases (browser-intent.js) when not.
  const wantsBrowser = (messageText, decisions) => verdictOf(decisions, 'browser') ?? asksForBrowser(messageText);

  // A message that asks for a browser switches it on for its conversation, once, before the reply is made. A person who has no place yet, or a model that cannot see pictures, is told why not;
  // the message is sent either way. Resolves whether the switch was turned on.
  async function autoEnable(messageText, conversation = getActiveConversation(), decisions = null) {
    if (!conversation || conversation.retentionMode === 'ephemeral' || isBrowserOn(conversation.id) || !wantsBrowser(messageText, decisions)) return false;
    if (!visionOf(conversation)) { showNotification(text('baMenuNoVision'), 'warning'); return false; }
    if (!access || now() - askedAt > ACCESS_KEPT_MS) {
      try { access = await client.getAccess(); askedAt = now(); } catch { access = { ok: false }; }
    }
    if (!access.ok) { access = null; return false; }
    if (!access.allowed) { showNotification(text('baMenuNeedInvite'), 'warning'); return false; }
    const kept = setBrowserOn(conversation.id, true);
    sync();
    if (kept) tellSwitchChanged();
    return kept;
  }

  return { sync, toggle, autoEnable, wantsBrowser };
}

/** Starts the row: it is put up to date whenever the "＋" button is pressed (before the menu or the sheet reads it), and once now. Returns the menu. */
export function startBrowserAgentMenu({ document, configAccess, i18n, getActiveConversation, normalizeConversationModel, showNotification, client = browserClient }) {
  const language = () => { try { return configAccess.getConfig().uiLanguage || 'zh-TW'; } catch { return 'zh-TW'; } };
  const text = (key) => String((i18n[language()] || i18n['zh-TW'] || {})[key] ?? key);
  const menu = createBrowserAgentMenu({ document, getActiveConversation, normalizeConversationModel, text, client, showNotification });
  // On the document and in the capture phase, so the row is ready before anything that opens the menu or the sheet runs (the sheet of a phone stops the press at the container of the button, so a listener on the button itself never hears it).
  document.addEventListener('click', (event) => { if (event.target?.closest?.('[id="add-file-btn"]')) menu.sync(); }, true);
  menu.sync();
  // The tag of a finished task counts down the idle time of the browser and says when the host closed it (browser-idle-watch.js); the words come with the texts of the card, loaded the first time.
  let sandboxTexts = null;
  void import('../../runtime/sandbox/sandbox-texts.js').then((module) => { sandboxTexts = module; }).catch(() => {});
  createBrowserIdleWatch({ document, getActiveConversation, getStatus: getBrowserStatus, showNotification, words: (key, params) => (sandboxTexts ? sandboxTexts.sandboxText(language(), key, params) : '') });
  // (A promise only for a message that asks for a browser: any other message goes on without waiting.)
  provideService(SERVICES.browserAutoOn, (messageText, conversation, decisions) => (conversation && !isBrowserOn(conversation.id) && menu.wantsBrowser(messageText, decisions) ? menu.autoEnable(messageText, conversation, decisions) : null));
  return menu;
}
