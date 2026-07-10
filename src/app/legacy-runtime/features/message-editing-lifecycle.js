const textFromMessage = (message) => (message?.parts || [])
  .filter(part => part?.text)
  .map(part => part.text)
  .join('\n');

const filesFromMessage = (message) => (message?.parts || [])
  .filter(part => part?.inlineData)
  .map(({ inlineData }) => ({
    name: inlineData.name || 'attachment',
    type: inlineData.mimeType || 'application/octet-stream',
    size: inlineData.size || 0,
    base64: `data:${inlineData.mimeType || 'application/octet-stream'};base64,${inlineData.data || ''}`,
    targetedEdit: Boolean(inlineData.targetedEdit)
  }));

const escapeHTML = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function createMessageEditingLifecycle({
  document,
  elements,
  getActiveConversation,
  getUploadedFiles = () => [],
  setUploadedFiles = () => {},
  renderFilePreviews = () => {},
  renderChat,
  saveAppData,
  submitEditedMessage,
  isMobile = () => globalThis.matchMedia?.('(max-width: 768px)')?.matches
} = {}) {
  let activeEditor = null;

  const restoreSharedAttachmentMenu = () => {
    const popover = elements.fileOptionsPopover;
    if (!popover) return;
    popover.classList.remove('message-edit-shared-popover');
    ['position', 'left', 'top', 'bottom', 'transformOrigin'].forEach(property => popover.style.removeProperty(property));
  };

  const restoreComposer = (editor) => {
    if (!editor?.composerDraft) return;
    const { messageInput, filePreviewContainer } = elements;
    if (messageInput) messageInput.value = editor.composerDraft.text;
    setUploadedFiles(editor.composerDraft.files);
    if (editor.previewParent && filePreviewContainer && !editor.mobile) {
      editor.previewParent.insertBefore(filePreviewContainer, editor.previewNextSibling);
    }
    if (editor.composerParent && elements.inputBarContainer) {
      editor.composerParent.insertBefore(elements.inputBarContainer, editor.composerNextSibling);
    }
    renderFilePreviews();
  };

  const finishDismissEditor = (editor, { restore = true, rerender = false } = {}) => {
    if (activeEditor !== editor) return;
    if (restore) restoreComposer(editor);
    restoreSharedAttachmentMenu();
    if (!editor.mobile && editor.originalStack && editor.host?.isConnected) {
      editor.host.replaceWith(editor.originalStack);
    } else {
      editor.root?.remove();
    }
    document.body.classList.remove('is-editing-mobile-message');
    activeEditor = null;
    if (rerender && !editor.mobile) renderChat();
  };

  const dismissEditor = ({ restore = true, rerender = false, animate = true } = {}) => {
    const editor = activeEditor;
    if (!editor) return;
    restoreSharedAttachmentMenu();
    if (!animate || !editor.root?.isConnected || editor.closing) {
      if (!editor.closing) finishDismissEditor(editor, { restore, rerender });
      return;
    }
    editor.closing = true;
    const transitionDuration = editor.mobile ? 220 : 320;
    if (editor.mobile && restore) {
      restoreComposer(editor);
      restore = false;
      editor.root.style.pointerEvents = 'none';
    } else if (!editor.mobile && editor.host) {
      editor.originalStack.hidden = false;
      editor.originalStack.classList.remove('is-transitioning-out');
      editor.host.style.height = `${editor.originalHeight || 0}px`;
    }
    editor.root.classList.remove('is-visible');
    editor.root.classList.add('is-closing');
    globalThis.setTimeout(() => finishDismissEditor(editor, { restore, rerender }), transitionDuration);
  };

  const openSharedAttachmentMenu = () => {
    const { addFileBtn, fileOptionsPopover } = elements;
    if (!addFileBtn || !fileOptionsPopover || !activeEditor?.root) return;
    addFileBtn.click();
    const trigger = activeEditor.root.querySelector('[data-edit-tools]');
    const positionMenu = () => {
      const rect = trigger?.getBoundingClientRect();
      if (!rect) return;
      const menuRect = fileOptionsPopover.getBoundingClientRect();
      const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth;
      const gap = 10;
      const showAbove = rect.top >= menuRect.height + gap;
      const top = showAbove ? rect.top - menuRect.height - gap : rect.bottom + gap;
      const left = Math.min(Math.max(12, rect.left), viewportWidth - menuRect.width - 12);
      fileOptionsPopover.classList.add('message-edit-shared-popover');
      fileOptionsPopover.style.position = 'fixed';
      fileOptionsPopover.style.bottom = 'auto';
      fileOptionsPopover.style.left = `${left}px`;
      fileOptionsPopover.style.top = `${Math.max(12, Math.min(top, viewportHeight - menuRect.height - 12))}px`;
      fileOptionsPopover.style.transformOrigin = showAbove ? 'bottom left' : 'top left';
    };
    positionMenu();
    requestAnimationFrame(positionMenu);
  };

  const renderDesktopEditor = () => {
    const editor = activeEditor;
    if (!editor || editor.mobile) return;
    const { root, text } = editor;
    root.innerHTML = `
      <div class="message-edit-panel">
        <textarea class="message-edit-textarea" aria-label="編輯訊息" placeholder="輸入訊息">${escapeHTML(text)}</textarea>
        <div class="message-edit-preview-slot"></div>
        <div class="message-edit-footer">
          <button type="button" class="message-edit-plus" data-edit-tools aria-label="附加檔案與功能">+</button>
          <span class="message-edit-footer-spacer" aria-hidden="true"></span>
          <div class="message-edit-buttons">
            <button type="button" class="message-edit-cancel" data-edit-cancel>取消</button>
            <button type="button" class="message-edit-send" data-edit-send>傳送</button>
          </div>
        </div>
      </div>`;

    const previewSlot = root.querySelector('.message-edit-preview-slot');
    if (elements.filePreviewContainer) previewSlot.appendChild(elements.filePreviewContainer);
    const textarea = root.querySelector('.message-edit-textarea');
    textarea.addEventListener('input', () => { editor.text = textarea.value; });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dismissEditor();
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void sendEditedMessage();
      }
    });
    root.querySelector('[data-edit-tools]').addEventListener('click', (event) => {
      event.stopPropagation();
      openSharedAttachmentMenu();
    });
    root.querySelector('[data-edit-cancel]').addEventListener('click', () => dismissEditor());
    root.querySelector('[data-edit-send]').addEventListener('click', () => { void sendEditedMessage(); });
    requestAnimationFrame(() => textarea.focus());
  };

  const sendEditedMessage = async () => {
    const editor = activeEditor;
    if (!editor || editor.sending) return;
    const text = editor.mobile ? String(elements.messageInput?.value || '').trim() : editor.text.trim();
    const files = [...getUploadedFiles()];
    if (!text && files.length === 0) return;
    editor.sending = true;
    const sendButton = editor.root?.querySelector('[data-edit-send]');
    if (sendButton) sendButton.disabled = true;
    editor.conversation.messages.splice(editor.index);
    await saveAppData();
    dismissEditor({ rerender: false, animate: false });
    renderChat();
    await submitEditedMessage({ userMessage: text, uploadedFiles: files });
  };

  const getComposerEditSubmission = () => {
    const editor = activeEditor;
    if (!editor?.mobile) return null;
    const text = String(elements.messageInput?.value || '').trim();
    const files = [...getUploadedFiles()];
    if (!text && files.length === 0) return null;
    editor.conversation.messages.splice(editor.index);
    void saveAppData();
    dismissEditor({ rerender: false, animate: false });
    renderChat();
    return { userMessage: text, uploadedFiles: files, preserveComposer: true };
  };

  const startMessageEditing = (messageIndex) => {
    const conversation = getActiveConversation();
    const message = conversation?.messages?.[messageIndex];
    if (!message || message.role !== 'user') return;
    dismissEditor({ animate: false });
    const mobile = Boolean(isMobile());
    const root = document.createElement('section');
    const filePreviewContainer = elements.filePreviewContainer;
    activeEditor = {
      conversation,
      index: messageIndex,
      text: textFromMessage(message),
      root,
      mobile,
      sending: false,
      closing: false,
      composerDraft: {
        text: elements.messageInput?.value || '',
        files: [...getUploadedFiles()]
      },
      previewParent: filePreviewContainer?.parentNode || null,
      previewNextSibling: filePreviewContainer?.nextSibling || null,
      composerParent: elements.inputBarContainer?.parentNode || null,
      composerNextSibling: elements.inputBarContainer?.nextSibling || null,
      originalHeight: 0
    };
    setUploadedFiles(filesFromMessage(message));
    renderFilePreviews();

    if (mobile) {
      document.body.classList.add('is-editing-mobile-message');
      root.className = 'message-edit-mobile-page';
      root.innerHTML = `
        <header class="message-edit-mobile-header">
          <button type="button" data-edit-cancel aria-label="取消編輯">×</button>
          <h2>編輯訊息</h2>
          <span aria-hidden="true"></span>
        </header>
        <div class="message-edit-mobile-composer"></div>`;
      root.querySelector('[data-edit-cancel]').addEventListener('click', () => dismissEditor());
      document.body.appendChild(root);
      root.querySelector('.message-edit-mobile-composer').appendChild(elements.inputBarContainer);
      elements.messageInput.value = activeEditor.text;
      elements.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(() => {
        if (activeEditor?.root === root) {
          root.classList.add('is-visible');
          elements.messageInput.focus();
        }
      });
      return;
    }
    root.className = 'message-edit-inline';
    const messageElement = elements.messageList.querySelector(`.message-item[data-message-index="${messageIndex}"]`);
    const stack = messageElement?.querySelector('.message-stack-user');
    if (!stack) return dismissEditor();
    activeEditor.originalStack = stack;
    activeEditor.originalHeight = stack.getBoundingClientRect().height;
    const host = document.createElement('div');
    host.className = 'message-edit-transition-host';
    host.style.height = `${activeEditor.originalHeight}px`;
    activeEditor.host = host;
    stack.replaceWith(host);
    host.append(stack, root);
    renderDesktopEditor();
    requestAnimationFrame(() => {
      if (activeEditor?.root !== root) return;
      root.classList.add('is-visible');
      stack.classList.add('is-transitioning-out');
      host.style.height = `${root.getBoundingClientRect().height}px`;
      globalThis.setTimeout(() => {
        if (activeEditor?.root === root && !activeEditor.closing) stack.hidden = true;
      }, 360);
    });
  };

  return { startMessageEditing, cancelMessageEditing: dismissEditor, getComposerEditSubmission };
}
