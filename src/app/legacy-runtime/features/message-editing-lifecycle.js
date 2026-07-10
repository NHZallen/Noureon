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

  const restoreComposer = (editor) => {
    if (!editor?.composerDraft) return;
    const { messageInput, filePreviewContainer } = elements;
    if (messageInput) messageInput.value = editor.composerDraft.text;
    setUploadedFiles(editor.composerDraft.files);
    if (editor.previewParent && filePreviewContainer && !editor.mobile) {
      editor.previewParent.insertBefore(filePreviewContainer, editor.previewNextSibling);
    }
    renderFilePreviews();
  };

  const dismissEditor = ({ restore = true } = {}) => {
    const editor = activeEditor;
    if (!editor) return;
    if (restore) restoreComposer(editor);
    editor.root?.remove();
    document.body.classList.remove('is-editing-mobile-message');
    activeEditor = null;
  };

  const openSharedAttachmentMenu = () => {
    const { addFileBtn } = elements;
    if (!addFileBtn) return;
    addFileBtn.click();
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
          <p class="message-edit-warning">傳送後，這則訊息後的對話將被移除。</p>
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
    dismissEditor();
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
    dismissEditor();
    renderChat();
    return { userMessage: text, uploadedFiles: files, preserveComposer: true };
  };

  const startMessageEditing = (messageIndex) => {
    const conversation = getActiveConversation();
    const message = conversation?.messages?.[messageIndex];
    if (!message || message.role !== 'user') return;
    dismissEditor();
    const mobile = Boolean(isMobile());
    const root = mobile ? null : document.createElement('section');
    const filePreviewContainer = elements.filePreviewContainer;
    activeEditor = {
      conversation,
      index: messageIndex,
      text: textFromMessage(message),
      root,
      mobile,
      sending: false,
      composerDraft: {
        text: elements.messageInput?.value || '',
        files: [...getUploadedFiles()]
      },
      previewParent: filePreviewContainer?.parentNode || null,
      previewNextSibling: filePreviewContainer?.nextSibling || null
    };
    setUploadedFiles(filesFromMessage(message));
    renderFilePreviews();

    if (mobile) {
      document.body.classList.add('is-editing-mobile-message');
      elements.messageInput.value = activeEditor.text;
      elements.messageInput.focus();
      return;
    }
    root.className = 'message-edit-inline';
    const messageElement = elements.messageList.querySelector(`.message-item[data-message-index="${messageIndex}"]`);
    const stack = messageElement?.querySelector('.message-stack-user');
    if (!stack) return dismissEditor();
    stack.replaceWith(root);
    renderDesktopEditor();
  };

  return { startMessageEditing, cancelMessageEditing: dismissEditor, getComposerEditSubmission };
}
