/**
 * ====================================================================
 * Warehouse Barcode & QR Scanner Engine (app.js)
 * Frame-by-frame Canvas Decode with Diagnostic HUD
 * ====================================================================
 */

// ====================================================================
// 1. GLOBAL SCANNER CONFIGURATION
// ====================================================================
const SCANNER_CONFIG = {
    // Leave EMPTY or set to null to enable ALL formats (EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR, Code 39, ITF, etc.)
    allowedFormats: [
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.ITF,
        ZXing.BarcodeFormat.QR_CODE
    ],
    tryHarder: true,
    scanIntervalMs: 80,
    vibrateDurationMs: 100,
    constraints: {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            // Request advanced camera features for bottle/macro barcode reading
            advanced: [
                { focusMode: 'continuous' },
                { exposureMode: 'continuous' }
            ]
        },
        audio: false
    }
};

// ====================================================================
// 2. SCANNER ENGINE & HINTS INITIALIZATION
// ====================================================================
const reader = new ZXing.MultiFormatReader();
const hints = new Map();
if (SCANNER_CONFIG.allowedFormats && SCANNER_CONFIG.allowedFormats.length > 0) {
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, SCANNER_CONFIG.allowedFormats);
}
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
let frameCount = 0;
let lastError = 'None';

// Create a visual Diagnostic HUD if not already present
let debugHud = document.getElementById('debug-hud');
if (!debugHud) {
    debugHud = document.createElement('div');
    debugHud.id = 'debug-hud';
    debugHud.style.cssText = 'margin-top:12px; padding:10px; font-family:monospace; font-size:12px; background:#1e293b; color:#38bdf8; border-radius:6px; line-height:1.5; word-break:break-all; text-align:left;';
    const card = document.querySelector('.card') || document.body;
    card.appendChild(debugHud);
}

function updateDebugHUD(extra = '') {
    if (!debugHud) return;
    const track = stream?.getVideoTracks()[0];
    const settings = track ? track.getSettings() : {};
    debugHud.innerHTML = `
        <strong>[DIAGNOSTIC HUD]</strong><br>
        • Stream: ${settings.width || 0}x${settings.height || 0} (${track?.label || 'No track'})<br>
        • Focus: ${settings.focusMode || 'default'} | Exposure: ${settings.exposureMode || 'default'}<br>
        • Frames processed: ${frameCount}<br>
        • Last Status: ${extra || lastError}<br>
        • Allowed Formats: ${SCANNER_CONFIG.allowedFormats.length} formats active
    `;
}

// ====================================================================
// 4. HARDWARE CAMERA CONTROLS
// ====================================================================
async function openCamera() {
    let activeStream = null;
    try {
        activeStream = await navigator.mediaDevices.getUserMedia(SCANNER_CONFIG.constraints);
    } catch (e) {
        console.warn('Advanced constraints failed, falling back to basic camera:', e);
        // Fallback for browsers/devices that reject advanced constraints
        activeStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
    }

    // Try applying continuous autofocus if supported by hardware
    const track = activeStream.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const constraintsToApply = {};
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            constraintsToApply.focusMode = 'continuous';
        }
        if (capabilities.torch) {
            // Torch is available if needed in the future
        }
        if (Object.keys(constraintsToApply).length > 0) {
            try {
                await track.applyConstraints({ advanced: [constraintsToApply] });
            } catch (err) {
                console.warn('Could not apply continuous focus:', err);
            }
        }
    }

    return activeStream;
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
    updateDebugHUD('Scanner Stopped');
}

// ====================================================================
// 5. FRAME CAPTURE & MULTI-STRATEGY DECODING LOOP
// ====================================================================
function scanFrame() {
    if (!isScanning) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && videoElement.videoWidth > 0) {
        frameCount++;
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        let decodedResult = null;

        // Pass 1: Standard Full-frame HybridBinarizer
        try {
            const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
            const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
            decodedResult = reader.decode(binaryBitmap);
        } catch (err) {
            lastError = err.name || 'NotFoundException';
        }

        // Pass 2: Center Crop (Crucial for curved bottles and glossy labels)
        // Focuses specifically on the center 60% where users aim the bottle
        if (!decodedResult && canvas.width > 200 && canvas.height > 200) {
            try {
                const cropW = Math.floor(canvas.width * 0.7);
                const cropH = Math.floor(canvas.height * 0.5);
                const cropX = Math.floor((canvas.width - cropW) / 2);
                const cropY = Math.floor((canvas.height - cropH) / 2);

                const centerLuminance = new ZXing.HTMLCanvasElementLuminanceSource(canvas).crop(cropX, cropY, cropW, cropH);
                const centerBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(centerLuminance));
                decodedResult = reader.decode(centerBitmap);
            } catch (err) {
                // Ignore crop attempt failure
            }
        }

        if (decodedResult) {
            const scannedText = decodedResult.getText();
            const scannedFormatName = ZXing.BarcodeFormat[decodedResult.getBarcodeFormat()] || decodedResult.getBarcodeFormat();

            resultText.textContent = scannedText;
            resultFormat.textContent = scannedFormatName;

            updateDebugHUD(`SUCCESS! Matched format: ${scannedFormatName}`);

            if (navigator.vibrate && SCANNER_CONFIG.vibrateDurationMs > 0) {
                navigator.vibrate(SCANNER_CONFIG.vibrateDurationMs);
            }

            stopScanner();
            return;
        }

        if (frameCount % 10 === 0) {
            updateDebugHUD(`Scanning active (${frameCount} frames)...`);
        }
    }

    scanTimer = setTimeout(scanFrame, SCANNER_CONFIG.scanIntervalMs);
}

// ====================================================================
// 6. SCANNER CONTROLLER & LIFECYCLE
// ====================================================================
async function startScanner() {
    try {
        frameCount = 0;
        resultText.textContent = 'Scanning...';
        resultFormat.textContent = '-';

        stream = await openCamera();
        videoElement.srcObject = stream;
        await videoElement.play();

        isScanning = true;
        toggleBtn.textContent = 'Stop Camera';
        updateDebugHUD('Camera started, scanning frames...');
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
