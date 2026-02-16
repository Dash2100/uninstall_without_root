// Wireless ADB connection logic
// Two flows:
//   1. QR Code: phone scans QR → bonjour detects service with our name "ADB_WIFI" → auto-pair with known password
//   2. Manual:  phone shows "Pair with device" → bonjour detects service → auto-fill IP:port → user enters code → connect

const QR_SERVICE_NAME = 'ADB_WIFI';
const QR_PASSWORD = '000000';

// === State ===
const wireless = {
    state: 'idle',    // 'idle' | 'scanning' | 'pairing' | 'connecting'
    bonjour: null,
    discoveredPorts: [],
    isConnecting: false,
};
window.wirelessConnectionState = wireless;

// === Status UI Helpers ===

function createPersistentStatus(message) {
    removePersistentStatus();
    const snackbar = document.createElement('mdui-snackbar');
    snackbar.className = 'wireless-status-persistent';
    snackbar.textContent = message;
    snackbar.autoClose = false;
    snackbar.closable = false;
    document.body.appendChild(snackbar);
    snackbar.open = true;
    wireless._statusElement = snackbar;
    return snackbar;
}

function updatePersistentStatus(message) {
    if (wireless._statusElement) {
        wireless._statusElement.textContent = message;
    }
}

function removePersistentStatus() {
    const el = wireless._statusElement;
    if (el && el.parentNode) {
        el.open = false;
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 100);
    }
    wireless._statusElement = null;
}

// === QR Code ===

function generateWirelessQR() {
    const qrText = `WIFI:T:ADB;S:${QR_SERVICE_NAME};P:${QR_PASSWORD};;`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=20&data=${encodeURIComponent(qrText)}`;
}

function loadQRCodeWithAnimation(imgElement) {
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'qr-loading-spinner';
    loadingSpinner.innerHTML = `<mdui-circular-progress></mdui-circular-progress>`;
    loadingSpinner.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        display: flex; align-items: center; justify-content: center; z-index: 10;
    `;
    const container = imgElement.parentNode;
    container.style.position = 'relative';
    container.appendChild(loadingSpinner);
    imgElement.style.opacity = '0';
    imgElement.style.transition = 'opacity 0.3s ease-in';

    setTimeout(() => {
        const newImg = new Image();
        newImg.onload = () => {
            loadingSpinner.remove();
            imgElement.src = newImg.src;
            setTimeout(() => { imgElement.style.opacity = '1'; }, 10);
        };
        newImg.onerror = () => {
            loadingSpinner.innerHTML = `<mdui-icon name="error" style="font-size: 32px; color: #f44336;"></mdui-icon>`;
            setTimeout(() => { loadingSpinner.remove(); imgElement.style.opacity = '1'; }, 3000);
        };
        newImg.src = generateWirelessQR();
    }, 0);
}

// === Bonjour mDNS Scanning ===

function getIPv4Address(service) {
    if (service.addresses) {
        for (const addr of service.addresses) {
            if (!addr.includes(':')) return addr;
        }
    }
    return null;
}

/**
 * Start bonjour scanning.
 * @param {function(address, port)} onQRPairingFound - Called when QR-initiated pairing service is found
 * @param {function(address, port)} onManualPairingFound - Called when manual pairing service is found
 */
function startBonjourScanning(onQRPairingFound, onManualPairingFound) {
    if (wireless.bonjour) return;

    console.log('[wireless] Starting bonjour scanning');
    wireless.state = 'scanning';
    wireless.discoveredPorts = [];

    try {
        const bonjour = window.require('bonjour')();
        wireless.bonjour = bonjour;

        const discoveredServices = new Set();

        function onService(serviceType, service) {
            // Pairing services: only process during scanning/pairing
            // Connect services: also process during 'connecting' (for port discovery)
            if (serviceType === 'pairing') {
                if (wireless.state !== 'scanning' && wireless.state !== 'pairing') return;
            } else {
                if (wireless.state === 'idle') return;
            }

            const address = getIPv4Address(service);
            if (!address) return;

            const serviceId = `${serviceType}:${address}:${service.port}`;
            if (discoveredServices.has(serviceId)) return;
            discoveredServices.add(serviceId);

            console.log(`[wireless] mDNS: ${serviceType} at ${address}:${service.port} name="${service.name || ''}"`);

            if (serviceType === 'pairing') {
                // Distinguish QR scan vs manual "Pair with device"
                // Our QR code uses service name "ADB_WIFI", so the mDNS broadcast name will contain it
                const isQRScan = service.name && service.name.includes(QR_SERVICE_NAME);
                console.log(`[wireless] Pairing source: ${isQRScan ? 'QR code' : 'manual'}`);

                if (isQRScan) {
                    onQRPairingFound(address, service.port);
                } else {
                    onManualPairingFound(address, service.port);
                }
            } else if (serviceType === 'connect') {
                if (!wireless.discoveredPorts.includes(service.port)) {
                    wireless.discoveredPorts.push(service.port);
                    console.log(`[wireless] mDNS connect port added: ${service.port}`);
                }
            }
        }

        // Search for connect services
        ['_adb-tls-connect._tcp.local.', '_adb-tls-connect._tcp', 'adb-tls-connect'].forEach(type => {
            bonjour.find({ type }, (service) => onService('connect', service));
        });

        // Search for pairing services
        ['_adb-tls-pairing._tcp.local.', '_adb-tls-pairing._tcp', 'adb-tls-pairing'].forEach(type => {
            bonjour.find({ type }, (service) => onService('pairing', service));
        });

    } catch (error) {
        console.log('[wireless] Bonjour scan failed:', error);
        showSnackAlert('無線掃描失敗');
    }
}

