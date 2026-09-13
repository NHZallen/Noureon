const TOKEN_SELECTOR = '.composer-inline-mode-token';
const SEPARATOR_SELECTOR = '.composer-inline-mode-separator';
const BLOCK_ELEMENTS = new Set(['DIV', 'P', 'LI']);

const isElement = (node) => node?.nodeType === 1;
const isToken = (node) => isElement(node) && node.matches(TOKEN_SELECTOR);
const isSeparator = (node) => isElement(node) && node.matches(SEPARATOR_SELECTOR);
const containsNode = (editor, node) => node === editor || Boolean(node && editor.contains(node));
const getTokenLabel = (token) => {
    const content = token.querySelector('.input-indicator-content')?.cloneNode(true);
    content?.querySelector('.input-indicator-leading')?.remove();
    return content?.textContent?.replace(/\s+/g, ' ').trim()
        || token.textContent?.replace(/\s+/g, ' ').trim()
        || '';
};
const dispatchComposerInput = (editor) => editor.dispatchEvent(
    new editor.ownerDocument.defaultView.Event('input', { bubbles: true })
);

function serializeComposerNode(node) {
    if (node?.nodeType === 3) return node.data || '';
    if (!isElement(node) || isToken(node)) return '';
    if (isSeparator(node)) return ' ';
    if (node.tagName === 'BR') return '\n';

    let value = '';
    Array.from(node.childNodes).forEach((child, index, children) => {
        const isBlock = isElement(child) && BLOCK_ELEMENTS.has(child.tagName);
        if (isBlock && value && !value.endsWith('\n')) value += '\n';
        value += serializeComposerNode(child);
        if (isBlock && index < children.length - 1 && !value.endsWith('\n')) value += '\n';
    });
    return value.replace(/\u00a0/g, ' ');
}

function serializeComposerDisplayNode(node) {
    if (isToken(node)) {
        if (node.dataset.indicatorId === 'model-council-indicator') return '';
        const icons = {
            'search-indicator': '🌐',
            'learning-mode-indicator': '📖',
            'astras-input-indicator': '✦'
        };
        const label = getTokenLabel(node);
        return `${icons[node.dataset.indicatorId] || ''}${icons[node.dataset.indicatorId] ? ' ' : ''}${label}`;
    }
    if (isSeparator(node)) return ' ';
    if (node?.nodeType === 3) return node.data || '';
    if (!isElement(node)) return '';
    if (node.tagName === 'BR') return '\n';

    let value = '';
    Array.from(node.childNodes).forEach((child, index, children) => {
        const isBlock = isElement(child) && BLOCK_ELEMENTS.has(child.tagName);
        if (isBlock && value && !value.endsWith('\n')) value += '\n';
        value += serializeComposerDisplayNode(child);
        if (isBlock && index < children.length - 1 && !value.endsWith('\n')) value += '\n';
    });
    return value.replace(/\u00a0/g, ' ');
}

function serializeComposerDisplaySegments(node, segments = []) {
    const appendText = (text) => {
        if (!text) return;
        const previous = segments.at(-1);
        if (previous?.type === 'text') previous.text += text;
        else segments.push({ type: 'text', text });
    };
    if (isToken(node)) {
        if (node.dataset.indicatorId !== 'model-council-indicator') {
            segments.push({
                type: 'mode',
                indicatorId: node.dataset.indicatorId,
                label: getTokenLabel(node)
            });
        }
        return segments;
    }
    if (isSeparator(node)) {
        appendText(' ');
        return segments;
    }
    if (node?.nodeType === 3) {
        appendText((node.data || '').replace(/\u00a0/g, ' '));
        return segments;
    }
    if (!isElement(node)) return segments;
    if (node.tagName === 'BR') {
        appendText('\n');
        return segments;
    }
    Array.from(node.childNodes).forEach((child, index, children) => {
        const isBlock = isElement(child) && BLOCK_ELEMENTS.has(child.tagName);
        const previousText = segments.at(-1)?.text || '';
        if (isBlock && segments.length && !previousText.endsWith('\n')) appendText('\n');
        serializeComposerDisplaySegments(child, segments);
        const lastText = segments.at(-1)?.text || '';
        if (isBlock && index < children.length - 1 && !lastText.endsWith('\n')) appendText('\n');
    });
    return segments;
}

function setCaret(editor, document, node, offset) {
    const selection = document.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.__composerSavedRange = range.cloneRange();
}

function saveSelection(editor, document) {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (containsNode(editor, range.startContainer) && containsNode(editor, range.endContainer)) {
        editor.__composerSavedRange = range.cloneRange();
    }
}

