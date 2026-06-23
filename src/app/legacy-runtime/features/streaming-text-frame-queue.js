export function createStreamingTextFrameQueue({
    drainText = () => {},
    onFirstChunk = () => {},
    scheduleFrame = (callback) => callback(),
    waitForFrame = async () => {}
} = {}) {
    let textQueue = '';
    let isFrameRequested = false;
    let hasReceivedFirstChunk = false;

    const getSnapshot = () => ({
        hasReceivedFirstChunk,
        isFrameRequested,
        queuedText: textQueue
    });

    const drainFrame = () => {
        if (textQueue.length > 0) {
            const chunkToDrain = textQueue;
            textQueue = '';
            drainText(chunkToDrain);
        }
        isFrameRequested = false;
        return getSnapshot();
    };

    const requestFrame = () => {
        if (isFrameRequested) return false;
        isFrameRequested = true;
        scheduleFrame(drainFrame);
        return true;
    };

    return {
        enqueue(chunk = '') {
            const nextChunk = String(chunk || '');
            if (!nextChunk) {
                return { ...getSnapshot(), ignored: true, scheduledFrame: false };
            }
            if (!hasReceivedFirstChunk) {
                hasReceivedFirstChunk = true;
                onFirstChunk();
            }
            textQueue += nextChunk;
            const scheduledFrame = requestFrame();
            return { ...getSnapshot(), ignored: false, scheduledFrame };
        },
        async flushUntilIdle() {
            while (isFrameRequested || textQueue.length > 0) {
                if (!isFrameRequested) {
                    requestFrame();
                }
                await waitForFrame();
            }
            return getSnapshot();
        },
        getSnapshot
    };
}
