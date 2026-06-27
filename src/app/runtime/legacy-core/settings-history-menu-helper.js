const REQUIRED_DEPENDENCIES = [
  'window',
  'document',
  'requestAnimationFrame',
  'getConfig',
  'getConversations',
  'getFolders',
  'i18n',
  'showRenameModal',
  'togglePinChat',
  'archiveChat',
  'deleteChat',
  'moveConversationToFolder',
  'createNewFolder',
  'showCustomPrompt'
];

function assertRequiredDependencies(dependencies) {
  const missing = REQUIRED_DEPENDENCIES.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new Error(`createSettingsHistoryMenuHelper missing dependencies: ${missing.join(', ')}`);
  }
}

export function createSettingsHistoryMenuHelper(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    window,
    document,
    requestAnimationFrame,
    getConfig,
    getConversations,
    getFolders,
    i18n,
    showRenameModal,
    togglePinChat,
    archiveChat,
    deleteChat,
    moveConversationToFolder,
    createNewFolder,
    showCustomPrompt
  } = dependencies;

  const getTexts = () => i18n[getConfig().uiLanguage] || {};

  function createHistoryMenu(convId, targetButton) {
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

    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 250) {
      popover.style.bottom = `${window.innerHeight - rect.top}px`;
      popover.style.transformOrigin = 'bottom';
    } else {
      popover.style.top = `${rect.bottom}px`;
      popover.style.transformOrigin = 'top';
    }
    popover.style.left = `${rect.left}px`;

    const texts = getTexts();
    const conversations = getConversations();
    const folders = getFolders();
    const conv = conversations.find((conversation) => conversation.id === convId);
    const pinText = conv.pinned ? (texts.unpin || '取消釘選') : (texts.pin || '釘選');
    const moveOptionsHTML = conv.folderId
      ? `<button data-id="${convId}" class="move-out-of-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${texts.moveOutOfFolder || '移出資料夾'}</button>`
      : `
            <div class="relative group">
                <button class="w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm flex justify-between items-center">
                    <span>${texts.moveToFolder || '移至資料夾'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
                <div class="absolute left-full top-0 w-48 rounded-lg border border-[var(--border-color)] bg-[var(--modal-bg)] hidden group-hover:block">
                    ${folders.map((folder) => `<button data-folder-id="${folder.id}" class="move-to-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${folder.name}</button>`).join('')}
                        <div class="border-t my-1 border-[var(--border-color)]"></div>
                        <button class="new-folder-from-menu-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${texts.createNewFolder || '建立新資料夾'}</button>
                    </div>
                </div>
            `;

    popover.innerHTML = `
        <button data-id="${convId}" class="rename-conv-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${texts.rename || '重新命名'}</button>
        <button data-id="${convId}" class="pin-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${pinText}</button>
        ${moveOptionsHTML}
        <button data-id="${convId}" class="archive-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${texts.archive || '封存'}</button>
        <div class="border-t my-1 border-[var(--border-color)]"></div>
        <button data-id="${convId}" class="delete-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${texts.delete || '刪除'}</button>
    `;

    document.body.appendChild(popover);
    requestAnimationFrame(() => popover.classList.add('visible'));
    popover.querySelector('.rename-conv-btn').addEventListener('click', (event) => {
      showRenameModal(convId, 'conversation', event);
      popover.remove();
    });
    popover.querySelector('.pin-btn').addEventListener('click', (event) => {
      togglePinChat(convId, event);
      popover.remove();
    });
    popover.querySelector('.archive-btn').addEventListener('click', (event) => {
      archiveChat(convId, event);
      popover.remove();
    });
    popover.querySelector('.delete-btn').addEventListener('click', (event) => {
      deleteChat(convId, event);
      popover.remove();
    });
    popover.querySelectorAll('.move-to-folder-btn').forEach((button) => button.addEventListener('click', () => {
      moveConversationToFolder(convId, button.dataset.folderId);
      popover.remove();
    }));

    const newFolderBtn = popover.querySelector('.new-folder-from-menu-btn');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', async () => {
        popover.remove();
        const folderName = await showCustomPrompt(texts.enterFolderName || '請輸入新資料夾的名稱：', texts.createNewFolder || '建立新資料夾');
        if (folderName) {
          const newFolderId = createNewFolder(folderName);
          moveConversationToFolder(convId, newFolderId);
        }
      });
    }

    const moveOutBtn = popover.querySelector('.move-out-of-folder-btn');
    if (moveOutBtn) {
      moveOutBtn.addEventListener('click', () => {
        moveConversationToFolder(convId, null);
        popover.remove();
      });
    }
  }

  return {
    createHistoryMenu
  };
}