function getInsertionRange(editor, document) {
    const selection = document.getSelection?.();
    if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        if (containsNode(editor, range.startContainer) && containsNode(editor, range.endContainer)) {
            return range.cloneRange();
        }
    }
    const savedRange = editor.__composerSavedRange;
    if (
        savedRange
        && containsNode(editor, savedRange.startContainer)
        && containsNode(editor, savedRange.endContainer)
    ) return savedRange.cloneRange();

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
}

function insertTokenAtCaret(editor, document, token, separator) {
    const range = getInsertionRange(editor, document);
    if (range.collapsed && range.startContainer.nodeType === 3) {
        const text = range.startContainer.data || '';
        if (/\s/.test(text.charAt(range.startOffset))) {
            range.setEnd(range.startContainer, range.startOffset + 1);
        }
    } else if (range.collapsed) {
        const nextNode = range.startContainer.childNodes?.[range.startOffset];
        if (nextNode?.nodeType === 3 && /^\s/.test(nextNode.data || '')) {
            range.setEnd(nextNode, 1);
        }
    }
    range.deleteContents();
    range.insertNode(separator);
    range.insertNode(token);
    const parent = separator.parentNode;
    setCaret(editor, document, parent, Array.prototype.indexOf.call(parent.childNodes, separator) + 1);
}

function updateEditableState(editor, disabled) {
    editor.setAttribute('aria-disabled', String(disabled));
    editor.setAttribute('contenteditable', disabled ? 'false' : 'plaintext-only');
    editor.classList.toggle('is-disabled', disabled);
}

export function initializeComposerRichEditor({
    editor,
    inputIndicatorContainer,
    document = editor?.ownerDocument
} = {}) {
    if (!editor?.matches?.('[data-composer-editor]') || editor.dataset.composerReady === 'true') return false;

    const initialPlaceholder = String(editor.placeholder || editor.dataset.placeholder || '');
    let disabled = editor.getAttribute('aria-disabled') === 'true';
    Object.defineProperties(editor, {
        value: {
            configurable: true,
            get: () => serializeComposerNode(editor),
            set: (nextValue) => {
                const inlineNodes = Array.from(editor.querySelectorAll(`${TOKEN_SELECTOR}, ${SEPARATOR_SELECTOR}`));
                editor.replaceChildren(...inlineNodes);
                const text = String(nextValue ?? '');
                if (text) editor.appendChild(document.createTextNode(text));
            }
        },
        displayValue: {
            configurable: true,
            get: () => serializeComposerDisplayNode(editor)
        },
        displaySegments: {
            configurable: true,
            get: () => serializeComposerDisplaySegments(editor)
        },
        placeholder: {
            configurable: true,
            get: () => editor.dataset.placeholder || '',
            set: (value) => { editor.dataset.placeholder = String(value ?? ''); }
        },
        disabled: {
            configurable: true,
            get: () => disabled,
            set: (value) => {
                disabled = Boolean(value);
                updateEditableState(editor, disabled);
            }
        }
    });

    editor.placeholder = initialPlaceholder;
    editor.disabled = disabled;
    editor.dataset.composerReady = 'true';
    ['focus', 'keyup', 'mouseup'].forEach((eventName) => {
        editor.addEventListener(eventName, () => saveSelection(editor, document));
    });
    editor.addEventListener('input', () => {
        const onlyPlaceholderBreak = editor.childNodes.length === 1 && editor.firstChild?.tagName === 'BR';
        if (onlyPlaceholderBreak && !editor.querySelector(TOKEN_SELECTOR)) {
            editor.replaceChildren();
            setCaret(editor, document, editor, 0);
        } else {
            saveSelection(editor, document);
        }
    });
    editor.addEventListener('paste', (event) => {
        const plainText = event.clipboardData?.getData('text/plain');
        if (plainText == null) return;
        event.preventDefault();
        const range = getInsertionRange(editor, document);
        range.deleteContents();
        const textNode = document.createTextNode(plainText);
        range.insertNode(textNode);
        setCaret(editor, document, textNode, textNode.data.length);
        dispatchComposerInput(editor);
    });

    if (inputIndicatorContainer && editor.ownerDocument.defaultView.MutationObserver) {
        const syncFromIndicators = () => syncComposerInlineModeTokens({
            editor,
            inputIndicatorContainer,
            activeIndicatorIds: Array.from(inputIndicatorContainer.children)
                .filter((indicator) => indicator.matches('.input-indicator-item:not(.exit)'))
                .map((indicator) => indicator.id),
            desktop: editor.ownerDocument.defaultView.matchMedia?.('(min-width: 769px)').matches !== false,
            document
        });
        const indicatorObserver = new editor.ownerDocument.defaultView.MutationObserver(syncFromIndicators);
        indicatorObserver.observe(
            inputIndicatorContainer,
            { attributes: true, attributeFilter: ['class'], childList: true, subtree: true }
        );
        const desktopQuery = editor.ownerDocument.defaultView.matchMedia?.('(min-width: 769px)');
        desktopQuery?.addEventListener?.('change', syncFromIndicators);
        syncFromIndicators();
    }
    return true;
}

