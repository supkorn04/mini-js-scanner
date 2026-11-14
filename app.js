/**
 * ====================================================================
 * Warehouse Barcode & QR Scanner Engine (app.js)
 * Supported Formats: QR Code (2D) & Code 128 (1D)
 * ====================================================================
 */

// ====================================================================
// 1. Engine config & hints setup
// ====================================================================
const SCANNER_CONFIG = {
    allowedFormats: [
        ZXing.BarcodeFormat.CODE_128
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

// Instantiate the reader engine once
const codeReader = new ZXing.BrowserMultiFormatReader(hints);

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
    // BRANCH A: Camera is opening
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
                    stopScanner();
                }

                // Ignore expected per-frame empty read exceptions; log genuine anomalies
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Frame decode error:', err);
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