const textFromMessage = (message) => (message?.parts || [])
  .filter(part => part?.text)
  .map(part => part.text)
  .join('\n');

const escapeHTML = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const filesFromMessage = (message) => (message?.parts || [])
  .filter(part => part?.inlineData)
  .map(({ inlineData }) => ({
    name: inlineData.name || 'attachment',
    type: inlineData.mimeType || 'application/octet-stream',
    size: inlineData.size || 0,
    base64: `data:${inlineData.mimeType || 'application/octet-stream'};base64,${inlineData.data || ''}`,
    targetedEdit: Boolean(inlineData.targetedEdit)
  }));

const attachmentMarkup = (file, index) => {
  const isImage = String(file.type || '').startsWith('image/');
  const thumbnail = isImage
    ? `<img src="${file.base64}" alt="" class="message-edit-attachment-image">`
    : '<span class="message-edit-file-icon">檔案</span>';
  return `<div class="message-edit-attachment">
    ${thumbnail}
    <span class="message-edit-attachment-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
    <button type="button" data-edit-remove-file="${index}" aria-label="刪除附件">×</button>
  </div>`;
};

export function createMessageEditingLifecycle({
  document,
  elements,
  getActiveConversation,
  renderChat,
  saveAppData,
  submitEditedMessage,
  openCouncilPopover = () => {},
  renderInputIndicators = () => {},
  showNotification = () => {},
  isMobile = () => globalThis.matchMedia?.('(max-width: 768px)')?.matches
} = {}) {
  let activeEditor = null;

  const dismissEditor = () => {
    if (!activeEditor) return;
    activeEditor.root?.remove();
    activeEditor = null;
  };

  const readFiles = async (fileList) => Promise.all([...fileList].map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, base64: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));

  const renderEditor = () => {
    const editor = activeEditor;
    if (!editor) return;
    const { root, files, mobile } = editor;
    root.innerHTML = `
      <div class="message-edit-header">
        <button type="button" class="message-edit-close" data-edit-cancel aria-label="關閉編輯">×</button>
        <h2>編輯訊息</h2>
      </div>
      <div class="message-edit-panel">
        <textarea class="message-edit-textarea" aria-label="編輯訊息" placeholder="輸入訊息">${escapeHTML(editor.text)}</textarea>
        <div class="message-edit-attachments">${files.map(attachmentMarkup).join('')}</div>
        <input class="message-edit-file-input" type="file" multiple hidden>
        <div class="message-edit-footer">
          <div class="message-edit-tools">
            <button type="button" class="message-edit-plus" data-edit-tools aria-expanded="false" aria-label="新增附件或附加功能">+</button>
            <div class="message-edit-tool-menu" hidden>
              <button type="button" data-edit-add-files>新增圖片或檔案</button>
              <button type="button" data-edit-toggle-search>${editor.conversation.isWebSearchEnabled ? '✓ ' : ''}網路搜尋</button>
              <button type="button" data-edit-council>模型理事會</button>
            </div>
          </div>
          <p class="message-edit-warning">傳送後，這則訊息後的對話將被移除。</p>
          <div class="message-edit-buttons">
            <button type="button" class="message-edit-cancel" data-edit-cancel>取消</button>
            <button type="button" class="message-edit-send" data-edit-send>傳送</button>
          </div>
        </div>
      </div>`;
    if (!mobile) root.querySelector('.message-edit-header').hidden = true;

    const textarea = root.querySelector('.message-edit-textarea');
    textarea.addEventListener('input', () => { editor.text = textarea.value; });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dismissEditor();
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void sendEditedMessage();
      }
    });
    root.querySelectorAll('[data-edit-cancel]').forEach(button => button.addEventListener('click', dismissEditor));
    root.querySelectorAll('[data-edit-remove-file]').forEach(button => button.addEventListener('click', () => {
      editor.files.splice(Number(button.dataset.editRemoveFile), 1);
      renderEditor();
    }));
    root.querySelector('[data-edit-tools]').addEventListener('click', (event) => {
      const menu = root.querySelector('.message-edit-tool-menu');
      menu.hidden = !menu.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!menu.hidden));
    });
    root.querySelector('[data-edit-add-files]').addEventListener('click', () => root.querySelector('.message-edit-file-input').click());
    root.querySelector('.message-edit-file-input').addEventListener('change', async (event) => {
      try {
        editor.files.push(...await readFiles(event.target.files));
        renderEditor();
      } catch {
        showNotification('無法讀取選取的檔案。', 'error');
      }
    });
    root.querySelector('[data-edit-toggle-search]').addEventListener('click', async () => {
      editor.conversation.isWebSearchEnabled = !editor.conversation.isWebSearchEnabled;
      renderInputIndicators();
      await saveAppData();
      renderEditor();
    });
    root.querySelector('[data-edit-council]').addEventListener('click', () => {
      root.querySelector('.message-edit-tool-menu').hidden = true;
      openCouncilPopover();
    });
    root.querySelector('[data-edit-send]').addEventListener('click', () => { void sendEditedMessage(); });
    requestAnimationFrame(() => textarea.focus());
  };

  const sendEditedMessage = async () => {
    const editor = activeEditor;
    if (!editor || editor.sending) return;
    const text = editor.text.trim();
    if (!text && editor.files.length === 0) return;
    editor.sending = true;
    const sendButton = editor.root.querySelector('[data-edit-send]');
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = '傳送中…';
    }

    const conversation = editor.conversation;
    // Editing is a branch: discard the edited message and every message after it before resubmitting.
    conversation.messages.splice(editor.index);
    await saveAppData();
    dismissEditor();
    renderChat();
    await submitEditedMessage({ userMessage: text, uploadedFiles: editor.files });
  };

  const startMessageEditing = (messageIndex) => {
    const conversation = getActiveConversation();
    const message = conversation?.messages?.[messageIndex];
    if (!message || message.role !== 'user') return;
    dismissEditor();
    const mobile = Boolean(isMobile());
    const root = document.createElement('section');
    root.className = mobile ? 'message-edit-mobile-page' : 'message-edit-inline';
    activeEditor = {
      conversation,
      index: messageIndex,
      text: textFromMessage(message),
      files: filesFromMessage(message),
      root,
      mobile,
      sending: false
    };
    if (mobile) {
      document.body.appendChild(root);
    } else {
      const messageElement = elements.messageList.querySelector(`.message-item[data-message-index="${messageIndex}"]`);
      const stack = messageElement?.querySelector('.message-stack-user');
      if (!stack) return dismissEditor();
      stack.replaceWith(root);
    }
    renderEditor();
  };

  return { startMessageEditing, cancelMessageEditing: dismissEditor };
}
