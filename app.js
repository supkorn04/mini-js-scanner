/**
 * ====================================================================
 * Warehouse Barcode & QR Scanner Engine (app.js)
 * Dual-Engine Architecture: Native BarcodeDetector + ZXing Fallback
 * Features Live Real-Time Diagnostic HUD
 * ====================================================================
 */

// ====================================================================
// 1. CONFIGURATION
// Purpose: Central control for scan speed, vibration feedback, and
// barcode formats enabled for the software engine fallback.
// ====================================================================
const SCANNER_CONFIG = {
    scanIntervalMs: 100,      // Delay between frame captures (~10 FPS, prevents phone overheating)
    vibrateDurationMs: 100,   // Haptic vibration duration on successful scan
    zxingFormats: [           // Formats supported by the software engine
        ZXing.BarcodeFormat.CODE_128,  // Warehouse cartons & inventory labels
        ZXing.BarcodeFormat.QR_CODE,   // 2D QR codes
        ZXing.BarcodeFormat.EAN_13,    // Retail consumer goods / bottles (13 digits)
        ZXing.BarcodeFormat.EAN_8,     // Small retail goods (8 digits)
        ZXing.BarcodeFormat.UPC_A,     // North American retail goods (12 digits)
        ZXing.BarcodeFormat.UPC_E,     // Compressed retail barcodes
        ZXing.BarcodeFormat.CODE_39,   // Industrial & automotive parts
        ZXing.BarcodeFormat.ITF        // Interleaved 2 of 5 (shipping crates)
    ]
};

// ====================================================================
// 2. DOM ELEMENTS & STATE
// Purpose: Cache UI elements once and maintain scanner session states.
// ====================================================================
// Main scanner UI elements
const video = document.getElementById('video');
const toggleBtn = document.getElementById('toggle-btn');
const resultText = document.getElementById('result-text');
const resultFormat = document.getElementById('result-format');
const engineType = document.getElementById('engine-type');

// Diagnostic HUD elements (real-time telemetry)
const hudStatus = document.getElementById('hud-status');
const hudRes = document.getElementById('hud-res');
const hudFrames = document.getElementById('hud-frames');
const hudCam = document.getElementById('hud-cam');
const hudEngine = document.getElementById('hud-engine');

// Active session state tracking
let stream = null;            // Live MediaStream object from the camera
let running = false;          // Loop flag: true while actively analyzing frames
let timerId = null;           // Holds the setTimeout handle for frame-stepping
let frameCount = 0;           // Total frames sent to decode engine
let lastFpsTime = Date.now(); // Timestamp checkpoint for 1-second FPS calculation
let fpsCounter = 0;           // Accumulator of frames in current 1-second window
let currentFps = 0;           // Calculated FPS displayed on the HUD

// ====================================================================
// 3. HUD REFRESH HELPER
// Purpose: Computes rolling FPS and updates the on-screen telemetry
// display with live camera resolution and processing speed.
// ====================================================================
function updateHUD(statusText = null, statusClass = null) {
    // 1. Update status label and color badge if requested
    if (statusText && hudStatus) {
        hudStatus.textContent = statusText;
        if (statusClass) {
            hudStatus.className = `hud-status ${statusClass}`;
        }
    }

    // 2. Display actual sensor resolution fed by the camera hardware
    if (video && video.videoWidth > 0 && hudRes) {
        hudRes.textContent = `${video.videoWidth} x ${video.videoHeight}`;
    }

    // 3. Rolling 1-second FPS calculation
    frameCount++;
    fpsCounter++;
    const now = Date.now();
    if (now - lastFpsTime >= 1000) {
        currentFps = fpsCounter;
        fpsCounter = 0;
        lastFpsTime = now;
    }

    // 4. Update frame telemetry
    if (hudFrames) {
        hudFrames.textContent = `${frameCount} frames (${currentFps} FPS)`;
    }
}

// ====================================================================
// 4. HARDWARE CAMERA HELPER (Resilient Fallback Attempts)
// Purpose: Opens the rear camera gracefully. First requests the rear
// lens (`facingMode: environment`). If rejected by the driver, falls back
// to any available camera rather than crashing.
// ====================================================================
async function openCamera() {
    const attempts = [
        // Attempt 1: Target primary rear-facing camera
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        // Attempt 2: Fallback to any camera available (e.g., PC webcam or laptop)
        { video: true, audio: false }
    ];

    let lastErr;
    for (const constraint of attempts) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraint);
        } catch (e) {
            lastErr = e; // Keep going to next attempt
        }
    }
    throw lastErr; // Both attempts failed: throw to caller
}

// ====================================================================
// 5. SCAN RESULT HANDLER (Accepts Any Digits / Any Text)
// Purpose: Triggered the moment a code is recognized. Displays output,
// delivers haptic vibration, updates telemetry, and shuts camera down.
// ====================================================================
function onScanSuccess(code, format, engine) {
    // Render result payload and barcode type
    resultText.textContent = code;
    resultFormat.textContent = format || 'Unknown';
    if (engineType) engineType.textContent = engine;

    // Update HUD to matched status (green badge)
    updateHUD('MATCHED!', 'status-matched');

    // Haptic feedback for mobile devices
    if (navigator.vibrate && SCANNER_CONFIG.vibrateDurationMs > 0) {
        navigator.vibrate(SCANNER_CONFIG.vibrateDurationMs);
    }

    // Stop scanning once barcode is acquired
    stopScanner();
}

