export function createTypewriterPlaybackController({
    text = '',
    signal = null,
    typingSpeed = 15,
    schedule = (callback) => callback(),
    getStep = ({ currentText }) => currentText.includes('```') ? 5 : 1,
    onStep = () => {},
    onFinish = () => {}
} = {}) {
    const sourceText = String(text || '');
    let currentIndex = 0;
    let isComplete = false;

    const isAborted = () => Boolean(signal?.aborted);

    const getSnapshot = () => ({
        currentIndex,
        isComplete,
        remainingText: sourceText.slice(currentIndex)
    });

    const complete = () => {
        if (isComplete) return getSnapshot();
        isComplete = true;
        onFinish({ text: sourceText, aborted: isAborted(), currentIndex });
        return getSnapshot();
    };

    const normalizeStep = (value) => {
        const step = Number(value);
        if (!Number.isFinite(step) || step <= 0) return 1;
        return Math.floor(step);
    };

    const tick = () => {
        if (isComplete) return getSnapshot();
        if (currentIndex >= sourceText.length || isAborted()) {
            return complete();
        }

        const currentText = sourceText.substring(0, currentIndex + 1);
        const step = normalizeStep(getStep({ source: sourceText, currentIndex, currentText }));
        const nextIndex = Math.min(sourceText.length, currentIndex + step);
        const chunk = sourceText.slice(currentIndex, nextIndex);
        onStep({ currentText, chunk, step, currentIndex, nextIndex, source: sourceText });
        currentIndex += step;
        schedule(tick, typingSpeed);
        return getSnapshot();
    };

    return {
        start: tick,
        tick,
        getSnapshot
    };
}
