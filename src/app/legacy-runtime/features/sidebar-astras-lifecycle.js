import { escapeHTML } from '../../runtime/legacy-core/legacy-core-utilities.js';

export function isRenderableAstraAvatarUrl(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function createSidebarAstrasLifecycle({
    astras,
    clearTimeoutFn = (...args) => globalThis.clearTimeout?.(...args),
    createAstrasMenu = () => {},
    elements = {},
    getActiveAstrasId = () => null,
    getAstras = () => astras || [],
    getIsSelectionMode,
    getText = (_key, fallback) => fallback,
    isSelectionMode = false,
    setAstrasForConversation = () => {},
    setTimeoutFn = (...args) => globalThis.setTimeout?.(...args),
    showMobileContextMenuForAstras = () => {},
    toggleSidebar = () => {},
    window: runtimeWindow = globalThis.window
} = {}) {
    const getSelectionMode = () => {
        if (typeof getIsSelectionMode === 'function') return getIsSelectionMode();
        if (typeof isSelectionMode === 'function') return isSelectionMode();
        return Boolean(isSelectionMode);
    };

    const renderAstras = () => {
        const astrasList = elements.astrasList;
        if (!astrasList) return false;
        astrasList.innerHTML = '';
        const activeAstrasId = getActiveAstrasId();
        const currentAstras = getAstras() || [];
        const getLocalizedAstra = (ast) => {
            const officialId = ast.officialId || null;
            if (!officialId) return ast;
            const keyBase = `astras_${officialId.replace(/-/g, '_')}`;
            return {
                ...ast,
                name: getText(`${keyBase}_name`, ast.name),
                description: getText(`${keyBase}_desc`, ast.description)
            };
        };

        currentAstras.forEach((ast) => {
            const displayAstra = getLocalizedAstra(ast);
            const item = astrasList.ownerDocument.createElement('div');
            item.className = `sidebar-item w-full text-left p-2.5 rounded-lg flex items-center justify-between cursor-pointer ${ast.id === activeAstrasId && !getSelectionMode() ? 'active' : ''}`;
            item.dataset.id = ast.id;
            const avatarUrl = isRenderableAstraAvatarUrl(ast.avatarUrl) ? ast.avatarUrl : null;
            const safeName = escapeHTML(displayAstra.name);
            const initials = escapeHTML(displayAstra.name.charAt(0));
            const avatarElement = `
                    <div class="astras-sidebar-avatar">
                        ${avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" class="w-full h-full object-cover rounded-full">` : initials}
                    </div>`;
            item.innerHTML = `
                    <div class="flex items-center truncate flex-1">
                        ${avatarElement}
                        <span class="truncate pr-2 text-sm">${safeName}</span>
                    </div>
                    <button class="astras-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--hover-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                `;
            let pressTimer = null;
            let touchMoved = false;
            const startPress = (event) => {
                if (runtimeWindow.innerWidth >= 768 || getSelectionMode()) return;
                touchMoved = false;
                pressTimer = setTimeoutFn(() => {
                    event.preventDefault();
                    showMobileContextMenuForAstras(ast.id);
                    pressTimer = null;
                }, 500);
            };
            const cancelPress = () => {
                clearTimeoutFn(pressTimer);
                pressTimer = null;
            };
            const handleClick = () => {
                if (pressTimer || !touchMoved) {
                    cancelPress();
                    if (getSelectionMode()) return;
                    setAstrasForConversation(ast.id);
                    toggleSidebar(false);
                }
            };
            item.addEventListener('touchstart', startPress, { passive: true });
            item.addEventListener('touchend', cancelPress);
            item.addEventListener('touchmove', () => { touchMoved = true; cancelPress(); }, { passive: true });
            item.addEventListener('mousedown', startPress);
            item.addEventListener('mouseup', cancelPress);
            item.addEventListener('mouseleave', cancelPress);
            item.addEventListener('click', handleClick);
            const optionsBtn = item.querySelector('.astras-options-btn');
            optionsBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                createAstrasMenu(ast.id, optionsBtn);
            });
            astrasList.appendChild(item);
        });

        return true;
    };

    return { renderAstras };
}