function stopBonjourScanning() {
    if (wireless.bonjour) {
        try { wireless.bonjour.destroy(); } catch (e) { /* ignore */ }
        wireless.bonjour = null;
    }
}

// === Port Discovery ===

function checkPort(host, port, timeout = 300) {
    const net = window.require('net');
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
    });
}

async function scanPortRange(host, startPort, endPort, excludePort, batchSize = 200) {
    for (let batch = startPort; batch <= endPort; batch += batchSize) {
        const batchEnd = Math.min(batch + batchSize - 1, endPort);
        const promises = [];
        for (let port = batch; port <= batchEnd; port++) {
            if (port === excludePort) continue;
            promises.push(checkPort(host, port).then(open => open ? port : null));
        }
        const results = await Promise.all(promises);
        const found = results.find(p => p !== null);
        if (found) return found;
    }
    return null;
}

async function discoverPortViaAdbMdns(address) {
    try {
        console.log('[wireless] Trying adb mdns services...');
        const result = await runADBcommand('mdns services', 0, true);
        if (!result) return null;
        for (const line of result.split(/\r?\n/)) {
            if (line.includes('adb-tls-connect') && line.includes(address)) {
                const match = line.match(/\s(\d{4,5})\s/);
                if (match) {
                    console.log(`[wireless] adb mdns found connect port: ${match[1]}`);
                    return parseInt(match[1]);
                }
            }
        }
    } catch (e) {
        console.log('[wireless] adb mdns services not available');
    }
    return null;
}

function waitForBonjourPort(timeoutMs = 5000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (wireless.discoveredPorts.length > 0) {
                clearInterval(interval);
                resolve(wireless.discoveredPorts[0]);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve(null);
            }
        }, 300);
    });
}

async function discoverConnectPort(address, pairingPort) {
    console.log(`[wireless] Discovering connect port for ${address} (pairing: ${pairingPort})`);

    // 1. Already discovered by bonjour?
    if (wireless.discoveredPorts.length > 0) {
        console.log(`[wireless] Using bonjour-discovered port: ${wireless.discoveredPorts[0]}`);
        return wireless.discoveredPorts[0];
    }

    // 2. Wait briefly for bonjour (if still active)
    if (wireless.bonjour) {
        console.log('[wireless] Waiting for bonjour connect port...');
        const port = await waitForBonjourPort(5000);
        if (port) return port;
    }

    // 3. Try ADB's built-in mDNS
    const mdnsPort = await discoverPortViaAdbMdns(address);
    if (mdnsPort) return mdnsPort;

    // 4. TCP port scan as last resort
    console.log('[wireless] Falling back to TCP port scan...');
    const nearStart = Math.max(30000, pairingPort - 5000);
    const nearEnd = Math.min(50000, pairingPort + 5000);

    let port = await scanPortRange(address, nearStart, nearEnd, pairingPort);
    if (port) { console.log(`[wireless] TCP scan found port: ${port}`); return port; }

    port = await scanPortRange(address, 30000, nearStart, pairingPort);
    if (port) { console.log(`[wireless] TCP scan found port: ${port}`); return port; }

    port = await scanPortRange(address, nearEnd, 50000, pairingPort);
    if (port) { console.log(`[wireless] TCP scan found port: ${port}`); return port; }

    console.log('[wireless] Port discovery failed');
    return null;
}

// === ADB Cleanup ===

async function simpleAdbCleanup() {
    try {
        await runADBcommand('disconnect', 0, true);
    } catch (e) { /* ignore */ }
}

async function restartAdbServer() {
    console.log('[wireless] Restarting ADB server...');
    try {
        try { await runADBcommand('kill-server', 0, true); } catch (e) { /* ignore */ }
        await new Promise(r => setTimeout(r, 1500));
        await runADBcommand('start-server', 0, true);
        await new Promise(r => setTimeout(r, 1000));
        await runADBcommand('version', 0, true);
        console.log('[wireless] ADB server restarted successfully');
        return true;
    } catch (error) {
        console.log('[wireless] ADB server restart failed:', error.message);
        return false;
    }
}

