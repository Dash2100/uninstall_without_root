// Wireless ADB connection logic

// State
let wirelessConnectionState = {
    isScanning: false,
    deviceAddress: null,
    devicePorts: [],
    bonjour: null,
    statusElement: null,
    isConnecting: false
};

// Persistent status UI
function createPersistentStatus(message) {
    const snackbar = document.createElement('mdui-snackbar');
    snackbar.className = 'wireless-status-persistent';
    snackbar.textContent = message;
    snackbar.autoClose = false;
    snackbar.closable = false;
    document.body.appendChild(snackbar);
    snackbar.open = true;

    wirelessConnectionState.statusElement = snackbar;
    return snackbar;
}

function updatePersistentStatus(statusElement, message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function removePersistentStatus(statusElement) {
    if (statusElement && statusElement.parentNode) {
        statusElement.open = false;
        setTimeout(() => {
            if (statusElement.parentNode) {
                statusElement.parentNode.removeChild(statusElement);
            }
        }, 100);
    }
    wirelessConnectionState.statusElement = null;
}

// QR code for wireless pairing
function generateWirelessQR() {
    const NAME = 'ADB_WIFI';
    const PASSWORD = '000000';
    const qrText = `WIFI:T:ADB;S:${NAME};P:${PASSWORD};;`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=20&data=${encodeURIComponent(qrText)}`;
    return qrCodeUrl;
}

// Show QR code with loading animation
function loadQRCodeWithAnimation(imgElement) {
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'qr-loading-spinner';
    loadingSpinner.innerHTML = `<mdui-circular-progress></mdui-circular-progress>`;
    loadingSpinner.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
    `;

    const container = imgElement.parentNode;
    container.style.position = 'relative';

    container.appendChild(loadingSpinner);

    imgElement.style.opacity = '0';
    imgElement.style.transition = 'opacity 0.3s ease-in';

    const newImg = new Image();
    newImg.onload = () => {
        loadingSpinner.remove();
        imgElement.src = newImg.src;
        setTimeout(() => {
            imgElement.style.opacity = '1';
        }, 10);
    };

    newImg.onerror = () => {
        loadingSpinner.innerHTML = `<mdui-icon name="error" style="font-size: 32px; color: #f44336;"></mdui-icon>`;
        setTimeout(() => {
            loadingSpinner.remove();
            imgElement.style.opacity = '1';
        }, 3000);
    };

    newImg.src = generateWirelessQR();
}

// Get IPv4 address from service info
function getIPv4Address(service) {
    if (service.addresses && service.addresses.length > 0) {
        for (let addr of service.addresses) {
            if (addr.indexOf(':') === -1) {
                return addr;
            }
        }
    }
    return null;
}

// Start wireless device scanning
async function startWirelessScanning() {
    if (wirelessConnectionState.isScanning) {
        return;
    }

    console.log('[wireless] Starting wireless scan');
    wirelessConnectionState.isScanning = true;
    wirelessConnectionState.deviceAddress = null;
    wirelessConnectionState.devicePorts = [];

    try {
        const bonjour = window.require('bonjour')();
        wirelessConnectionState.bonjour = bonjour;

        const devicePorts = [];
        let pairingServiceInfo = null;
        let connectionStarted = false;
        const discoveredServices = new Set();

        // Handle service discovery
        function onServiceChange(serviceType, service) {
            const address = getIPv4Address(service);
            if (!address) {
                console.log(`[wireless] No IPv4 address found for service`);
                return;
            }

            const serviceId = `${serviceType}:${address}:${service.port}`;
            if (discoveredServices.has(serviceId)) {
                console.log(`[wireless] Service already processed: ${serviceId}, skipping`);
                return;
            }
            discoveredServices.add(serviceId);

            console.log(`[wireless] Service change: ${serviceType} at ${address}:${service.port}`);
            console.log(`[wireless] Current device_ports:`, devicePorts);
            console.log(`[wireless] Current pairingServiceInfo:`, pairingServiceInfo);

            if (serviceType.includes('adb-tls-pairing')) {
                console.log(`[wireless] Found pairing service: ${address}:${service.port}`);

                if (connectionStarted) {
                    console.log(`[wireless] Connection already started, ignoring duplicate pairing service`);
                    return;
                }

                pairingServiceInfo = { address, port: service.port };

                if (devicePorts.length > 0) {
                    console.log(`[wireless] device_ports has ${devicePorts.length} ports, starting pairing and connection`);
                    connectionStarted = true;
                    const statusElement = createPersistentStatus(`Device found: ${address}`);
                    attemptWirelessConnection(address, service.port, devicePorts[0], statusElement);
                } else {
                    console.log(`[wireless] device_ports is empty, waiting for connect service`);
                    const statusElement = createPersistentStatus(`Device found: ${address} - waiting for connect service`);
                    wirelessConnectionState.statusElement = statusElement;
                }

            } else if (serviceType.includes('adb-tls-connect')) {
                console.log(`[wireless] Found connect service: ${address}:${service.port}`);

                if (devicePorts.includes(service.port)) {
                    console.log(`[wireless] Port ${service.port} already in device_ports, skipping`);
                    return;
                }

                console.log(`[wireless] Adding port ${service.port} to device_ports`);
                devicePorts.push(service.port);
                console.log(`[wireless] device_ports now has:`, devicePorts);
            }
        }

        // Try connection if both pairing and connect info are ready
        function startConnection() {
            if (pairingServiceInfo && devicePorts.length > 0) {
                console.log(`[wireless] Starting connection: ${pairingServiceInfo.address}:${pairingServiceInfo.port} -> ${devicePorts[0]}`);

                let statusElement = wirelessConnectionState.statusElement;
                if (!statusElement) {
                    statusElement = createPersistentStatus(`Device found: ${pairingServiceInfo.address}`);
                }

                attemptWirelessConnection(pairingServiceInfo.address, pairingServiceInfo.port, devicePorts[0], statusElement);
            }
        }

        // Service discovery for connect and pairing
        console.log('[wireless] Setting up service browsers for connect and pairing services');

        const connectTypes = ['_adb-tls-connect._tcp.local.', '_adb-tls-connect._tcp', 'adb-tls-connect'];
        connectTypes.forEach(type => {
            bonjour.find({ type: type }, (service) => {
                console.log(`[wireless] Connect service discovered via ${type}`);
                onServiceChange('adb-tls-connect', service);
            });
        });

        const pairingTypes = ['_adb-tls-pairing._tcp.local.', '_adb-tls-pairing._tcp', 'adb-tls-pairing'];
        pairingTypes.forEach(type => {
            bonjour.find({ type: type }, (service) => {
                console.log(`[wireless] Pairing service discovered via ${type}`);
                onServiceChange('adb-tls-pairing', service);
            });
        });

        // Debug: log all ADB-related services
        bonjour.find({}, (service) => {
            if (service.type && (service.type.includes('adb') || service.type.includes('debug'))) {
                console.log(`[wireless] Debug - Found ADB-related service: ${service.type} at ${getIPv4Address(service)}:${service.port}`);
            }
        });

    } catch (error) {
        console.log('[wireless] Scan failed:', error);
        if (typeof showSnackAlert === 'function') {
            showSnackAlert('Wireless scan failed');
        }
        stopWirelessScanning();
    }
}

// Try wireless pairing and connection
async function attemptWirelessConnection(address, pairingPort, connectPort, statusElement) {
    if (wirelessConnectionState.isConnecting) {
        console.log(`[wireless] Connection already in progress, ignoring duplicate attempt`);
        return;
    }

    const PASSWORD = '000000';
    console.log(`[wireless] Attempting connection: ${address} pairing:${pairingPort} connect:${connectPort}`);

    wirelessConnectionState.isConnecting = true;
    const dialogWirelessConnect = document.querySelector('.dialog-wireless-connect');
    if (dialogWirelessConnect) {
        dialogWirelessConnect.setAttribute('close-on-esc', 'false');
        dialogWirelessConnect.setAttribute('close-on-overlay-click', 'false');
    }

    try {
        updatePersistentStatus(statusElement, 'Pairing device...');
        console.log(`[wireless] Running pair command: pair ${address}:${pairingPort} ${PASSWORD}`);

        const pairResult = await runADBcommand(`pair ${address}:${pairingPort} ${PASSWORD}`);

        if (pairResult && (pairResult.includes('Successfully paired') || pairResult.includes('成功'))) {
            console.log('[wireless] Pairing successful');
            await new Promise(resolve => setTimeout(resolve, 1000));

            updatePersistentStatus(statusElement, 'Connecting device...');
            console.log(`[wireless] Running connect command: connect ${address}:${connectPort}`);

            const connectResult = await runADBcommand(`connect ${address}:${connectPort}`);

            if (connectResult && (connectResult.includes('connected to') || connectResult.includes('already connected'))) {
                console.log('[wireless] Connection successful');
                updatePersistentStatus(statusElement, 'Wireless connection successful!');

                wirelessConnectionState.isConnecting = false;
                if (dialogWirelessConnect) {
                    dialogWirelessConnect.removeAttribute('close-on-esc');
                    dialogWirelessConnect.removeAttribute('close-on-overlay-click');
                    dialogWirelessConnect.open = false;
                }
                stopWirelessScanning();

                setTimeout(() => removePersistentStatus(statusElement), 2000);

                if (typeof getDevice === 'function') {
                    await getDevice();
                }
            } else {
                throw new Error(`Connection failed: ${connectResult}`);
            }
        } else {
            throw new Error(`Pairing failed: ${pairResult}`);
        }

    } catch (error) {
        wirelessConnectionState.isConnecting = false;
        if (dialogWirelessConnect) {
            dialogWirelessConnect.removeAttribute('close-on-esc');
            dialogWirelessConnect.removeAttribute('close-on-overlay-click');
        }

        const errorMsg = error.message || error.toString();
        console.log('[wireless] Connection failed:', errorMsg);

        if (errorMsg.includes('protocol fault') || errorMsg.includes('No error')) {
            updatePersistentStatus(statusElement, 'ADB protocol error, try again or use manual connection');
        } else {
            updatePersistentStatus(statusElement, 'Wireless connection failed, please enter IP and pairing code manually');
        }

        setTimeout(() => removePersistentStatus(statusElement), 4000);
    }
}

// Restart ADB server
async function restartAdbServer() {
    try {
        await runADBcommand('kill-server');
        await runADBcommand('start-server');
        return true;
    } catch (error) {
        return false;
    }
}

// Stop wireless scanning and reset state
function stopWirelessScanning() {
    if (wirelessConnectionState.bonjour) {
        wirelessConnectionState.bonjour.destroy();
        wirelessConnectionState.bonjour = null;
    }

    if (wirelessConnectionState.statusElement) {
        removePersistentStatus(wirelessConnectionState.statusElement);
    }

    wirelessConnectionState.isScanning = false;
    wirelessConnectionState.deviceAddress = null;
    wirelessConnectionState.devicePorts = [];

    console.log('[wireless] Wireless scanning stopped and connection states reset');
}

// Setup event listeners for wireless connection dialog
function initWirelessConnection() {
    const dialogWirelessConnect = document.querySelector('.dialog-wireless-connect');
    const iconWirelessConnect = document.getElementById('icon-wireless-connect');

    if (iconWirelessConnect) {
        iconWirelessConnect.addEventListener('click', () => {
            if (typeof isConnected !== 'undefined' && isConnected) {
                if (typeof showDisconnectDialog === 'function') {
                    showDisconnectDialog(true);
                }
                return;
            }

            if (dialogWirelessConnect) {
                dialogWirelessConnect.open = true;
            }
        });
    }

    if (dialogWirelessConnect) {
        dialogWirelessConnect.addEventListener('open', () => {
            const qrImg = dialogWirelessConnect.querySelector('img');
            if (qrImg) {
                loadQRCodeWithAnimation(qrImg);
            }

            startWirelessScanning();
        });

        dialogWirelessConnect.addEventListener('close', () => {
            if (wirelessConnectionState.isConnecting) {
                return false;
            }
            stopWirelessScanning();
        });
    }

    const ipConnectButton = document.getElementById('button-connect-ip');
    if (ipConnectButton) {
        ipConnectButton.addEventListener('click', async () => {
            const ipInput = document.querySelector('.dialog-wireless-connect mdui-text-field[label="IP 位置"]');
            const codeInput = document.querySelector('.dialog-wireless-connect mdui-text-field[label="配對代碼"]');

            if (!ipInput || !codeInput) {
                if (typeof showSnackAlert === 'function') {
                    showSnackAlert('Input fields not found');
                }
                return;
            }

            const ip = ipInput.value.trim();
            const pairingCode = codeInput.value.trim();

            if (!ip || !pairingCode) {
                if (typeof showSnackAlert === 'function') {
                    showSnackAlert('Please enter IP address and pairing code');
                }
                return;
            }

            const statusElement = createPersistentStatus('Pairing device...');

            wirelessConnectionState.isConnecting = true;
            if (dialogWirelessConnect) {
                dialogWirelessConnect.setAttribute('close-on-esc', 'false');
                dialogWirelessConnect.setAttribute('close-on-overlay-click', 'false');
            }

            try {
                await runADBcommand(`pair ${ip}:${pairingCode.split(':')[1] || '5555'} ${pairingCode.split(':')[0] || pairingCode}`);
                console.log('[wireless] Manual IP pairing successful');

                updatePersistentStatus(statusElement, 'Connecting device...');
                await runADBcommand(`connect ${ip}:5555`);
                console.log('[wireless] Manual IP connection successful');

                updatePersistentStatus(statusElement, 'IP connection successful!');

                wirelessConnectionState.isConnecting = false;
                if (dialogWirelessConnect) {
                    dialogWirelessConnect.removeAttribute('close-on-esc');
                    dialogWirelessConnect.removeAttribute('close-on-overlay-click');
                    dialogWirelessConnect.open = false;
                }

                setTimeout(() => removePersistentStatus(statusElement), 2000);

                if (typeof getDevice === 'function') {
                    await getDevice();
                }

            } catch (error) {
                wirelessConnectionState.isConnecting = false;
                if (dialogWirelessConnect) {
                    dialogWirelessConnect.removeAttribute('close-on-esc');
                    dialogWirelessConnect.removeAttribute('close-on-overlay-click');
                }

                console.log('[wireless] Manual IP connection failed:', error);
                updatePersistentStatus(statusElement, 'IP connection failed, check IP and pairing code');
                setTimeout(() => removePersistentStatus(statusElement), 3000);
            }
        });
    }
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWirelessConnection);
} else {
    initWirelessConnection();
}