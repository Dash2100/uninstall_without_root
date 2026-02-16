// Connection events: device change, wireless, disconnect management

let appInitialized = false;
let _deviceChangeTimer = null;

window.handleWirelessConnection = async function (deviceId) {
    console.log('[Wireless] Handling wireless connection success for device:', deviceId);
    manuallyDisconnected = false;
    try {
        await finalizeConnection(deviceId);
    } catch (err) {
        console.error('[Wireless] Error during wireless connection finalization:', err);
    }
};

window.handleDeviceChange = function (deviceList) {
    console.log('[USB] Device change detected:', deviceList);

    if (!appInitialized) {
        console.log('[USB] Ignoring device change during app initialization');
        return;
    }
    if (isConnecting) {
        console.log('[USB] Ignoring device change while connecting');
        return;
    }
    if (typeof window.wirelessConnectionState !== 'undefined' &&
        window.wirelessConnectionState && window.wirelessConnectionState.isConnecting) {
        console.log('[USB] Ignoring device change during wireless connection process');
        return;
    }

    if (_deviceChangeTimer) clearTimeout(_deviceChangeTimer);
    _deviceChangeTimer = setTimeout(async () => {
        _deviceChangeTimer = null;
        if (manuallyDisconnected) {
            console.log('[USB] Ignoring device change after manual disconnect');
            return;
        }
        const wirelessDialog = document.querySelector('.dialog-wireless-connect');
        if (wirelessDialog && wirelessDialog.open) {
            console.log('[USB] Ignoring device change while wireless dialog is open');
            return;
        }
        await getDevice();
    }, 1200);
};

function setupUSBDeviceMonitoring() {
    console.log('[USB] Device change monitoring handler registered');
}

function confirmWarning() {
    els.dialogWarning.open = false;
    getDevice();
}

function handleConnectionClick() {
    if (isConnected) {
        showDisconnectDialog(false);
    } else {
        manuallyDisconnected = false;
        getDevice();
    }
}

function showDisconnectDialog(openWirelessAfter = false) {
    const description = document.getElementById('disconnect-description');
    const confirmBtn = document.getElementById('confirm-disconnect-btn');

    if (openWirelessAfter) {
        description.textContent = '目前已連接到設備，是否要斷開現有連接並開始無線連接？';
        confirmBtn.onclick = () => confirmDisconnectAndWireless();
    } else {
        description.textContent = '目前已連接到設備，是否要斷開現有連接？';
        confirmBtn.onclick = () => confirmDisconnect();
    }
    els.dialogDisconnectConfirm.open = true;
}

async function confirmDisconnect() {
    els.dialogDisconnectConfirm.open = false;
    if (typeof stopScrcpyMirror === 'function' && scrcpyRunning) stopScrcpyMirror();
    await executeDisconnectCommands();

    isConnected = false;
    selectedDevice = null;
    useHelperMethod = false;
    manuallyDisconnected = true;
    toggleConnectionIcon(false, false);
    clearAppList();
    if (typeof updateScrcpyUI === 'function') updateScrcpyUI();
}

async function confirmDisconnectAndWireless() {
    els.dialogDisconnectConfirm.open = false;
    if (typeof stopScrcpyMirror === 'function' && scrcpyRunning) stopScrcpyMirror();
    await executeDisconnectCommands();

    isConnected = false;
    selectedDevice = null;
    useHelperMethod = false;
    manuallyDisconnected = true;
    toggleConnectionIcon(false, false);
    clearAppList();
    if (typeof updateScrcpyUI === 'function') updateScrcpyUI();

    els.dialogWirelessConnect.open = true;
}

async function executeDisconnectCommands() {
    try {
        await runADBcommand('disconnect');
        showSnackAlert('已中斷連線目前裝置');
    } catch (error) {
        console.error('Disconnect commands failed:', error);
        showSnackAlert('中斷連線時發生錯誤');
    }
}
