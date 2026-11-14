/**
 * ====================================================================
 * Warehouse Barcode & QR Scanner Engine (app.js)
 * Frame-by-frame Canvas Decode with ZXing MultiFormatReader
 * ====================================================================
 */

// ====================================================================
// 1. GLOBAL SCANNER CONFIGURATION
// ====================================================================
const SCANNER_CONFIG = {
    allowedFormats: [
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.QR_CODE,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.CODE_39
    ],
    tryHarder: true,
    scanIntervalMs: 100,
    vibrateDurationMs: 100,
    constraints: {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    }
};

// ====================================================================
// 2. SCANNER ENGINE & HINTS INITIALIZATION
// ====================================================================
const reader = new ZXing.MultiFormatReader();
const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, SCANNER_CONFIG.allowedFormats);
hints.set(ZXing.DecodeHintType.TRY_HARDER, SCANNER_CONFIG.tryHarder);
reader.setHints(hints);

// Offscreen canvas for frame capture
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// ====================================================================
// 3. DOM ELEMENTS & STATE MANAGEMENT
// ====================================================================
const videoElement = document.getElementById('video');
const toggleBtn = document.getElementById('toggle-btn');
const resultText = document.getElementById('result-text');
const resultFormat = document.getElementById('result-format');

let stream = null;
let isScanning = false;
let scanTimer = null;

// ====================================================================
// 4. HARDWARE CAMERA CONTROLS
// ====================================================================
async function openCamera() {
    return await navigator.mediaDevices.getUserMedia(SCANNER_CONFIG.constraints);
}

function stopScanner() {
    isScanning = false;
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (videoElement) {
        videoElement.srcObject = null;
    }
    toggleBtn.textContent = 'Start Camera';
}

// ====================================================================
// 5. FRAME CAPTURE & DECODING LOOP
// ====================================================================
function scanFrame() {
    if (!isScanning) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && videoElement.videoWidth > 0) {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        try {
            const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
            const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
            const result = reader.decode(binaryBitmap);

            if (result) {
                resultText.textContent = result.getText();
                resultFormat.textContent = result.getBarcodeFormat();

                if (navigator.vibrate && SCANNER_CONFIG.vibrateDurationMs > 0) {
                    navigator.vibrate(SCANNER_CONFIG.vibrateDurationMs);
                }

                stopScanner();
                return;
            }
        } catch (err) {
            // ZXing throws when frame contains no valid barcode; continue loop
        }
    }

    scanTimer = setTimeout(scanFrame, SCANNER_CONFIG.scanIntervalMs);
}

// ====================================================================
// 6. SCANNER CONTROLLER & LIFECYCLE
// ====================================================================
async function startScanner() {
    try {
        resultText.textContent = 'Scanning...';
        resultFormat.textContent = '-';

        stream = await openCamera();
        videoElement.srcObject = stream;
        await videoElement.play();

        isScanning = true;
        toggleBtn.textContent = 'Stop Camera';
        scanFrame();
    } catch (err) {
        console.error('Camera initialization error:', err);
        alert('Cannot access camera: ' + err.message);
        stopScanner();
    }
}

toggleBtn.addEventListener('click', () => {
    if (isScanning) {
        stopScanner();
    } else {
        startScanner();
    }
});

document.addEventListener('visibilitychange', () => {
    if (isScanning && document.hidden) {
        stopScanner();
    }
});
