export async function appendRendererTextGradually(
    renderer,
    text = '',
    signal = null,
    chunkSize = 18,
    scheduleFrame = (callback) => callback()
) {
    const source = String(text || '');
    const safeChunkSize = Math.max(1, Math.floor(Number(chunkSize) || 1));

    for (let index = 0; index < source.length && !signal?.aborted; index += safeChunkSize) {
        renderer.appendText(source.slice(index, index + safeChunkSize));
        await new Promise(resolve => scheduleFrame(resolve));
    }
}