// === Core Connection Flow ===

async function pairAndConnect(address, pairingPort, password) {
    if (wireless.isConnecting) {
        console.log('[wireless] Connection already in progress, ignoring');
        return;
    }

    wireless.isConnecting = true;
    wireless.state = 'pairing';
    const dialog = document.querySelector('.dialog-wireless-connect');

    // Lock dialog during connection
    if (dialog) {
        dialog.closeOnEsc = false;
        dialog.closeOnOverlayClick = false;
    }

    try {
        // Step 1: Simple cleanup
        createPersistentStatus('準備配對中...');
        await simpleAdbCleanup();

        // Step 2: Pair
        updatePersistentStatus('配對中...');
        console.log(`[wireless] Pairing: ${address}:${pairingPort} password=${password}`);

        let pairResult = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                pairResult = await runADBcommand(`pair ${address}:${pairingPort} ${password}`, 0);
                if (pairResult && pairResult.includes('protocol fault')) {
                    throw new Error('protocol fault');
                }
                if (pairResult && (pairResult.includes('Successfully paired') || pairResult.includes('成功'))) {
                    break;
                }
                throw new Error(`Pairing failed: ${pairResult}`);
            } catch (err) {
                console.log(`[wireless] Pair attempt ${attempt} failed:`, err.message);
                if (err.message.includes('protocol fault') || err.message.includes('No error')) {
                    updatePersistentStatus('協定錯誤，重新啟動 ADB...');
                    const ok = await restartAdbServer();
                    if (!ok || attempt >= 2) throw new Error('ADB 協定錯誤，請重新開啟裝置的無線偵錯');
                    updatePersistentStatus('配對中...');
                    await new Promise(r => setTimeout(r, 500));
                } else {
                    throw err;
                }
            }
        }

        console.log('[wireless] Pairing successful');

        // Step 3: Close dialog, show loading in main UI
        const savedPorts = [...wireless.discoveredPorts];
        removePersistentStatus();

        if (dialog) {
            dialog.closeOnEsc = true;
            dialog.closeOnOverlayClick = true;
            dialog.open = false;
        }

        if (typeof showLoading === 'function') {
            showLoading('配對成功，正在連線到裝置...');
        }
        if (typeof toggleConnectionIcon === 'function') {
            toggleConnectionIcon(false, true);
        }

        // Restore saved ports (dialog close may have reset them)
        if (wireless.discoveredPorts.length === 0 && savedPorts.length > 0) {
            wireless.discoveredPorts = savedPorts;
        }

        // Step 4: Discover connect port (with retry)
        // Wait briefly for device to set up connect service after pairing
        wireless.state = 'connecting';
        await new Promise(r => setTimeout(r, 800));

        let connectPort = await discoverConnectPort(address, pairingPort);

        // Retry once if first attempt failed (device may need more time)
        if (!connectPort) {
            console.log('[wireless] First port discovery failed, retrying after delay...');
            if (typeof updateLoadingLabel === 'function') {
                updateLoadingLabel('正在搜尋連線端口...');
            }
            await new Promise(r => setTimeout(r, 3000));
            connectPort = await discoverConnectPort(address, pairingPort);
        }

        stopBonjourScanning();

        if (!connectPort) {
            throw new Error('無法找到連線端口，請重新開啟裝置的無線偵錯後重試');
        }

        // Step 5: Connect
        if (typeof updateLoadingLabel === 'function') {
            updateLoadingLabel('正在連線到裝置...');
        }
        console.log(`[wireless] Connecting: ${address}:${connectPort}`);
        const connectResult = await runADBcommand(`connect ${address}:${connectPort}`, 2);

        if (!connectResult || (!connectResult.includes('connected to') && !connectResult.includes('already connected'))) {
            throw new Error(`連線失敗: ${connectResult}`);
        }

        // Step 6: Verify (quick check, no long delay)
        await new Promise(r => setTimeout(r, 500));
        try {
            const devices = await runADBcommand('devices', 0, true);
            if (!devices.includes(`${address}:${connectPort}`)) {
                await runADBcommand(`connect ${address}:${connectPort}`, 1, true);
            }
        } catch (e) {
            console.log('[wireless] Verification warning:', e.message);
        }

        // Step 7: Success
        console.log('[wireless] Connection successful');
        wireless.state = 'idle';
        wireless.isConnecting = false;

        if (typeof window.handleWirelessConnection === 'function') {
            await window.handleWirelessConnection(`${address}:${connectPort}`);
        } else if (typeof getDevice === 'function') {
            await getDevice();
        }

    } catch (error) {
        console.log('[wireless] Connection failed:', error.message);
        wireless.state = 'idle';
        wireless.isConnecting = false;
        stopBonjourScanning();

        if (dialog) {
            dialog.closeOnEsc = true;
            dialog.closeOnOverlayClick = true;
        }

        removePersistentStatus();
        if (typeof toggleConnectionIcon === 'function') {
            toggleConnectionIcon(false, false);
        }
        if (typeof clearAppList === 'function') {
            clearAppList();
        }
        if (typeof showSnackAlert === 'function') {
            showSnackAlert(error.message || '無線連線失敗');
        }
    }
}

