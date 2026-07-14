import { escapeHTML } from '../../runtime/legacy-core/legacy-core-utilities.js';

const EDIT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>';
const PIN_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9" /></svg>';
const MOVE_OUT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3v11.25" /></svg>';
const MOVE_TO_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>';
const ARCHIVE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4" /></svg>';
const DELETE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.067-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>';
const CUSTOMIZE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">\n                            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />\n                        </svg>';
const AVATAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>';

export function buildConversationMobileContextMenuMarkup({ title, folderId, pinned, text = {} } = {}) {
  const moveOptionsHTML = folderId
    ? `<div class="menu-item" data-action="move-out">${MOVE_OUT_ICON_SVG}<span>${text.moveOutOfFolder || '移出資料夾'}</span></div>`
    : `<div class="menu-item" data-action="move-to">${MOVE_TO_ICON_SVG}<span>${text.moveToFolder || '移至資料夾'}</span></div>`;
  const pinText = pinned ? (text.unpin || '取消釘選') : (text.pin || '釘選');
  return `
                <div class="menu-header">${escapeHTML(title)}</div>
                <div class="menu-options">
                    <div class="menu-item" data-action="rename">${EDIT_ICON_SVG}<span>${text.rename || '重新命名'}</span></div>
                    <div class="menu-item" data-action="pin">${PIN_ICON_SVG}<span>${pinText}</span></div>
                    ${moveOptionsHTML}
                    <div class="menu-item" data-action="archive">${ARCHIVE_ICON_SVG}<span>${text.archive || '封存'}</span></div>
                    <div class="menu-item delete" data-action="delete">${DELETE_ICON_SVG}<span>${text.delete || '刪除'}</span></div>
                </div>
            `;
}

export function buildFolderMobileContextMenuMarkup({ name, text = {} } = {}) {
  return `
                <div class="menu-header">${escapeHTML(name)}</div>
                <div class="menu-options">
                    <div class="menu-item" data-action="rename-folder">
                        ${EDIT_ICON_SVG}
                        <span>${text.rename || '重新命名'}</span>
                    </div>
                    
                    <!-- 修改：這裡更換了「自訂」的圖示，改為清晰的調整滑桿 -->
                    <div class="menu-item" data-action="customize-folder">
                        ${CUSTOMIZE_ICON_SVG}
                        <span>${text.customize || '自訂'}</span>
                    </div>


                    <div class="menu-item delete" data-action="delete-folder">
                        ${DELETE_ICON_SVG}
                        <span>${text.deleteFolder || '刪除資料夾'}</span>
                    </div>
                </div>
            `;
}

export function buildAstraMobileContextMenuMarkup({ name, officialId, text = {} } = {}) {
  const menuOptions = officialId
    ? `
                    <div class="menu-item" data-action="edit-avatar">${AVATAR_ICON_SVG}<span>${text.editAvatar || '編輯頭像'}</span></div>
                    <div class="menu-item delete" data-action="delete-astras">${DELETE_ICON_SVG}<span>${text.delete || '刪除'}</span></div>
                `
    : `
                    <div class="menu-item" data-action="edit-astras">${EDIT_ICON_SVG}<span>${text.edit || '編輯'}</span></div>
                    <div class="menu-item" data-action="edit-avatar">${AVATAR_ICON_SVG}<span>${text.editAvatar || '編輯頭像'}</span></div>
                    <div class="menu-item delete" data-action="delete-astras">${DELETE_ICON_SVG}<span>${text.delete || '刪除'}</span></div>
                `;
  return `
                <div class="menu-header">${escapeHTML(name)}</div>
                <div class="menu-options">${menuOptions}</div>
            `;
}
