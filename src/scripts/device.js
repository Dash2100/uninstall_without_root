// Device management: detection, deduplication, selection, connection

let disconnectionNotified = false;
let noDeviceNotified = false;
let _showingDeviceSelection = false;

function handleDeviceDisconnected() {
    if (disconnectionNotified || !isConnected) return;

    disconnectionNotified = true;
    isConnected = false;
    isConnecting = false;
    selectedDevice = null;
    useHelperMethod = false;
    toggleConnectionIcon(false, false);
    clearAppList();
    if (typeof updateScrcpyUI === 'function') updateScrcpyUI();
    if (typeof stopScrcpyMirror === 'function' && typeof scrcpyRunning !== 'undefined' && scrcpyRunning) stopScrcpyMirror();

    const appInfoDialogs = document.querySelectorAll('.dialog-appinfo');
    appInfoDialogs.forEach(dialog => {
        dialog.open = false;
        setTimeout(() => {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        }, 100);
    });

    showSnackAlert('與裝置的連線中斷');
    setTimeout(() => { disconnectionNotified = false; }, 3000);
}

async function getDevice() {
    if (isConnecting) return;
    isConnecting = true;

    try {
        const wasConnected = isConnected;
        const previousDevice = selectedDevice;

        const output = await runADBcommand('devices');
        if (!output.includes('List of devices attached')) {
            isConnected = false;
            clearAppList();
            toggleConnectionIcon(false, false);
            return;
        }

        const lines = output.trim().split(/\r?\n/).slice(1).filter(Boolean);
        let devices = [];
        for (const line of lines) {
            const [id, status] = line.trim().split('\t');
            if (status && status.trim() === 'device') {
                devices.push({ id, status });
            }
        }

        // Deduplicate devices (same physical device via USB/Wireless/mDNS)
        if (devices.length > 1) {
            const serialMap = new Map();
            await Promise.all(devices.map(async (device) => {
                try {
                    const serialOutput = await runADBcommand(`-s ${device.id} shell getprop ro.serialno`);
                    const serial = serialOutput ? serialOutput.trim() : null;
                    const key = serial || device.id;
                    if (!serialMap.has(key)) serialMap.set(key, []);
                    serialMap.get(key).push(device);
                } catch (e) {
                    console.warn(`[USB] Failed to get serial for ${device.id}`, e);
                    if (!serialMap.has(device.id)) serialMap.set(device.id, []);
                    serialMap.get(device.id).push(device);
                }
            }));

            const uniqueDevices = [];
            for (const [key, candidates] of serialMap.entries()) {
                if (candidates.length === 1) {
                    uniqueDevices.push(candidates[0]);
                } else {
                    const best = candidates.find(d => /^\d/.test(d.id) && !d.id.includes('_adb-tls-connect')) || candidates[0];
                    console.log(`[USB] Deduplicated ${key}: selected ${best.id} from`, candidates.map(c => c.id));
                    uniqueDevices.push(best);
                }
            }
            devices = uniqueDevices;
        }

        console.log(`[USB] getDevice: found ${devices.length} device(s)`, devices.map(d => d.id));

        if (devices.length === 0) {
            if (wasConnected) {
                handleDeviceDisconnected();
            } else {
                toggleConnectionIcon(false, false);
                clearAppList();
            }
            return;
        }

        if (devices.length === 1) {
            if (wasConnected && previousDevice === devices[0].id) {
                console.log('[USB] Already connected to sole device, skipping');
                return;
            }
            isConnected = false;
            toggleConnectionIcon(false, true);
            await finalizeConnection(devices[0].id);
            return;
        }

        console.log(`[USB] Multiple devices detected (${devices.length}), showing selection`);
        connectedDevices = devices;
        _showingDeviceSelection = true;
        await showDeviceSelectionDialog();
    } catch (err) {
        console.error('[adb] Get Device Error:', err);
        showSnackAlert('連接設備時發生錯誤');
        isConnected = false;
        clearAppList();
        toggleConnectionIcon(false, false);
    } finally {
        if (!_showingDeviceSelection) {
            isConnecting = false;
        }
    }
}

