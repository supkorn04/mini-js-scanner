/**
 * =========================================
 * FUNCTION: 
 * =========================================
 */
const codeReader = new ZXing.BrowserMultiFormatReader();
const resultText = document.getElementById('result-text');
const resultFormat = document.getElementById('result-format');
const toggleBtn = document.getElementById('toggle-btn');
let isScanning = false;

toggleBtn.addEventListener('click', async () => {
    if (isScanning) {
    codeReader.reset();
    isScanning = false;
    toggleBtn.textContent = 'Start Camera';
    return;
    }

    try {
    isScanning = true;
    toggleBtn.textContent = 'Stop Camera';

    // ZXing's built-in decodeFromConstraints manages the video track cleanly
    await codeReader.decodeFromConstraints(
        {
        video: {
            facingMode: { ideal: 'environment' }
        }
        },
        'video',
        (result, err) => {
        if (result) {
            resultText.textContent = result.getText();
            resultFormat.textContent = result.getBarcodeFormat();
            
            if (navigator.vibrate) navigator.vibrate(100);
        }
        }
    );
    } catch (err) {
    alert('Could not start camera: ' + err.message);
    isScanning = false;
    toggleBtn.textContent = 'Start Camera';
    }
});