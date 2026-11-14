/**
 * ====================================================================
 * Warehouse Barcode & QR Scanner Engine (app.js)
 * Supported Formats: QR Code (2D), Code 128 (1D), EAN-13, etc.
 * ====================================================================
 */

// ====================================================================
// 1. Engine config & hints setup
// ====================================================================
const SCANNER_CONFIG = {
    allowedFormats: [
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.QR_CODE,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.CODE_39
    ],
    constraints: {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    }
};

const hints = new Map();
hints.set(
    ZXing.DecodeHintType.POSSIBLE_FORMATS,
    SCANNER_CONFIG.allowedFormats
);
// Try harder flag helps decode 1D barcodes with poor contrast/angles
hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

// Instantiate reader and assign hints
const codeReader = new ZXing.BrowserMultiFormatReader();
codeReader.hints = hints;

// ====================================================================
// 2. Setting DOM objects and state
// ====================================================================
const videoElement = document.getElementById('video');
const toggleBtn = document.getElementById('toggle-btn');
const resultText = document.getElementById('result-text');
const resultFormat = document.getElementById('result-format');

let isScanning = false;

// ====================================================================
// 3. Hardware stop function
// ====================================================================
function stopScanner() {
    codeReader.reset();
    isScanning = false;
    toggleBtn.textContent = 'Start Camera';    
}

// ====================================================================
// 4. Main toggle and decoding loops
// ====================================================================
toggleBtn.addEventListener('click', async () => {
    // BRANCH A: Camera is currently running -> stop
    if (isScanning) {
        stopScanner();
        return;
    }

    // BRANCH B: Toggle ON and initiate camera scanning
    try {
        isScanning = true;
        toggleBtn.textContent = 'Stop Camera';

        await codeReader.decodeFromConstraints(
            SCANNER_CONFIG.constraints,
            videoElement,
            (result, err) => {
                // Valid barcode or QR code matched
                if (result) {
                    resultText.textContent = result.getText();
                    resultFormat.textContent = result.getBarcodeFormat();
                    if (navigator.vibrate) navigator.vibrate(100);
                    stopScanner();
                }

                // Ignore expected per-frame empty read exceptions; log genuine anomalies
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.warn('Frame decode warning:', err);
                }
            }
        );

    } catch (err) {
        console.error('Camera initialization failed:', err);
        alert('Unable to access camera: ' + err.message);
        stopScanner();
    }
});

// ====================================================================
// 5. Defensive tab switch or early exit
// ====================================================================
document.addEventListener('visibilitychange', () => {
    if (isScanning && document.hidden) {
        stopScanner();
    }
});