export function syncComposerInlineModeTokens({
    editor,
    inputIndicatorContainer,
    activeIndicatorIds = [],
    desktop = true,
    document = editor?.ownerDocument
} = {}) {
    if (!editor?.matches?.('[data-composer-editor]')) return false;
    const activeIds = new Set(activeIndicatorIds);
    let changed = false;

    editor.querySelectorAll(TOKEN_SELECTOR).forEach((token) => {
        if (desktop && activeIds.has(token.dataset.indicatorId)) return;
        const separator = token.nextSibling?.matches?.(SEPARATOR_SELECTOR) ? token.nextSibling : null;
        separator?.remove();
        token.remove();
        changed = true;
    });

    if (desktop) {
        activeIndicatorIds.forEach((indicatorId) => {
            const source = inputIndicatorContainer?.querySelector(`#${indicatorId} .input-indicator-content`);
            if (!source) return;
            const sourceHtml = source.innerHTML;
            const existingToken = editor.querySelector(`${TOKEN_SELECTOR}[data-indicator-id="${indicatorId}"]`);
            if (existingToken) {
                if (existingToken.dataset.sourceHtml !== sourceHtml) {
                    existingToken.replaceChildren(source.cloneNode(true));
                    existingToken.dataset.sourceHtml = sourceHtml;
                    changed = true;
                }
                return;
            }

            const token = document.createElement('span');
            token.className = 'composer-inline-mode-token';
            token.dataset.indicatorId = indicatorId;
            token.dataset.sourceHtml = sourceHtml;
            token.contentEditable = 'false';
            token.appendChild(source.cloneNode(true));

            const separator = document.createElement('span');
            separator.className = 'composer-inline-mode-separator';
            separator.contentEditable = 'false';
            separator.textContent = ' ';
            insertTokenAtCaret(editor, document, token, separator);
            changed = true;
        });
    }

    if (changed) {
        dispatchComposerInput(editor);
    }
    return changed;
}

function adjacentNode(editor, range, direction) {
    let node = range.startContainer;
    let offset = range.startOffset;
    if (node.nodeType === 3) {
        if ((direction < 0 && offset > 0) || (direction > 0 && offset < node.data.length)) return null;
    } else {
        const childIndex = direction < 0 ? offset - 1 : offset;
        if (node.childNodes[childIndex]) return node.childNodes[childIndex];
    }

    while (node && node !== editor) {
        const sibling = direction < 0 ? node.previousSibling : node.nextSibling;
        if (sibling) return sibling;
        node = node.parentNode;
    }
    return null;
}

export function removeInlineComposerTokenOnDelete({ event, editor, inputIndicatorContainer } = {}) {
    if (!event || !['Backspace', 'Delete'].includes(event.key)) return false;
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!editor?.matches?.('[data-composer-editor]')) return false;

    const selection = editor.ownerDocument.getSelection?.();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!containsNode(editor, range.startContainer)) return false;

    if (!selection.isCollapsed) {
        const selectedTokens = Array.from(editor.querySelectorAll(TOKEN_SELECTOR))
            .filter((token) => range.intersectsNode?.(token));
        if (selectedTokens.length === 0) return false;
        event.preventDefault();
        const indicatorIds = selectedTokens.map((token) => token.dataset.indicatorId);
        range.deleteContents();
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        indicatorIds.forEach((indicatorId) => inputIndicatorContainer
            ?.querySelector(`#${indicatorId} button[id^="close-"]`)
            ?.click());
        dispatchComposerInput(editor);
        return true;
    }

    const direction = event.key === 'Backspace' ? -1 : 1;
    const adjacent = adjacentNode(editor, range, direction);
    if (isSeparator(adjacent)) {
        event.preventDefault();
        const parent = adjacent.parentNode;
        const offset = Array.prototype.indexOf.call(parent.childNodes, adjacent);
        adjacent.remove();
        setCaret(editor, editor.ownerDocument, parent, Math.max(0, offset));
        dispatchComposerInput(editor);
        return true;
    }

    if (!isToken(adjacent)) return false;
    event.preventDefault();
    const indicatorId = adjacent.dataset.indicatorId;
    const parent = adjacent.parentNode;
    const offset = Array.prototype.indexOf.call(parent.childNodes, adjacent);
    if (direction > 0 && adjacent.nextSibling?.matches?.(SEPARATOR_SELECTOR)) {
        adjacent.nextSibling.remove();
    }
    adjacent.remove();
    setCaret(editor, editor.ownerDocument, parent, Math.max(0, offset));
    inputIndicatorContainer
        ?.querySelector(`#${indicatorId} button[id^="close-"]`)
        ?.click();
    dispatchComposerInput(editor);
    return true;
}
