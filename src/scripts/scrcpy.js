// Scrcpy page logic
let scrcpyRunning = false;
let scrcpyStarting = false;

// DOM references
const scrcpyEls = {
    disconnected: document.getElementById('scrcpy-disconnected'),
    connected: document.getElementById('scrcpy-connected'),
    controls: document.getElementById('scrcpy-controls'),
    statusIcon: document.getElementById('scrcpy-status-icon'),
    statusText: document.getElementById('scrcpy-status-text'),
    deviceName: document.getElementById('scrcpy-device-name'),
    toggleBtn: document.getElementById('btn-scrcpy-toggle')
};

// Update scrcpy page UI based on connection state
function updateScrcpyUI() {
    const connected = !!selectedDevice;
    scrcpyEls.disconnected.classList.toggle('hidden', connected);
    scrcpyEls.connected.classList.toggle('hidden', !connected);

    if (connected) {
        scrcpyEls.deviceName.textContent = selectedDevice;
    }
}

// Toggle scrcpy start/stop
async function toggleScrcpy() {
    if (scrcpyRunning) {
        await stopScrcpyMirror();
    } else {
        await startScrcpyMirror();
    }
}

// Start scrcpy mirroring
async function startScrcpyMirror() {
    if (!selectedDevice) {
        showSnackAlert('請先連接裝置');
        return;
    }
    if (scrcpyStarting) return;
    scrcpyStarting = true;

    scrcpyEls.toggleBtn.loading = true;
    scrcpyEls.toggleBtn.disabled = true;
    scrcpyEls.statusText.textContent = '正在啟動...';

    try {
        const result = await window.startScrcpy(selectedDevice);
        if (result.success) {
            scrcpyRunning = true;
            scrcpyEls.statusText.textContent = '鏡像中';
            scrcpyEls.statusIcon.name = 'cast_connected';
            scrcpyEls.toggleBtn.textContent = '停止鏡像';
            scrcpyEls.toggleBtn.variant = 'outlined';
            scrcpyEls.controls.style.display = '';
        } else {
            scrcpyEls.statusText.textContent = '啟動失敗';
            showSnackAlert('Scrcpy 啟動失敗: ' + (result.error || '未知錯誤'));
        }
    } catch (err) {
        scrcpyEls.statusText.textContent = '啟動失敗';
        showSnackAlert('Scrcpy 錯誤: ' + err.message);
    } finally {
        scrcpyStarting = false;
        scrcpyEls.toggleBtn.loading = false;
        scrcpyEls.toggleBtn.disabled = false;
    }
}

// Stop scrcpy mirroring
async function stopScrcpyMirror() {
    try {
        await window.stopScrcpy();
    } catch (err) {
        console.log('[Scrcpy] Stop error:', err);
    }
    resetScrcpyState();
}

// Reset scrcpy UI state
function resetScrcpyState() {
    scrcpyRunning = false;
    scrcpyEls.statusText.textContent = '準備就緒';
    scrcpyEls.statusIcon.name = 'cast';
    scrcpyEls.toggleBtn.textContent = '啟動鏡像';
    scrcpyEls.toggleBtn.variant = 'tonal';
    scrcpyEls.controls.style.display = 'none';
}

// Send key event to device
async function sendKey(keycode) {
    if (!selectedDevice) return;
    try {
        await runADBcommand(`-s ${selectedDevice} shell input keyevent ${keycode}`);
    } catch (err) {
        console.log('[Scrcpy] sendKey error:', err);
    }
}

// Called from integration.js when scrcpy process exits
window.onScrcpyStopped = function () {
    if (scrcpyRunning) {
        scrcpyRunning = false;
        resetScrcpyState();
        showSnackAlert('Scrcpy 已停止');
    }
};

// Update scrcpy UI when page becomes active
window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        if (pages.scrcpy && pages.scrcpy.classList.contains('active')) {
            updateScrcpyUI();
        }
    });
    observer.observe(pages.scrcpy, { attributes: true, attributeFilter: ['class'] });
});
