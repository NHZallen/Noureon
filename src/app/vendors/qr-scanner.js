// Reads a QR code from the camera for P2P sharing, in place of html5-qrcode (its whole zxing bundle was 369 KB). It keeps the part
// of that library's interface the scanner lifecycle uses: new Scanner(elementId), start(camera, { fps, qrbox }, onDecoded) and stop().
// The browser's own BarcodeDetector reads the frames where there is one; elsewhere jsQR is loaded and reads them.

const MAX_FRAME_SIDE = 720;

export function createQrScannerClass({
    getDocument = () => globalThis.document,
    getNavigator = () => globalThis.navigator,
    getBarcodeDetector = () => globalThis.BarcodeDetector,
    loadDecoder = () => import('jsqr').then((module) => module.default),
    schedule = (callback, ms) => globalThis.setTimeout(callback, ms),
    cancel = (timer) => globalThis.clearTimeout(timer)
} = {}) {
    // A function reading one frame (a video element) to the text of a QR code, or null.
    const createFrameReader = async (document) => {
        const Detector = getBarcodeDetector();
        if (typeof Detector === 'function') {
            const formats = await Promise.resolve(Detector.getSupportedFormats?.()).catch(() => null);
            if (!Array.isArray(formats) || formats.includes('qr_code')) {
                const detector = new Detector({ formats: ['qr_code'] });
                return async (video) => {
                    const [code] = await detector.detect(video);
                    return code?.rawValue || null;
                };
            }
        }
        const decode = await loadDecoder();
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        return async (video) => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) return null;
            const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(width, height));
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            return decode(data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data || null;
        };
    };

    return class QrScanner {
        constructor(elementId) {
            this.elementId = elementId;
            this.running = false;
            this.stream = null;
            this.nodes = [];
            this.timer = null;
        }

        async start(camera, { fps = 10, qrbox } = {}, onDecoded) {
            if (this.running) throw new Error('The scanner is already running.');
            const document = getDocument();
            const element = document.getElementById(this.elementId);
            if (!element) throw new Error(`No element #${this.elementId} to show the camera in.`);
            this.running = true;
            const stillRunning = () => {
                if (!this.running) throw new Error('The scanner was stopped while the camera was starting.');
            };
            try {
                this.stream = await getNavigator().mediaDevices.getUserMedia({ video: camera, audio: false });
                stillRunning();
                const video = document.createElement('video');
                video.className = 'qr-scan-video';
                video.setAttribute('playsinline', '');
                video.muted = true;
                video.srcObject = this.stream;
                const box = document.createElement('div');
                box.className = 'qr-scan-box';
                if (qrbox?.width && qrbox?.height) {
                    box.style.width = `${qrbox.width}px`;
                    box.style.height = `${qrbox.height}px`;
                }
                element.classList.add('qr-scan');
                element.append(video, box);
                this.nodes = [video, box];
                await video.play();
                stillRunning();
                const readFrame = await createFrameReader(document);
                stillRunning();
                const interval = Math.max(1, Math.round(1000 / fps));
                const tick = async () => {
                    if (!this.running) return;
                    const text = await readFrame(video).catch(() => null);
                    if (!this.running) return;
                    if (text) onDecoded(text);
                    if (this.running) this.timer = schedule(tick, interval);
                };
                this.timer = schedule(tick, interval);
            } catch (error) {
                this.release();
                throw error;
            }
        }

        async stop() {
            this.release();
        }

        release() {
            this.running = false;
            if (this.timer !== null) cancel(this.timer);
            this.timer = null;
            this.stream?.getTracks().forEach((track) => track.stop());
            this.stream = null;
            this.nodes.forEach((node) => node.remove());
            this.nodes = [];
            getDocument()?.getElementById(this.elementId)?.classList.remove('qr-scan');
        }
    };
}

export const QrScanner = createQrScannerClass();
