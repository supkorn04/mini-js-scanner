/**
 * ====================================================================
 * Warehouse Barcode & QR Scanner Engine (app.js)
 * Dual-Engine Architecture: Native BarcodeDetector + ZXing Fallback
 * Features Live Real-Time Diagnostic HUD
 * ====================================================================
 */

// ====================================================================
// 1. CONFIGURATION
// ====================================================================
const SCANNER_CONFIG = {
    scanIntervalMs: 100,
    vibrateDurationMs: 100,
    zxingFormats: [
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.QR_CODE,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.ITF
    ]
};

// ====================================================================
// 2. DOM ELEMENTS & STATE
// ====================================================================
const video = document.getElementById('video');
const toggleBtn = document.getElementById('toggle-btn');
const resultText = document.getElementById('result-text');
const resultFormat = document.getElementById('result-format');
const engineType = document.getElementById('engine-type');

// HUD Elements
const hudStatus = document.getElementById('hud-status');
const hudRes = document.getElementById('hud-res');
const hudFrames = document.getElementById('hud-frames');
const hudCam = document.getElementById('hud-cam');
const hudEngine = document.getElementById('hud-engine');

let stream = null;
let running = false;
let timerId = null;
let frameCount = 0;
let lastFpsTime = Date.now();
let fpsCounter = 0;
let currentFps = 0;

// ====================================================================
// 3. HUD REFRESH HELPER
// ====================================================================
function updateHUD(statusText = null, statusClass = null) {
    if (statusText && hudStatus) {
        hudStatus.textContent = statusText;
        if (statusClass) {
            hudStatus.className = `hud-status ${statusClass}`;
        }
    }

    if (video && video.videoWidth > 0 && hudRes) {
        hudRes.textContent = `${video.videoWidth} x ${video.videoHeight}`;
    }

    // Calculate rolling FPS
    frameCount++;
    fpsCounter++;
    const now = Date.now();
    if (now - lastFpsTime >= 1000) {
        currentFps = fpsCounter;
        fpsCounter = 0;
        lastFpsTime = now;
    }

    if (hudFrames) {
        hudFrames.textContent = `${frameCount} frames (${currentFps} FPS)`;
    }
}

// ====================================================================
// 4. HARDWARE CAMERA HELPER (Resilient Fallback Attempts)
// ====================================================================
async function openCamera() {
    const attempts = [
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        { video: true, audio: false }
    ];
    let lastErr;
    for (const constraint of attempts) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraint);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

// ====================================================================
// 5. SCAN RESULT HANDLER (Accepts Any Digits / Any Text)
// ====================================================================
function onScanSuccess(code, format, engine) {
    resultText.textContent = code;
    resultFormat.textContent = format || 'Unknown';
    if (engineType) engineType.textContent = engine;

    updateHUD('MATCHED!', 'status-matched');

    if (navigator.vibrate && SCANNER_CONFIG.vibrateDurationMs > 0) {
        navigator.vibrate(SCANNER_CONFIG.vibrateDurationMs);
    }

    stopScanner();
}

// ====================================================================
// 6. STOP SCANNER HELPER
// ====================================================================
function stopScanner() {
    running = false;
    if (timerId) {
        clearTimeout(timerId);
        timerId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (video) {
        video.srcObject = null;
    }
    toggleBtn.textContent = 'Start Camera';
    updateHUD('IDLE', 'status-idle');
}

// ====================================================================
// 7. PRIMARY SCANNER ENGINE (Native BarcodeDetector -> ZXing Fallback)
// ====================================================================
async function startScanner() {
    try {
        stopScanner();
        frameCount = 0;
        fpsCounter = 0;
        currentFps = 0;
        lastFpsTime = Date.now();

        resultText.textContent = 'Scanning...';
        resultFormat.textContent = '-';
        updateHUD('STARTING...', 'status-starting');

        stream = await openCamera();
        if (video) {
            video.srcObject = stream;
            await video.play();
        }

        // Show camera device label in HUD
        const track = stream.getVideoTracks()[0];
        if (hudCam && track) {
            hudCam.textContent = track.label || 'Default Camera';
        }

        running = true;
        toggleBtn.textContent = 'Stop Camera';
        updateHUD('SCANNING', 'status-scanning');

        // STRATEGY A: Native Hardware Acceleration (Fastest on Mobile Chrome / Android)
        if ('BarcodeDetector' in window) {
            const engineName = 'Native BarcodeDetector (Hardware Accelerated)';
            if (engineType) engineType.textContent = engineName;
            if (hudEngine) hudEngine.textContent = 'Native BarcodeDetector';

            const detector = new BarcodeDetector();

            const tick = async () => {
                if (!running) return;
                try {
                    const barcodes = await detector.detect(video);
                    updateHUD();
                    if (barcodes.length > 0) {
                        onScanSuccess(barcodes[0].rawValue, barcodes[0].format, engineName);
                        return;
                    }
                } catch (e) {
                    // Frame detection error, continue to next frame
                }
                timerId = setTimeout(tick, SCANNER_CONFIG.scanIntervalMs);
            };
            tick();

        // STRATEGY B: ZXing Canvas HybridBinarizer (Universal Fallback for iOS Safari / Desktop)
        } else {
            const engineName = 'ZXing MultiFormatReader (Software)';
            if (engineType) engineType.textContent = engineName;
            if (hudEngine) hudEngine.textContent = 'ZXing HybridBinarizer';

            const reader = new ZXing.MultiFormatReader();
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, SCANNER_CONFIG.zxingFormats);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            reader.setHints(hints);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const tick = () => {
                if (!running) return;
                if (video && video.videoWidth > 0) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    updateHUD();

                    try {
                        const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
                        const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
                        const res = reader.decode(binaryBitmap);

                        if (res) {
                            const formatName = ZXing.BarcodeFormat[res.getBarcodeFormat()] || res.getBarcodeFormat();
                            onScanSuccess(res.getText(), formatName, engineName);
                            return;
                        }
                    } catch (e) {
                        // Frame decode error (no barcode found in frame), continue silently
                    }
                }
                timerId = setTimeout(tick, SCANNER_CONFIG.scanIntervalMs);
            };
            tick();
        }

    } catch (err) {
        console.error('Camera access failed:', err);
        updateHUD('ERROR', 'status-error');
        alert('Cannot access camera: ' + err.message);
        stopScanner();
    }
}

// ====================================================================
// 8. EVENT LISTENERS
// ====================================================================
toggleBtn.addEventListener('click', () => {
    if (running) {
        stopScanner();
    } else {
        startScanner();
    }
});

document.addEventListener('visibilitychange', () => {
    if (running && document.hidden) {
        stopScanner();
    }
});
