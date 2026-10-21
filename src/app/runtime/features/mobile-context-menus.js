// The menus that slide up from the bottom on a phone when a conversation, a folder or a Noura in the sidebar is held: one sheet with its
// overlay, closed by a tap outside or by pulling it down, whose item runs its action once the sheet has slid away.

import { buildConversationMobileContextMenuMarkup, buildFolderMobileContextMenuMarkup, buildAstraMobileContextMenuMarkup } from './mobile-context-menu-markup.js';

const CLOSE_DISTANCE = 100;
const ACTION_DELAY_MS = 300;

export function createMobileContextMenus({
    document, elements: ALL_ELEMENTS, i18n, getUiLanguage, getConversations, getFolders, getAstras, requestAnimationFrame, setTimeout,
    showRenameModal, togglePinChat, archiveChat, deleteChat, moveConversationToFolder, renderBatchMoveModal,
    showFolderSettingsModal, deleteFolder, deleteAstras, openAvatarEditor, editAstras, toggleModal
}) {
    const openSheet = (markup, runAction) => {
        document.getElementById('mobile-context-menu-wrapper')?.remove();
        const menuWrapper = document.createElement('div');
        menuWrapper.id = 'mobile-context-menu-wrapper';
        const overlay = document.createElement('div');
        overlay.id = 'mobile-context-menu-overlay';
        const menu = document.createElement('div');
        menu.id = 'mobile-context-menu';
        menu.innerHTML = markup;
        menuWrapper.appendChild(overlay);
        menuWrapper.appendChild(menu);
        document.body.appendChild(menuWrapper);
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            menu.classList.add('visible');
        });
        const closeMenu = () => {
            overlay.classList.remove('visible');
            menu.classList.remove('visible');
            menu.addEventListener('transitionend', () => menuWrapper.remove(), { once: true });
        };
        overlay.addEventListener('click', closeMenu);
        let touchStartY = 0;
        let touchMoveY = 0;
        menu.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        menu.addEventListener('touchmove', (e) => {
            touchMoveY = e.touches[0].clientY;
            const deltaY = touchMoveY - touchStartY;
            if (deltaY > 0) {
                menu.style.transform = `translateY(${deltaY}px)`;
            }
        }, { passive: true });
        menu.addEventListener('touchend', () => {
            const deltaY = touchMoveY - touchStartY;
            if (deltaY > CLOSE_DISTANCE) {
                closeMenu();
            } else {
                menu.style.transform = '';
            }
            touchStartY = 0;
            touchMoveY = 0;
        });
        menu.addEventListener('click', (e) => {
            const actionTarget = e.target.closest('.menu-item');
            if (!actionTarget) return;
            const action = actionTarget.dataset.action;
            closeMenu();
            setTimeout(() => runAction(action, e), ACTION_DELAY_MS);
        });
    };
    const text = () => i18n[getUiLanguage()];

    const showMobileContextMenu = (convId) => {
        const conv = getConversations().find(c => c.id === convId);
        if (!conv) {
            document.getElementById('mobile-context-menu-wrapper')?.remove();
            return;
        }
        openSheet(buildConversationMobileContextMenuMarkup({ title: conv.title, folderId: conv.folderId, pinned: conv.pinned, text: text() }), (action, e) => {
            switch (action) {
                case 'rename': showRenameModal(convId, 'conversation', e); break;
                case 'pin': togglePinChat(convId, e); break;
                case 'archive': archiveChat(convId, e); break;
                case 'delete': deleteChat(convId, e); break;
                case 'move-out': moveConversationToFolder(convId, null); break;
                case 'move-to':
                    renderBatchMoveModal(convId);
                    toggleModal(ALL_ELEMENTS.batchMoveModal, true);
                    break;
            }
        });
    };
    const showMobileContextMenuForFolder = (folderId) => {
        const folder = getFolders().find(f => f.id === folderId);
        if (!folder) {
            document.getElementById('mobile-context-menu-wrapper')?.remove();
            return;
        }
        openSheet(buildFolderMobileContextMenuMarkup({ name: folder.name, text: text() }), (action, e) => {
            switch (action) {
                case 'rename-folder': showRenameModal(folderId, 'folder', e); break;
                case 'customize-folder': showFolderSettingsModal(folderId, e); break;
                case 'delete-folder': deleteFolder(folderId, e); break;
            }
        });
    };
    const showMobileContextMenuForAstras = (astrasId) => {
        const astra = getAstras().find(a => a.id === astrasId);
        if (!astra) {
            document.getElementById('mobile-context-menu-wrapper')?.remove();
            return;
        }
        openSheet(buildAstraMobileContextMenuMarkup({ name: astra.name, officialId: astra.officialId, text: text() }), (action) => {
            switch (action) {
                case 'edit-astras': editAstras(astrasId); break;
                case 'edit-avatar': openAvatarEditor(astrasId); break;
                case 'delete-astras': deleteAstras(astrasId); break;
            }
        });
    };
    return { showMobileContextMenu, showMobileContextMenuForFolder, showMobileContextMenuForAstras };
}
