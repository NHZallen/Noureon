export function createStreamingMarkdownRenderState() {
    let fullText = '';
    let finalizedText = '';
    let pendingText = '';
    let currentLineText = '';
    let isFinalized = false;

    const getSnapshot = () => ({
        currentLineText,
        finalizedText,
        fullText,
        isFinalized,
        pendingText
    });

    return {
        appendText(chunk = '') {
            if (isFinalized || !chunk) {
                return { ...getSnapshot(), ignored: true };
            }
            const text = String(chunk);
            fullText += text;
            pendingText += text;
            return { ...getSnapshot(), ignored: false };
        },
        flushPending({ force = false } = {}) {
            if (isFinalized) {
                return { ...getSnapshot(), didFlush: false, flushedText: '' };
            }
            let flushIndex = pendingText.lastIndexOf('\n');
            if (force && pendingText.length) {
                flushIndex = pendingText.length - 1;
            }
            if (flushIndex < 0) {
                return { ...getSnapshot(), didFlush: false, flushedText: '' };
            }

            const flushedText = pendingText.slice(0, flushIndex + 1);
            finalizedText += flushedText;
            pendingText = pendingText.slice(flushIndex + 1);
            return { ...getSnapshot(), didFlush: true, flushedText };
        },
        syncCurrentLine() {
            const nextText = String(pendingText || '');
            if (!nextText) {
                const reset = currentLineText !== '';
                currentLineText = '';
                return { appendText: '', currentLineText, reset };
            }

            const reset = !nextText.startsWith(currentLineText);
            const previousText = reset ? '' : currentLineText;
            currentLineText = nextText;
            return {
                appendText: nextText.slice(previousText.length),
                currentLineText,
                reset
            };
        },
        finalize() {
            isFinalized = true;
            return getSnapshot();
        },
        getFinalizedText() {
            return finalizedText;
        },
        getPendingText() {
            return pendingText;
        },
        getSnapshot,
        getText() {
            return fullText;
        },
        isFinalized() {
            return isFinalized;
        }
    };
}
