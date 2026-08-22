const DEFAULT_PREVIEW_TIME_SECONDS = 0.1;
const MAX_POSTER_EDGE = 480;

const getPreviewTime = (duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return DEFAULT_PREVIEW_TIME_SECONDS;
    return Math.min(DEFAULT_PREVIEW_TIME_SECONDS, duration / 2);
};

export function prepareVideoThumbnail(video, { document = video?.ownerDocument } = {}) {
    if (!video || video.dataset?.videoThumbnailPrepared === 'true') return () => {};

    video.dataset.videoThumbnailPrepared = 'true';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let previewTime = null;
    let awaitingSeek = false;
    let settled = false;

    const cleanup = () => {
        video.removeEventListener('loadedmetadata', seekPreviewFrame);
        video.removeEventListener('loadeddata', revealDecodedFrame);
        video.removeEventListener('seeked', revealDecodedFrame);
        video.removeEventListener('canplay', revealDecodedFrame);
        video.removeEventListener('timeupdate', revealDecodedFrame);
        video.removeEventListener('error', revealFallback);
    };

    const revealFallback = () => {
        if (settled) return;
        settled = true;
        video.classList.add('video-thumbnail-ready');
        cleanup();
    };

    const capturePoster = () => {
        if (!document?.createElement || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            return false;
        }
        try {
            const scale = Math.min(1, MAX_POSTER_EDGE / Math.max(video.videoWidth, video.videoHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const context = canvas.getContext?.('2d');
            if (!context) return false;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const poster = canvas.toDataURL?.('image/jpeg', 0.82);
            if (!poster || poster === 'data:,') return false;
            video.poster = poster;
            return true;
        } catch {
            return false;
        }
    };

    const revealDecodedFrame = (event) => {
        if (settled || video.readyState < 2) return;
        if (awaitingSeek && event?.type !== 'seeked' && video.seeking !== false) return;
        if (previewTime !== null && Math.abs(Number(video.currentTime || 0) - previewTime) > 0.02) return;
        awaitingSeek = false;
        capturePoster();
        revealFallback();
    };

    function seekPreviewFrame() {
        if (settled) return;
        previewTime = getPreviewTime(Number(video.duration));
        if (previewTime > 0 && Math.abs(Number(video.currentTime || 0) - previewTime) > 0.02) {
            try {
                awaitingSeek = true;
                video.currentTime = previewTime;
                return;
            } catch {
                // Some browsers cannot seek until more data is decoded; loadeddata/canplay retries below.
            }
        }
        revealDecodedFrame();
    }

    video.addEventListener('loadedmetadata', seekPreviewFrame);
    video.addEventListener('loadeddata', revealDecodedFrame);
    video.addEventListener('seeked', revealDecodedFrame);
    video.addEventListener('canplay', revealDecodedFrame);
    video.addEventListener('timeupdate', revealDecodedFrame);
    video.addEventListener('error', revealFallback);

    if (video.readyState >= 1) seekPreviewFrame();
    if (!settled && video.readyState >= 2) revealDecodedFrame();

    return cleanup;
}

export function prepareVideoThumbnails(root, options) {
    root?.querySelectorAll?.('video[data-video-thumbnail]')
        .forEach(video => prepareVideoThumbnail(video, options));
}