async function showDeviceSelectionDialog() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');
    menu.innerHTML = '';

    const deviceInfos = await Promise.all(connectedDevices.map(async (device) => {
        try {
            const modelOutput = await runADBcommand(`-s ${device.id} shell getprop ro.product.model`);
            return { id: device.id, model: modelOutput.trim() || '未知型號' };
        } catch (err) {
            console.error(`獲取裝置 ${device.id} 型號失敗:`, err);
            return { id: device.id, model: '未知型號' };
        }
    }));

    for (const info of deviceInfos) {
        const menuItem = document.createElement('mdui-menu-item');
        menuItem.value = info.id;
        menuItem.setAttribute('selected-icon', 'link');
        const isWireless = info.id.includes(':');
        const typeLabel = isWireless ? '無線' : 'USB';
        const currentLabel = (selectedDevice === info.id) ? ' ✓ 目前連線' : '';
        menuItem.textContent = `${info.model} (${typeLabel}: ${info.id})${currentLabel}`;
        menu.appendChild(menuItem);
    }

    menu.value = '';
    const confirmBtn = dialog.querySelector('mdui-button[slot="action"]');
    confirmBtn.onclick = () => confirmDeviceSelection();
    dialog.open = true;
}

function cancelDeviceSelection() {
    els.dialogSelectDevice.open = false;
    _showingDeviceSelection = false;
    isConnecting = false;
}

async function confirmDeviceSelection() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');
    const selectedValue = menu.value;

    if (!selectedValue) {
        cancelDeviceSelection();
        return;
    }

    dialog.open = false;
    _showingDeviceSelection = false;
    isConnecting = false;

    if (isConnected && selectedDevice === selectedValue) {
        console.log('[USB] Same device selected, keeping connection');
        return;
    }

    isConnected = false;
    toggleConnectionIcon(false, true);
    await finalizeConnection(selectedValue);
}

if (els.dialogSelectDevice) {
    els.dialogSelectDevice.addEventListener('close', () => {
        if (_showingDeviceSelection) {
            console.log('[USB] Device selection dialog closed without selection');
            _showingDeviceSelection = false;
            isConnecting = false;
        }
    });
}

async function runADBcommandWithDevice(command) {
    const fullCommand = selectedDevice && !command.startsWith('-s')
        ? `-s ${selectedDevice} ${command}`
        : command;
    return await runADBcommand(fullCommand);
}

async function pushHelperDex() {
    try {
        const checkCmd = selectedDevice
            ? `-s ${selectedDevice} shell ls /data/local/tmp/helper.dex`
            : 'shell ls /data/local/tmp/helper.dex';
        try {
            const checkResult = await runADBcommand(checkCmd, 0, true);
            if (checkResult && checkResult.includes('helper.dex') && !checkResult.includes('No such file')) {
                console.log('[Helper] DEX already exists on device, skipping push');
                return true;
            }
        } catch (e) { /* file doesn't exist, proceed with push */ }

        const dexPath = await window.getHelperDexPath();
        const exists = await window.checkFileExists(dexPath);
        if (!exists) {
            console.error('[Helper] DEX file not found at:', dexPath);
            return false;
        }

        const pushCmd = selectedDevice
            ? `-s ${selectedDevice} push "${dexPath}" /data/local/tmp/helper.dex`
            : `push "${dexPath}" /data/local/tmp/helper.dex`;

        const result = await runADBcommand(pushCmd, 0);
        console.log('[Helper] Push DEX result:', result);

        if (result && result.includes('1 file pushed')) {
            console.log('[Helper] DEX pushed successfully');
            return true;
        }
        console.warn('[Helper] DEX push result unexpected:', result);
        return false;
    } catch (err) {
        console.error('[Helper] Failed to push DEX:', err);
        return false;
    }
}

async function finalizeConnection(deviceId) {
    selectedDevice = deviceId;
    isConnected = true;
    disconnectionNotified = false;
    noDeviceNotified = false;

    toggleConnectionIcon(false, true);
    const pushSuccess = await pushHelperDex();
    useHelperMethod = pushSuccess;

    toggleConnectionIcon(true, false);
    showSnackAlert(`已連接到設備: ${selectedDevice}`);
    if (!pushSuccess) {
        showSnackAlert('Helper 推送失敗，已切換至相容模式');
    }
    await refreshAppList();
    if (typeof updateScrcpyUI === 'function') updateScrcpyUI();
}
