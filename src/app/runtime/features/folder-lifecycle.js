export function createLegacyFolderLifecycle({
  document,
  elements,
  getFolders,
  getConversations,
  replaceFolders,
  getDefaultFolder,
  saveAppData,
  deleteFolderFromCloud = async () => {},
  renderFolders,
  renderAll,
  showCustomConfirm,
  showNotification,
  toggleModal,
  showRenameModal,
  folderColors,
  folderIconOptions,
  normalizeFolderColorSelection,
  getI18n,
  getUiLanguage,
  randomUUID,
  scheduleAnimationFrame,
  logger = console
} = {}) {
  let folderToCustomize = null;

  const getTexts = () => getI18n()[getUiLanguage()];

  const createNewFolder = (name) => {
    const folders = getFolders();
    const newFolder = {
      id: randomUUID(),
      name,
      conversationIds: [],
      ...getDefaultFolder()
    };
    folders.push(newFolder);
    replaceFolders(folders);
    void saveAppData().catch(error => logger.error('Failed to save folder state:', error));
    renderFolders();
    return newFolder.id;
  };

  const moveConversationToFolder = async (convId, folderId) => {
    const conversations = getConversations();
    const folders = getFolders();
    const conversation = conversations.find(item => item.id === convId);
    if (!conversation) return;
    if (conversation.folderId) {
      const oldFolder = folders.find(folder => folder.id === conversation.folderId);
      if (oldFolder) {
        oldFolder.conversationIds = oldFolder.conversationIds.filter(id => id !== convId);
      }
    }
    conversation.folderId = folderId;
    if (folderId) {
      const newFolder = folders.find(folder => folder.id === folderId);
      if (newFolder && !newFolder.conversationIds.includes(convId)) {
        newFolder.conversationIds.push(convId);
      }
    }
    await saveAppData();
    renderAll();
  };

  const deleteFolder = async (id, event) => {
    event?.stopPropagation();
    const folders = getFolders();
    const folder = folders.find(item => item.id === id);
    if (!folder) return;
    const confirmMessage = folder.conversationIds.length > 0
      ? getTexts().confirmDeleteFolderWithChats
      : getTexts().confirmDeleteEmptyFolder;
    if (!(await showCustomConfirm(confirmMessage, getTexts().deleteFolderTitle))) return;
    try {
      await deleteFolderFromCloud(id, { folder });
    } catch (error) {
      try { logger.warn?.('Noureon cloud folder delete failed; keeping the local folder.', error); } catch {}
      showNotification(getTexts().cloudDeleteFailed || '雲端刪除失敗，請稍後再試。', 'error');
      return;
    }
    getConversations().forEach(conversation => {
      if (conversation.folderId === id) {
        conversation.folderId = null;
      }
    });
    replaceFolders(folders.filter(item => item.id !== id));
    await saveAppData();
    renderAll();
    showNotification(getTexts().folderDeleted, 'success');
  };

  const showFolderSettingsModal = (id, event) => {
    event?.stopPropagation();
    folderToCustomize = id;
    const folder = getFolders().find(item => item.id === id);
    if (!folder) return;

    elements.colorSwatchesContainer.innerHTML = '';
    const colorTitle = elements.colorSwatchesContainer.parentElement.querySelector('h3');
    if (colorTitle) colorTitle.textContent = getTexts().folderIconLineColor || 'Set icon line color';

    Object.entries(folderColors).forEach(([name, hex]) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch w-8 h-8 rounded-full cursor-pointer border-2 border-transparent flex-shrink-0';
      swatch.style.backgroundColor = hex;
      swatch.dataset.color = name;
      if (normalizeFolderColorSelection(folder.color, folderColors) === name) {
        swatch.classList.add('selected');
        swatch.style.borderColor = '#3b82f6';
      }
      swatch.addEventListener('click', () => {
        elements.colorSwatchesContainer.querySelectorAll('.selected').forEach(element => {
          element.classList.remove('selected');
          element.style.borderColor = 'transparent';
        });
        swatch.classList.add('selected');
        swatch.style.borderColor = '#3b82f6';
      });
      elements.colorSwatchesContainer.appendChild(swatch);
    });

    elements.iconOptionsContainer.className = 'grid grid-cols-5 sm:grid-cols-6 gap-3 mt-2';
    elements.iconOptionsContainer.innerHTML = '';

    Object.entries(folderIconOptions).forEach(([key, svgPath]) => {
      const iconOption = document.createElement('div');
      iconOption.className = 'icon-option w-11 h-11 sm:w-12 sm:h-12 rounded-lg cursor-pointer flex items-center justify-center bg-[var(--sidebar-bg)] border border-transparent hover:bg-[var(--hover-bg)] transition-all';
      iconOption.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
      iconOption.dataset.icon = key;

      if (folder.icon === key || (!folder.icon && key === 'default')) {
        iconOption.classList.add('selected');
        iconOption.style.borderColor = '#3b82f6';
        iconOption.style.color = '#3b82f6';
        iconOption.style.backgroundColor = 'var(--active-bg)';
      } else {
        iconOption.style.color = 'var(--text-secondary)';
      }

      iconOption.addEventListener('click', () => {
        elements.iconOptionsContainer.querySelectorAll('.selected').forEach(element => {
          element.classList.remove('selected');
          element.style.borderColor = 'transparent';
          element.style.color = 'var(--text-secondary)';
          element.style.backgroundColor = '';
        });
        iconOption.classList.add('selected');
        iconOption.style.borderColor = '#3b82f6';
        iconOption.style.color = '#3b82f6';
        iconOption.style.backgroundColor = 'var(--active-bg)';
      });
      elements.iconOptionsContainer.appendChild(iconOption);
    });

    let textColorContainer = document.getElementById('text-color-container');
    if (!textColorContainer) {
      const container = document.createElement('div');
      container.id = 'text-color-container';
      container.className = 'mt-6 border-t border-[var(--border-color)] pt-4';
      container.innerHTML = `
        <h3 class="text-sm font-medium mb-3">${getTexts().folderTextColor || 'Select text color'}</h3>
        <div id="text-color-options" class="flex gap-4"></div>
      `;
      elements.iconOptionsContainer.parentElement.after(container);
      textColorContainer = container;
    }

    const textColorOptions = document.getElementById('text-color-options');
    textColorOptions.innerHTML = '';
    const textColorMap = {
      gray: { label: getTexts().folderTextColorGray || 'Default gray', bg: '#6b7280', border: 'transparent' },
      black: { label: getTexts().folderTextColorBlack || 'Deep black', bg: '#111827', border: 'transparent' },
      white: { label: getTexts().folderTextColorWhite || 'Pure white', bg: '#ffffff', border: '#e5e7eb' }
    };

    Object.entries(textColorMap).forEach(([key, info]) => {
      const button = document.createElement('button');
      button.className = 'w-9 h-9 rounded-full cursor-pointer border-2 relative shadow-sm transition-transform hover:scale-110';
      button.style.backgroundColor = info.bg;
      button.style.borderColor = info.border;
      button.dataset.textColor = key;
      button.title = info.label;

      if (folder.textColor === key || (!folder.textColor && key === 'gray')) {
        button.classList.add('selected-text');
        button.innerHTML = `<svg class="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${key === 'white' ? 'text-black' : 'text-white'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        if (key === 'white') button.style.borderColor = '#3b82f6';
        else button.style.boxShadow = '0 0 0 2px #3b82f6';
      }

      button.addEventListener('click', () => {
        textColorOptions.querySelectorAll('.selected-text').forEach(element => {
          element.classList.remove('selected-text');
          element.innerHTML = '';
          element.style.boxShadow = '';
          if (element.dataset.textColor === 'white') element.style.borderColor = '#e5e7eb';
        });
        button.classList.add('selected-text');
        button.innerHTML = `<svg class="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${key === 'white' ? 'text-black' : 'text-white'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        if (key === 'white') button.style.borderColor = '#3b82f6';
        else button.style.boxShadow = '0 0 0 2px #3b82f6';
      });
      textColorOptions.appendChild(button);
    });

    toggleModal(elements.folderSettingsModal, true);
  };

  const handleSaveFolderSettings = async () => {
    const folders = getFolders();
    const folder = folders.find(item => item.id === folderToCustomize);
    if (!folder) return;

    const selectedColor = elements.colorSwatchesContainer.querySelector('.selected')?.dataset.color;
    const selectedIcon = elements.iconOptionsContainer.querySelector('.selected')?.dataset.icon;
    const textColorOptions = document.getElementById('text-color-options');
    const selectedTextColor = textColorOptions?.querySelector('.selected-text')?.dataset.textColor;

    if (selectedColor) folder.color = normalizeFolderColorSelection(selectedColor, folderColors);
    if (selectedIcon) folder.icon = selectedIcon;
    if (selectedTextColor) folder.textColor = selectedTextColor;
    replaceFolders(folders);

    await saveAppData();
    renderAll();
    toggleModal(elements.folderSettingsModal, false);
    folderToCustomize = null;
  };

  const createFolderMenu = (folderId, targetButton) => {
    const existingPopover = document.getElementById('history-popover');
    if (existingPopover) {
      existingPopover.remove();
      if (existingPopover.dataset.targetId === targetButton.id) return;
    }
    const rect = targetButton.getBoundingClientRect();
    const popover = document.createElement('div');
    popover.id = 'history-popover';
    popover.className = 'popover absolute w-48 rounded-lg border border-[var(--border-color)] z-50';
    popover.dataset.targetId = targetButton.id;
    popover.style.top = `${rect.bottom}px`;
    popover.style.left = `${rect.left}px`;
    popover.innerHTML = `
      <button data-id="${folderId}" class="rename-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${getTexts().rename || '重新命名'}</button>
      <button data-id="${folderId}" class="customize-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${getTexts().customize || '自訂'}</button>
      <div class="border-t my-1 border-[var(--border-color)]"></div>
      <button data-id="${folderId}" class="delete-folder-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${getTexts().deleteFolder || '刪除資料夾'}</button>
    `;
    document.body.appendChild(popover);
    scheduleAnimationFrame(() => popover.classList.add('visible'));
    popover.querySelector('.rename-folder-btn').addEventListener('click', event => {
      showRenameModal(folderId, 'folder', event);
      popover.remove();
    });
    popover.querySelector('.customize-folder-btn').addEventListener('click', event => {
      showFolderSettingsModal(folderId, event);
      popover.remove();
    });
    popover.querySelector('.delete-folder-btn').addEventListener('click', event => {
      deleteFolder(folderId, event);
      popover.remove();
    });
  };

  return {
    createNewFolder,
    moveConversationToFolder,
    deleteFolder,
    showFolderSettingsModal,
    handleSaveFolderSettings,
    createFolderMenu
  };
}
