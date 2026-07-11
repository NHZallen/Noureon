export function createDialogNotificationLifecycle({
  document,
  elements,
  setTimeout,
  clearTimeout,
  requestAnimationFrame,
  getText = (_key, fallback) => fallback
}) {
  const showNotification = (message, type = 'success') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    elements.notificationContainer.appendChild(notification);
    setTimeout(() => { notification.remove(); }, 3000);
  };

  const toggleModal = (modalElement, show) => {
    if (!modalElement) return;
    const closeTimers = toggleModal.closeTimers || (toggleModal.closeTimers = new WeakMap());
    if (show) {
      const existingTimer = closeTimers.get(modalElement);
      if (existingTimer) {
        clearTimeout(existingTimer);
        closeTimers.delete(modalElement);
      }
      document.body.classList.add('modal-open');
      modalElement.classList.remove('hidden');
      requestAnimationFrame(() => {
        modalElement.classList.add('visible');
      });
    } else {
      document.body.classList.remove('modal-open');
      modalElement.classList.remove('visible');
      const onTransitionEnd = () => {
        modalElement.classList.add('hidden');
        modalElement.removeEventListener('transitionend', onTransitionEnd);
        const timer = closeTimers.get(modalElement);
        if (timer) {
          clearTimeout(timer);
          closeTimers.delete(modalElement);
        }
      };
      modalElement.addEventListener('transitionend', onTransitionEnd);
      const fallbackTimer = setTimeout(onTransitionEnd, 350);
      closeTimers.set(modalElement, fallbackTimer);
    }
  };

  const showCustomDialog = (options) => {
    return new Promise((resolve) => {
      const { title, message, input = null, buttons, dialogClass = '' } = options;
      const dialogBox = elements.customDialogModal.querySelector('.bg-\\[var\\(--modal-bg\\)\\]');
      if (dialogClass) {
        dialogBox.classList.add(dialogClass);
      }
      elements.customDialogTitle.textContent = title;
      elements.customDialogMessage.textContent = message;
      if (input) {
        elements.customDialogInput.type = input.type || 'text';
        elements.customDialogInput.value = '';
        elements.customDialogInput.placeholder = input.placeholder || '';
        elements.customDialogInputContainer.classList.remove('hidden');
      } else {
        elements.customDialogInputContainer.classList.add('hidden');
      }
      elements.customDialogButtons.innerHTML = '';
      buttons.forEach(btnInfo => {
        const button = document.createElement('button');
        button.textContent = btnInfo.text;
        button.className = btnInfo.class;
        button.onclick = () => {
          toggleModal(elements.customDialogModal, false);
          if (dialogClass) {
            dialogBox.classList.remove(dialogClass);
          }
          const inputValue = input ? elements.customDialogInput.value : null;
          resolve(btnInfo.value(inputValue));
        };
        elements.customDialogButtons.appendChild(button);
      });
      toggleModal(elements.customDialogModal, true);
      if (input) { elements.customDialogInput.focus(); }
    });
  };

  const showCustomConfirm = (message, title = null) => showCustomDialog({ title: title || getText('pleaseConfirm', '請確認'), message, buttons: [{ text: getText('cancel', '取消'), class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false }, { text: getText('confirm', '確定'), class: 'px-4 py-2 rounded-md btn-primary', value: () => true }] });
  const showCustomPrompt = (message, title = null, inputType = 'text') => showCustomDialog({ title: title || getText('dialogPromptTitle', '請輸入'), message, input: { type: inputType, placeholder: getText('dialogInputPlaceholder', '請在此輸入…') }, buttons: [{ text: getText('cancel', '取消'), class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null }, { text: getText('confirm', '確定'), class: 'px-4 py-2 rounded-md btn-primary', value: (val) => val }] });

  return {
    showNotification,
    toggleModal,
    showCustomDialog,
    showCustomConfirm,
    showCustomPrompt
  };
}