// ====================================================================
// 6. STOP SCANNER HELPER
// Purpose: Completely cuts camera sensor power, stops background timers,
// detaches the video feed, and resets UI buttons.
// ====================================================================
function stopScanner() {
    running = false;

    // Cancel pending frame processing loop
    if (timerId) {
        clearTimeout(timerId);
        timerId = null;
    }

    // Stop all physical camera tracks to release camera hardware indicator LED
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    // Detach video stream from DOM
    if (video) {
        video.srcObject = null;
    }

    // Reset button and telemetry HUD to idle
    toggleBtn.textContent = 'Start Camera';
    updateHUD('IDLE', 'status-idle');
}

// ====================================================================
// 7. PRIMARY SCANNER ENGINE (Native BarcodeDetector -> ZXing Fallback)
// Purpose: Boots the camera, inspects browser capabilities, and chooses
// the best engine:
//   Strategy A: Native BarcodeDetector (GPU/NPU hardware accelerated)
//   Strategy B: ZXing Canvas HybridBinarizer (software image fallback)
// ====================================================================
async function startScanner() {
    try {
        // Reset states before launching camera
        stopScanner();
        frameCount = 0;
        fpsCounter = 0;
        currentFps = 0;
        lastFpsTime = Date.now();

        resultText.textContent = 'Scanning...';
        resultFormat.textContent = '-';
        updateHUD('STARTING...', 'status-starting');

        // Request camera stream and attach to video element
        stream = await openCamera();
        if (video) {
            video.srcObject = stream;
            await video.play();
        }

        // Display active camera hardware label in HUD (e.g. "Back Camera 0")
        const track = stream.getVideoTracks()[0];
        if (hudCam && track) {
            hudCam.textContent = track.label || 'Default Camera';
        }

        running = true;
        toggleBtn.textContent = 'Stop Camera';
        updateHUD('SCANNING', 'status-scanning');

        // ----------------------------------------------------------------
        // STRATEGY A: Native Hardware Acceleration (Chrome / Android)
        // Uses phone's built-in MLKit / camera hardware. Reads curved bottles,
        // computer screens, and low-contrast labels instantly without lag.
        // ----------------------------------------------------------------
        if ('BarcodeDetector' in window) {
            const engineName = 'Native BarcodeDetector (Hardware Accelerated)';
            if (engineType) engineType.textContent = engineName;
            if (hudEngine) hudEngine.textContent = 'Native BarcodeDetector';

            const detector = new BarcodeDetector();

            const tick = async () => {
                if (!running) return;
                try {
                    // Feed live video element straight into hardware chip
                    const barcodes = await detector.detect(video);
                    updateHUD();

                    if (barcodes.length > 0) {
                        onScanSuccess(barcodes[0].rawValue, barcodes[0].format, engineName);
                        return; // Exit loop on match
                    }
                } catch (e) {
                    // Ignore non-fatal frame detection hiccups
                }
                // Schedule next frame check
                timerId = setTimeout(tick, SCANNER_CONFIG.scanIntervalMs);
            };
            tick();

        // ----------------------------------------------------------------
        // STRATEGY B: ZXing HybridBinarizer Canvas Fallback (iOS Safari / Desktop)
        // Used when BarcodeDetector API is unavailable. Copies raw pixels into
        // an offscreen canvas and runs ZXing's high-contrast binarizer.
        // ----------------------------------------------------------------
        } else {
            const engineName = 'ZXing MultiFormatReader (Software)';
            if (engineType) engineType.textContent = engineName;
            if (hudEngine) hudEngine.textContent = 'ZXing HybridBinarizer';

            // Configure ZXing reader and enabled formats
            const reader = new ZXing.MultiFormatReader();
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, SCANNER_CONFIG.zxingFormats);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true); // Extra algorithmic passes for difficult 1D barcodes
            reader.setHints(hints);

            // Offscreen canvas: used to capture raw video frames into memory
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const tick = () => {
                if (!running) return;

                // Ensure video has received actual frame data from camera driver
                if (video && video.videoWidth > 0) {
                    // Match canvas dimensions 1:1 to video resolution to prevent blur
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    updateHUD();

                    try {
                        // HybridBinarizer calculates adaptive thresholds for uneven lighting
                        const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
                        const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
                        const res = reader.decode(binaryBitmap);

                        if (res) {
                            const formatName = ZXing.BarcodeFormat[res.getBarcodeFormat()] || res.getBarcodeFormat();
                            onScanSuccess(res.getText(), formatName, engineName);
                            return; // Exit loop on match
                        }
                    } catch (e) {
                        // ZXing throws NotFoundException every frame where no code is present; ignore silently
                    }
                }
                // Schedule next frame check
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
// Purpose: Handle user interaction and defensive page-visibility stops.
// ====================================================================
// Toggle camera on button tap
toggleBtn.addEventListener('click', () => {
    if (running) {
        stopScanner();
    } else {
        startScanner();
    }
});

// Auto-stop camera if user switches browser tabs or locks phone
document.addEventListener('visibilitychange', () => {
    if (running && document.hidden) {
        stopScanner();
    }
});
