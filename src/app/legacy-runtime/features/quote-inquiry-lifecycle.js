const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

export const normalizeQuoteText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export function buildQuotedUserParts({
  question,
  quoteReference,
  getText = (_key, fallback) => fallback
} = {}) {
  const quoteText = normalizeQuoteText(quoteReference?.text);
  if (!quoteText) return String(question || '').trim() ? [{ text: String(question).trim() }] : [];

  const displayQuestion = String(question || '').trim() || getText(
    'quoteInquiryDefaultQuestion',
    'Please explain this quoted text.'
  );
  const referenceLabel = getText('quoteInquiryReferenceLabel', 'Quoted text');
  const contextInstruction = getText(
    'quoteInquiryContextInstruction',
    'Answer the user question using this quoted context.'
  );
  const sourceMessageIndex = Number(quoteReference.sourceMessageIndex);
  const sourceTextOffset = Number(quoteReference.sourceTextOffset);
  const normalizedReference = {
    text: quoteText,
    sourceMessageIndex: Number.isInteger(sourceMessageIndex) ? sourceMessageIndex : null,
    sourceMessageId: quoteReference.sourceMessageId || null,
    sourceTextOffset: Number.isInteger(sourceTextOffset) ? sourceTextOffset : null
  };

  return [
    { text: displayQuestion, displayText: displayQuestion },
    {
      text: `${referenceLabel}:\n「${quoteText}」\n\n${contextInstruction}`,
      quoteContext: true,
      quoteReference: normalizedReference
    }
  ];
}

const getDisplayText = (part) => String(part?.displayText ?? part?.text ?? '');

export function getQuoteReferenceFromMessage(message) {
  return (message?.parts || []).find(part => part?.quoteReference)?.quoteReference || null;
}

export function getVisibleUserText(message) {
  return (message?.parts || [])
    .filter(part => part?.text && !part.quoteContext)
    .map(getDisplayText)
    .join('\n');
}

function findRenderedTextRange({ document, root, text, offsetHint }) {
  const target = normalizeQuoteText(text);
  if (!root || !target || typeof document.createTreeWalker !== 'function') return null;

  const showText = document.defaultView?.NodeFilter?.SHOW_TEXT || 4;
  const walker = document.createTreeWalker(root, showText);
  const positions = [];
  let normalized = '';
  let node = walker.nextNode();

  while (node) {
    const value = String(node.nodeValue || '');
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = value[offset];
      if (/\s/.test(character)) {
        if (!normalized || normalized.endsWith(' ')) continue;
        normalized += ' ';
      } else {
        normalized += character;
      }
      positions.push({ node, offset });
    }
    node = walker.nextNode();
  }

  const matches = [];
  let matchIndex = normalized.indexOf(target);
  while (matchIndex >= 0) {
    matches.push(matchIndex);
    matchIndex = normalized.indexOf(target, matchIndex + 1);
  }
  if (matches.length === 0) return null;
  const hint = Number(offsetHint);
  const start = Number.isInteger(hint) && matches.length > 1
    ? matches.reduce((closest, candidate) => (
        Math.abs(candidate - hint) < Math.abs(closest - hint) ? candidate : closest
      ), matches[0])
    : matches[0];
  const first = positions[start];
  const last = positions[start + target.length - 1];
  if (!first || !last) return null;

  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

