import fragment00 from './fragments/00-shell.fragment.js';
import fragment01 from './fragments/01-shell.fragment.js';
import fragment02 from './fragments/02-shell.fragment.js';
import fragment03 from './fragments/03-shell.fragment.js';
import fragment04 from './fragments/04-shell.fragment.js';
import fragment05 from './fragments/05-shell.fragment.js';
import fragment06 from './fragments/06-shell.fragment.js';
import fragment07 from './fragments/07-shell.fragment.js';
import { renderComposerToolIcon } from '../app/composer-tool-icons.js';

const appShellWithLegacyDemo = [
  fragment00,
  fragment01,
  fragment02,
  fragment03,
  fragment04,
  fragment05,
  fragment06,
  fragment07
].join('');

const appShellWithoutLegacyDemo = appShellWithLegacyDemo.replace(
  /\s*<section class="py-20 lg:py-24 bg-gray-50">[\s\S]*?<div id="demo-chat-window"[\s\S]*?<\/section>/,
  ''
);

const decorateComposerMenuItem = (shell, { id, labelKey, descriptionKey, description, icon }) => {
  const pattern = new RegExp(`(<button id="${id}"[^>]*>[\\s\\S]*?)(<span data-lang-key="${labelKey}">[^<]*<\\/span>)`);
  return shell.replace(pattern, (_, before, label) => {
    const decoratedIcon = before.replace(/<svg\b[\s\S]*?<\/svg>/, renderComposerToolIcon(icon));
    return `${decoratedIcon}<span class="composer-menu-copy">${label}<span class="composer-menu-description" data-lang-key="${descriptionKey}">${description}</span></span>`;
  });
};

const composerExpandButton = `
                                    <button type="button" id="expand-input-btn" class="composer-expand-btn hidden" aria-expanded="false" aria-label="展開輸入欄" title="展開輸入欄">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                            <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
                                        </svg>
                                    </button>`;

const composerRichEditor = `<div id="message-input" role="textbox" aria-multiline="true" aria-disabled="true" contenteditable="false" data-composer-editor data-placeholder="請先在設定中輸入 API 金鑰..." class="w-full p-2 bg-transparent border-0 focus:ring-0 overflow-y-hidden" autocomplete="off" data-lang-key-placeholder="enterApiKeyPlaceholder"></div>`;

const composerShell = appShellWithoutLegacyDemo.replace(
  /\s*<button(?=[^>]*\bid="expand-input-btn")[\s\S]*?<\/button>/,
  composerExpandButton
).replace(
  /<textarea id="message-input"[^>]*><\/textarea>/,
  composerRichEditor
).replace(
  '<p class="mt-1"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>',
  '<p class="mt-1"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>\n                    <p class="mt-1"><a href="https://github.com/NHZallen/Noureon" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">GitHub</a></p>'
).replace(
  '<p class="text-sm text-[var(--text-secondary)] mb-2"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>',
  '<p class="text-sm text-[var(--text-secondary)] mb-2"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>\n                        <p class="text-sm text-[var(--text-secondary)] mb-4"><a href="https://github.com/NHZallen/Noureon" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">GitHub</a></p>'
).replace(
  '<main class="flex-1 flex flex-col relative h-full">',
  '<main id="chat-workspace" class="flex-1 flex flex-col relative h-full" data-composer-layout="docked">'
).replace(
  '<button id="add-file-btn" title="附加檔案"',
  '<button id="add-file-btn" title="附加檔案" aria-haspopup="menu" aria-controls="file-options-popover" aria-expanded="false"'
).replace(
  '<div id="file-options-popover" class="popover absolute bottom-full left-0 mb-2 w-56 z-20">',
  '<div id="file-options-popover" class="popover absolute bottom-full left-0 mb-2 w-56 z-20" role="menu" aria-label="附加檔案與其他功能">'
);

const appShell = [
  { id: 'camera-btn', labelKey: 'camera', descriptionKey: 'cameraDescription', description: '使用裝置拍攝影像', icon: 'camera' },
  { id: 'upload-image-btn', labelKey: 'image', descriptionKey: 'imageDescription', description: '上傳圖片或影片', icon: 'media' },
  { id: 'upload-file-btn', labelKey: 'file', descriptionKey: 'fileDescription', description: '上傳文件與其他檔案', icon: 'file' },
  { id: 'web-search-popover-btn', labelKey: 'search', descriptionKey: 'webSearchDescription', description: '搜尋即時網路資訊', icon: 'webSearch' },
  { id: 'learning-mode-btn', labelKey: 'learning', descriptionKey: 'learningDescription', description: '以引導方式協助理解', icon: 'learning' }
].reduce(decorateComposerMenuItem, composerShell);

export default appShell;
