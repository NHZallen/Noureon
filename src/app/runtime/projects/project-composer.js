// The box a project's page writes in is the real one of the chat (#input-bar-container: the files, the model, the tools, the voice), moved onto the page while it is open
// and put back where it was when the page leaves. While it is on the page the open chat is an empty one of the project (made by actions.prepareChat); what is typed goes
// into it and sends as in any chat, and the page is closed so the chat shows. A page left without sending puts the chat that was open back (or leaves an empty chat).

const COMPOSER_ID = 'input-bar-container';

/**
 * deps: document, actions (prepareChat, abandonChat, sentChat), getActiveConversation(), getCurrentConversationId(), conversationExists(id), isInProject(id), loadChat(id).
 */
export function createProjectComposer({ document, actions, getActiveConversation, getCurrentConversationId, conversationExists = () => false, isInProject = () => false, loadChat }) {
  const win = document.defaultView || globalThis;
  let box = null; // the element itself: it is found even while it is out of the document
  const node = () => box || document.getElementById(COMPOSER_ID);
  let home = null; // where the box lives in the chat: { parent, next }
  let held = null; // { projectId, previousId, chatId } while a prepared chat of a project is open
  let preparing = null;
  let slot = null;
  let onSent = () => {};
  let form = null;

  const rememberHome = (element) => {
    if (home || !element?.parentNode) return;
    home = { parent: element.parentNode, next: element.nextSibling };
  };

  const onSubmit = () => {
    win.setTimeout(() => {
      const chat = getActiveConversation?.();
      if (!held || chat?.id !== held.chatId || !(chat.messages || []).length) return;
      actions.sentChat(held.chatId);
      const sentFrom = held;
      held = null;
      park();
      onSent(sentFrom);
    }, 0);
  };

  const unbindForm = () => {
    form?.removeEventListener('submit', onSubmit);
    form = null;
  };

  // The menus of the box are as wide as the box (the chat's page measures it the same way): they must not run out of the column of the page.
  let watcher = null;
  function followWidth(target, element) {
    watcher?.disconnect?.();
    watcher = null;
    const measure = () => {
      const width = Math.round(Number(element.firstElementChild?.offsetWidth) || Number(element.offsetWidth) || 0);
      if (width > 0) target.style.setProperty('--desktop-composer-menu-width', `${width}px`);
    };
    measure();
    if (typeof win.ResizeObserver === 'function') {
      watcher = new win.ResizeObserver(measure);
      watcher.observe(target);
    }
  }

  /** The box goes back to the chat (the chat of the project stays open). */
  function park() {
    unbindForm();
    watcher?.disconnect?.();
    watcher = null;
    const element = node();
    if (!element || !home) return;
    if (element.parentNode !== home.parent) home.parent.insertBefore(element, home.next && home.next.parentNode === home.parent ? home.next : null);
    slot = null;
  }

  async function prepare(projectId) {
    // A chat made for another project that was not used goes back to being an empty chat.
    if (held) {
      actions.abandonChat(held.chatId);
    }
    const previousId = held ? held.previousId : getCurrentConversationId?.() || null;
    held = null;
    const made = await actions.prepareChat(projectId);
    if (made?.ok) held = { projectId, previousId, chatId: made.conversationId };
  }

  /** Puts the box into `slot` for the project (the chat of the project is made once; drawing the page again only moves the box). */
  function attach(target, projectId, { done = () => {} } = {}) {
    const element = node();
    if (!element || !target) return false;
    rememberHome(element);
    box = element;
    unbindForm();
    target.appendChild(element);
    slot = target;
    onSent = done;
    form = element.querySelector('#chat-form');
    form?.addEventListener('submit', onSubmit);
    followWidth(target, element);
    if (!held || held.projectId !== projectId) {
      // The box is not in the document until the page has drawn itself (a render of the chat in the meantime would not find its parts and make them again), so the chat is made after.
      preparing = Promise.resolve().then(() => (box && box.isConnected ? prepare(projectId) : null)).catch(() => {});
    }
    return true;
  }

  /** The page leaves: the box goes home; a chat of the project that was not used is given up for the one that was open. */
  async function release({ leaveProject = false } = {}) {
    await preparing;
    park();
    const chat = held;
    held = null;
    if (!chat) return;
    const current = getActiveConversation?.();
    // The chat was changed meanwhile (a chat of the project, or one of the menu, was opened): there is nothing to give back, and the empty chat that was made leaves the project (one with messages stays).
    if (current?.id !== chat.chatId) { actions.abandonChat(chat.chatId); return; }
    actions.abandonChat(chat.chatId);
    // Going back out of the overview of the projects must leave the projects: the chat of a project that was open before is not brought back (it would make the way back a circle); the empty chat stays, as a new chat.
    if (leaveProject && chat.previousId && isInProject(chat.previousId)) {
      document.dispatchEvent(new win.CustomEvent('noureon:chat-changed'));
      return;
    }
    if (chat.previousId && conversationExists(chat.previousId)) loadChat(chat.previousId);
  }

  return { attach, park, release, isHolding: () => Boolean(slot) };
}
