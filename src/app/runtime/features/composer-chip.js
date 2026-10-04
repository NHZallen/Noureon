// The close button the chips above the message box share (learning, search, Noura, council, deep research).

const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

export const chipCloseButton = (id, title, attrs = '') => `<button ${attrs}id="${id}" class="ml-2 p-1 rounded-full hover:bg-black/10" title="${title}">${CLOSE_ICON}</button>`;