export function createQuoteInquiryLifecycle({
  window,
  document,
  elements,
  getActiveConversation = () => null,
  getText = (_key, fallback) => fallback,
  getQuoteReference = () => null,
  setQuoteReference = () => {},
  onComposerChange = () => {}
} = {}) {
  if (!window || !document || !elements?.messageList || !elements?.messageInput) {
    throw new TypeError('Quote inquiry requires window, document, message list, and message input elements.');
  }

  const desktopMediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_POINTER_QUERY)
    : null;
  let menu;
  let quoteBar;
  let quoteTextElement;
  let isBound = false;

  const isDesktop = () => desktopMediaQuery?.matches !== false;
  const hideMenu = () => { if (menu) menu.hidden = true; };

  const clearBrowserSelection = () => {
    window.getSelection?.()?.removeAllRanges?.();
  };

  const getSelectionDetails = () => {
    if (!isDesktop()) return null;
    const selection = window.getSelection?.();
    const selectedText = normalizeQuoteText(selection?.toString());
    if (!selectedText || !selection?.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const anchorElement = selection.anchorNode?.nodeType === 1
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;
    const focusElement = selection.focusNode?.nodeType === 1
      ? selection.focusNode
      : selection.focusNode?.parentElement;
    const content = anchorElement?.closest?.('.model-message .message-content');
    const messageItem = content?.closest?.('.message-item');
    const sourceMessageIndex = Number(messageItem?.dataset.messageIndex);
    const sourceMessage = getActiveConversation()?.messages?.[sourceMessageIndex];

    if (
      !content
      || !content.contains(focusElement)
      || !Number.isInteger(sourceMessageIndex)
      || sourceMessage?.role !== 'model'
      || content.querySelector('.typing-cursor')
      || content.closest('[data-image-generation-stage]')
    ) return null;

    const rect = range.getBoundingClientRect?.();
    const rects = range.getClientRects?.();
    const placementRect = rect?.width || rect?.height ? rect : rects?.[rects.length - 1];
    if (!placementRect) return null;

    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(content);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const sourceTextOffset = normalizeQuoteText(prefixRange.toString()).length;

    return {
      rect: placementRect,
      reference: {
        text: selectedText,
        sourceMessageIndex,
        sourceMessageId: sourceMessage?.id || null,
        sourceTextOffset
      }
    };
  };

  const positionMenu = (rect) => {
    menu.hidden = false;
    const margin = 10;
    const menuRect = menu.getBoundingClientRect();
    const centeredLeft = rect.left + (rect.width / 2) - (menuRect.width / 2);
    const left = Math.min(
      Math.max(margin, centeredLeft),
      Math.max(margin, window.innerWidth - menuRect.width - margin)
    );
    const above = rect.top - menuRect.height - margin;
    const top = above >= margin
      ? above
      : Math.min(window.innerHeight - menuRect.height - margin, rect.bottom + margin);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(margin, top)}px`;
  };

  const showForCurrentSelection = () => {
    const details = getSelectionDetails();
    if (!details) {
      hideMenu();
      return false;
    }
    menu._quoteReference = details.reference;
    positionMenu(details.rect);
    return true;
  };

  const renderComposerQuote = () => {
    const reference = getQuoteReference();
    const text = normalizeQuoteText(reference?.text);
    const wrapper = elements.messageInput.closest('.input-wrapper');
    quoteBar.hidden = !text;
    quoteTextElement.textContent = text;
    quoteTextElement.title = text;
    wrapper?.classList.toggle('has-quote-inquiry', Boolean(text));
  };

  const setComposerQuote = (reference) => {
    if (!normalizeQuoteText(reference?.text)) return;
    setQuoteReference(reference);
    renderComposerQuote();
    hideMenu();
    clearBrowserSelection();
    onComposerChange();
    elements.messageInput.focus();
  };

  const clearQuote = ({ focusComposer = false } = {}) => {
    if (!getQuoteReference()) return;
    setQuoteReference(null);
    renderComposerQuote();
    onComposerChange();
    if (focusComposer) elements.messageInput.focus();
  };

  const scrollToQuoteSource = (reference) => {
    if (!reference) return;
    const messages = getActiveConversation()?.messages || [];
    const matchingIdIndex = reference.sourceMessageId
      ? messages.findIndex(message => message?.id === reference.sourceMessageId)
      : -1;
    const indexedSource = Number(reference.sourceMessageIndex);
    const sourceIndex = matchingIdIndex >= 0 ? matchingIdIndex : indexedSource;
    if (!Number.isInteger(sourceIndex)) return;
    const sourceMessage = messages[sourceIndex];
    if (!sourceMessage || sourceMessage.role !== 'model') return;

    const sourceItem = elements.messageList.querySelector(
      `.message-item[data-message-index="${sourceIndex}"]`
    );
    const sourceContent = sourceItem?.querySelector('.message-content');
    if (!sourceItem || !sourceContent) return;

    const range = findRenderedTextRange({
      document,
      root: sourceContent,
      text: reference.text,
      offsetHint: reference.sourceTextOffset
    });
    if (range) {
      const rangeRect = range.getBoundingClientRect?.();
      const containerRect = elements.chatContainer?.getBoundingClientRect?.();
      if (rangeRect && containerRect && typeof elements.chatContainer?.scrollTo === 'function') {
        elements.chatContainer.scrollTo({
          top: elements.chatContainer.scrollTop
            + rangeRect.top
            - containerRect.top
            - (containerRect.height / 2)
            + (rangeRect.height / 2),
          behavior: 'smooth'
        });
        return;
      }
    }
    sourceItem.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };

  const createComposerQuoteBar = () => {
    quoteBar = document.createElement('div');
    quoteBar.id = 'quote-inquiry-bar';
    quoteBar.className = 'quote-inquiry-bar';
    quoteBar.hidden = true;

    quoteTextElement = document.createElement('span');
    quoteTextElement.id = 'quote-inquiry-text';
    quoteTextElement.className = 'quote-inquiry-text';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'quote-inquiry-remove';
    removeButton.setAttribute('aria-label', getText('quoteInquiryRemove', 'Remove quote'));
    removeButton.title = getText('quoteInquiryRemove', 'Remove quote');
    removeButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    removeButton.addEventListener('click', () => clearQuote({ focusComposer: true }));

    quoteBar.append(quoteTextElement, removeButton);
    const wrapper = elements.messageInput.closest('.input-wrapper');
    const inputRow = elements.messageInput.closest('#chat-form')?.parentElement;
    if (wrapper && inputRow) wrapper.insertBefore(quoteBar, inputRow);
  };

  const createSelectionMenu = () => {
    menu = document.createElement('div');
    menu.id = 'quote-inquiry-menu';
    menu.className = 'quote-inquiry-menu';
    menu.hidden = true;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quote-inquiry-menu-button';
    button.textContent = getText('quoteInquiry', 'Quote inquiry');
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => setComposerQuote(menu._quoteReference));
    menu.appendChild(button);
    document.body.appendChild(menu);
  };

  const bind = () => {
    if (isBound) return;
    isBound = true;
    elements.messageList.addEventListener('mouseup', showForCurrentSelection);
    elements.messageList.addEventListener('keyup', showForCurrentSelection);
    elements.messageList.addEventListener('contextmenu', event => {
      if (showForCurrentSelection()) event.preventDefault();
    });
    elements.messageList.addEventListener('click', event => {
      const quoteButton = event.target.closest?.('[data-quote-reference]');
      if (!quoteButton) return;
      const messageIndex = Number(quoteButton.closest('.message-item')?.dataset.messageIndex);
      const message = getActiveConversation()?.messages?.[messageIndex];
      scrollToQuoteSource(getQuoteReferenceFromMessage(message));
    });
    document.addEventListener('mousedown', event => {
      if (!menu?.contains(event.target)) hideMenu();
    });
    document.addEventListener('scroll', hideMenu, true);
    window.addEventListener('resize', hideMenu);
    desktopMediaQuery?.addEventListener?.('change', event => {
      hideMenu();
      if (!event.matches) clearQuote();
    });
  };

  const init = () => {
    createComposerQuoteBar();
    createSelectionMenu();
    renderComposerQuote();
    bind();
  };

  return {
    init,
    clearQuote,
    getQuoteReference,
    renderComposerQuote,
    scrollToQuoteSource
  };
}