// === Full Reset ===

function resetWirelessState() {
    console.log('[wireless] Resetting wireless state');
    stopBonjourScanning();
    removePersistentStatus();
    wireless.state = 'idle';
    wireless.discoveredPorts = [];
    wireless.isConnecting = false;
}

// === Dialog & Event Initialization ===

function initWirelessConnection() {
    const dialog = document.querySelector('.dialog-wireless-connect');
    const iconWirelessConnect = document.getElementById('icon-wireless-connect');

    // Wireless icon click
    if (iconWirelessConnect) {
        iconWirelessConnect.addEventListener('click', () => {
            console.log('[wireless] Icon clicked, isConnected:', typeof isConnected !== 'undefined' ? isConnected : 'undefined');
            if (typeof isConnected !== 'undefined' && isConnected) {
                if (typeof showDisconnectDialog === 'function') {
                    showDisconnectDialog(true);
                }
                return;
            }
            if (dialog) {
                dialog.open = true;
            }
        });
    }

    if (!dialog) return;

    // Dialog open: load QR, start scanning
    dialog.addEventListener('open', () => {
        if (wireless.isConnecting) {
            console.log('[wireless] Dialog opened during connection, skipping init');
            return;
        }

        console.log('[wireless] Dialog opened');

        // Load QR code
        const qrImg = dialog.querySelector('img');
        if (qrImg) loadQRCodeWithAnimation(qrImg);

        // Clear input fields
        const ipInput = dialog.querySelector('mdui-text-field[label="IP 位置"]');
        const codeInput = dialog.querySelector('mdui-text-field[label="配對代碼"]');
        if (ipInput) ipInput.value = '';
        if (codeInput) codeInput.value = '';

        // Start bonjour scanning with two callbacks
        setTimeout(() => {
            startBonjourScanning(
                // QR code scan detected → auto-pair with known password
                (address, port) => {
                    console.log(`[wireless] QR pairing detected: ${address}:${port}, auto-pairing...`);
                    pairAndConnect(address, port, QR_PASSWORD);
                },
                // Manual "Pair with device" detected → auto-fill IP:port fields
                (address, port) => {
                    console.log(`[wireless] Manual pairing detected: ${address}:${port}, filling fields`);
                    const ipField = dialog.querySelector('mdui-text-field[label="IP 位置"]');
                    if (ipField) {
                        ipField.value = `${address}:${port}`;
                    }
                    const codeField = dialog.querySelector('mdui-text-field[label="配對代碼"]');
                    if (codeField) {
                        codeField.focus();
                    }
                    showSnackAlert(`發現裝置：${address}，請輸入配對碼`);
                }
            );
        }, 100);
    });

    // Dialog close: clean up (only if not connecting)
    dialog.addEventListener('close', () => {
        if (!wireless.isConnecting) {
            console.log('[wireless] Dialog closed, cleaning up');
            resetWirelessState();
        }
    });

    // Manual IP connect button
    const ipConnectButton = document.getElementById('button-connect-ip');
    if (ipConnectButton) {
        ipConnectButton.addEventListener('click', async () => {
            if (wireless.isConnecting) {
                console.log('[wireless] Already connecting, ignoring manual click');
                return;
            }

            const ipInput = dialog.querySelector('mdui-text-field[label="IP 位置"]');
            const codeInput = dialog.querySelector('mdui-text-field[label="配對代碼"]');

            if (!ipInput || !codeInput) {
                showSnackAlert('找不到輸入欄位');
                return;
            }

            const ip = ipInput.value.trim();
            const pairingCode = codeInput.value.trim();

            if (!ip || !pairingCode) {
                showSnackAlert('請輸入 IP 位址與配對碼');
                return;
            }

            if (!ip.includes(':')) {
                showSnackAlert('請提供完整的 IP:配對端口 格式（例如：192.168.1.100:12345）');
                return;
            }

            const [pairingIP, pairingPort] = ip.split(':');

            // Stop bonjour before connecting
            stopBonjourScanning();
            await pairAndConnect(pairingIP, parseInt(pairingPort), pairingCode);
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWirelessConnection);
} else {
    initWirelessConnection();
}
