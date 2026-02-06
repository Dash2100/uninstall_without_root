// Wireless ADB connection logic

// Connection state management with enhanced tracking
let wirelessConnectionState = {
    isScanning: false,
    deviceAddress: null,
    devicePorts: [],
    bonjour: null,
    statusElement: null,
    isConnecting: false,
    waitingTimeout: null,
    lastHealthCheck: null,
    protocolFaultCount: 0,
    connectionAttempts: 0,
    maxConnectionAttempts: 3
};

window.wirelessConnectionState = wirelessConnectionState;

// 恢復 dialog 的原始關閉行為
function restoreDialogCloseAttributes(dialog) {
    if (dialog) {
        const originalEsc = dialog.getAttribute('data-original-close-on-esc');
        const originalOverlay = dialog.getAttribute('data-original-close-on-overlay-click');
        
        if (originalEsc) {
            if (originalEsc === 'true') {
                dialog.setAttribute('close-on-esc', 'true');
            } else {
                dialog.removeAttribute('close-on-esc');
            }
            dialog.removeAttribute('data-original-close-on-esc');
        }
        
        if (originalOverlay) {
            if (originalOverlay === 'true') {
                dialog.setAttribute('close-on-overlay-click', 'true');
            } else {
                dialog.removeAttribute('close-on-overlay-click');
            }
            dialog.removeAttribute('data-original-close-on-overlay-click');
        }
    }
}

// Create persistent status notification
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

// Generate QR code for wireless pairing
function generateWirelessQR() {
    const NAME = 'ADB_WIFI';
    const PASSWORD = '000000';
    const qrText = `WIFI:T:ADB;S:${NAME};P:${PASSWORD};;`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=20&data=${encodeURIComponent(qrText)}`;
    return qrCodeUrl;
}

// Show QR code with loading spinner
function loadQRCodeWithAnimation(imgElement) {
    // 立即顯示載入動畫，不阻塞 UI
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

    // 非阻塞方式加載 QR 碼
    setTimeout(() => {
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
    }, 0);
}



// Extract IPv4 address from service info
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

// Start scanning for wireless devices
async function startWirelessScanning() {
    if (wirelessConnectionState.isScanning) {
        return;
    }

    console.log('[wireless] Starting wireless scan');
    wirelessConnectionState.isScanning = true;
    wirelessConnectionState.deviceAddress = null;
    wirelessConnectionState.devicePorts = [];

    // 使用 setTimeout 來異步初始化，避免阻塞 UI
    setTimeout(() => {
        try {
            const bonjour = window.require('bonjour')();
            wirelessConnectionState.bonjour = bonjour;

            const devicePorts = [];
            let pairingServiceInfo = null;
            let connectionStarted = false;
            const discoveredServices = new Set();
            let waitingTimeout = null;

        // Process discovered services
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
                    const statusElement = createPersistentStatus(`發現裝置：${address}`);
                    attemptWirelessConnection(address, service.port, devicePorts[0], statusElement);
                } else {
                    console.log(`[wireless] device_ports is empty, waiting for connect service`);
                    const statusElement = createPersistentStatus(`發現裝置：${address} - 等待連線服務`);
                    wirelessConnectionState.statusElement = statusElement;
                    
                    // 設置等待連線服務的超時
                    wirelessConnectionState.waitingTimeout = setTimeout(() => {
                        console.log('[wireless] Waiting for connect service timed out, suggesting restart');
                        if (wirelessConnectionState.statusElement) {
                            updatePersistentStatus(wirelessConnectionState.statusElement, '等待連線服務逾時，請重新開啟裝置的無線偵錯');
                            
                            // 10秒後清除提示
                            setTimeout(() => {
                                if (wirelessConnectionState.statusElement) {
                                    removePersistentStatus(wirelessConnectionState.statusElement);
                                }
                            }, 10000);
                        }
                        wirelessConnectionState.waitingTimeout = null;
                    }, 15000); // 15秒超時
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

                // 關鍵修復：當 connect 服務被發現時，檢查是否可以開始連線
                if (pairingServiceInfo && !connectionStarted) {
                    console.log(`[wireless] Both pairing and connect services are now available, starting connection`);
                    connectionStarted = true;
                    
                    // 清除等待超時
                    if (wirelessConnectionState.waitingTimeout) {
                        clearTimeout(wirelessConnectionState.waitingTimeout);
                        wirelessConnectionState.waitingTimeout = null;
                    }
                    
                    // 更新現有的狀態提示
                    if (wirelessConnectionState.statusElement) {
                        updatePersistentStatus(wirelessConnectionState.statusElement, `發現裝置：${pairingServiceInfo.address} - 開始連線`);
                    }
                    
                    attemptWirelessConnection(pairingServiceInfo.address, pairingServiceInfo.port, service.port, wirelessConnectionState.statusElement || createPersistentStatus(`發現裝置：${pairingServiceInfo.address}`));
                }
            }
        }

        // Start connection when both services ready
        function startConnection() {
            if (pairingServiceInfo && devicePorts.length > 0) {
                console.log(`[wireless] Starting connection: ${pairingServiceInfo.address}:${pairingServiceInfo.port} -> ${devicePorts[0]}`);

                let statusElement = wirelessConnectionState.statusElement;
                if (!statusElement) {
                    statusElement = createPersistentStatus(`發現裝置：${pairingServiceInfo.address}`);
                }

                attemptWirelessConnection(pairingServiceInfo.address, pairingServiceInfo.port, devicePorts[0], statusElement);
            }
        }

        // Setup service discovery browsers
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

        // Debug log all ADB services
        bonjour.find({}, (service) => {
            if (service.type && (service.type.includes('adb') || service.type.includes('debug'))) {
                console.log(`[wireless] Debug - Found ADB-related service: ${service.type} at ${getIPv4Address(service)}:${service.port}`);
            }
        });

        } catch (error) {
            console.log('[wireless] Scan failed:', error);
            if (typeof showSnackAlert === 'function') {
                showSnackAlert('無線掃描失敗');
            }
            stopWirelessScanning();
        }
    }, 50); // 50ms 延遲，足以讓 dialog 先顯示
}

// Attempt wireless pairing and connection
async function attemptWirelessConnection(address, pairingPort, connectPort, statusElement) {
    if (wirelessConnectionState.isConnecting) {
        console.log(`[wireless] Connection already in progress, ignoring duplicate attempt`);
        return;
    }

    // 檢查連線嘗試次數
    wirelessConnectionState.connectionAttempts++;
    if (wirelessConnectionState.connectionAttempts > wirelessConnectionState.maxConnectionAttempts) {
        console.log(`[wireless] Maximum connection attempts (${wirelessConnectionState.maxConnectionAttempts}) exceeded`);
        updatePersistentStatus(statusElement, '連線嘗試次數過多，請重新開啟無線偵錯並重試');
        setTimeout(() => {
            removePersistentStatus(statusElement);
            resetWirelessConnectionState();
        }, 3000);
        return;
    }

    const PASSWORD = '000000';
    console.log(`[wireless] Attempting connection ${wirelessConnectionState.connectionAttempts}/${wirelessConnectionState.maxConnectionAttempts}: ${address} pairing:${pairingPort} connect:${connectPort}`);

    wirelessConnectionState.isConnecting = true;
    const dialogWirelessConnect = document.querySelector('.dialog-wireless-connect');
    if (dialogWirelessConnect) {
        // 儲存原始屬性值以便稍後恢復
        if (!dialogWirelessConnect.hasAttribute('data-original-close-on-esc')) {
            dialogWirelessConnect.setAttribute('data-original-close-on-esc', dialogWirelessConnect.getAttribute('close-on-esc') || 'true');
        }
        if (!dialogWirelessConnect.hasAttribute('data-original-close-on-overlay-click')) {
            dialogWirelessConnect.setAttribute('data-original-close-on-overlay-click', dialogWirelessConnect.getAttribute('close-on-overlay-click') || 'true');
        }
        
        dialogWirelessConnect.setAttribute('close-on-esc', 'false');
        dialogWirelessConnect.setAttribute('close-on-overlay-click', 'false');
    }

    try {
        // Enhanced preventive cleanup before pairing
        updatePersistentStatus(statusElement, '準備配對中...');
        console.log('[wireless] Performing enhanced preventive cleanup before pairing');

        try {
            await proactiveAdbCleanup();
        } catch (cleanupError) {
            console.log('[wireless] Proactive cleanup failed, attempting basic cleanup');
            try {
                await runADBcommand('disconnect', 0, true);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (basicCleanupError) {
                console.log('[wireless] Basic cleanup completed (error expected)');
            }
        }

        updatePersistentStatus(statusElement, '配對中...');
        console.log(`[wireless] Running pair command: pair ${address}:${pairingPort} ${PASSWORD}`);

        // Implement robust pairing with protocol error detection
        let pairResult = null;
        let pairAttempts = 0;
        const maxPairAttempts = 3;

        while (!pairResult && pairAttempts < maxPairAttempts) {
            try {
                pairAttempts++;
                console.log(`[wireless] Pairing attempt ${pairAttempts}/${maxPairAttempts}`);
                
                pairResult = await runADBcommand(`pair ${address}:${pairingPort} ${PASSWORD}`, 0);
                
                // Check for protocol fault specifically
                if (pairResult && pairResult.includes('protocol fault')) {
                    throw new Error('Protocol fault detected');
                }
                
                break; // Success
            } catch (pairError) {
                console.log(`[wireless] Pairing attempt ${pairAttempts} failed:`, pairError.message);
                
                if (pairError.message.includes('protocol fault') || pairError.message.includes('No error')) {
                    wirelessConnectionState.protocolFaultCount++;
                    console.log(`[wireless] Protocol fault detected (count: ${wirelessConnectionState.protocolFaultCount}), performing emergency reset...`);
                    updatePersistentStatus(statusElement, `協定錯誤 (#${wirelessConnectionState.protocolFaultCount}) - 重置中...`);
                    
                    const resetSuccess = await immediateProtocolRepair();
                    if (resetSuccess) {
                        console.log('[wireless] Emergency reset successful, retrying...');
                        updatePersistentStatus(statusElement, '配對中...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw new Error('Emergency ADB reset failed');
                    }
                } else if (pairAttempts >= maxPairAttempts) {
                    throw pairError;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (pairResult && (pairResult.includes('Successfully paired') || pairResult.includes('成功'))) {
            console.log('[wireless] Pairing successful');
            await new Promise(resolve => setTimeout(resolve, 1000));

            updatePersistentStatus(statusElement, '連線中...');
            console.log(`[wireless] Running connect command: connect ${address}:${connectPort}`);

            const connectResult = await runADBcommand(`connect ${address}:${connectPort}`, 2);

            if (connectResult && (connectResult.includes('connected to') || connectResult.includes('already connected'))) {
                console.log('[wireless] Connection successful');

                // Wait for device to be properly recognized
                updatePersistentStatus(statusElement, '驗證裝置連線...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Verify device connection
                try {
                    const devicesResult = await runADBcommand('devices', 1, true);
                    if (!devicesResult.includes(`${address}:${connectPort}`)) {
                        console.log('[wireless] Device verification failed, retrying connection...');
                        await runADBcommand(`connect ${address}:${connectPort}`, 1, true);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (verifyError) {
                    console.log('[wireless] Device verification error:', verifyError);
                }

                updatePersistentStatus(statusElement, '無線連線成功！');

                // 重置錯誤計數，連線成功
                wirelessConnectionState.protocolFaultCount = 0;
                wirelessConnectionState.connectionAttempts = 0;
                wirelessConnectionState.isConnecting = false;
                
                if (dialogWirelessConnect) {
                    restoreDialogCloseAttributes(dialogWirelessConnect);
                    dialogWirelessConnect.open = false;
                }
                stopWirelessScanning();

                setTimeout(() => removePersistentStatus(statusElement), 2000);

                if (typeof window.handleWirelessConnection === 'function') {
                    await window.handleWirelessConnection(`${address}:${connectPort}`);
                } else if (typeof getDevice === 'function') {
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
            restoreDialogCloseAttributes(dialogWirelessConnect);
        }

        const errorMsg = error.message || error.toString();
        console.log('[wireless] Connection failed:', errorMsg);

        if (errorMsg.includes('protocol fault') || errorMsg.includes('No error')) {
            updatePersistentStatus(statusElement, 'ADB 協定錯誤，正在清理連線...');

            // Show toast notification
            if (typeof showSnackAlert === 'function') {
                showSnackAlert('偵測到 ADB 協定錯誤，正在重置連線');
            }

            // Complete ADB reset procedure
            const resetSuccess = await completeAdbReset();
            if (resetSuccess) {
                updatePersistentStatus(statusElement, 'ADB 已重置，請重新嘗試連線');
                // Show success toast
                if (typeof showSnackAlert === 'function') {
                    showSnackAlert('ADB 伺服器已重置完成');
                }
                // Restart device tracking if available
                if (typeof window.startDeviceTracking === 'function') {
                    setTimeout(() => window.startDeviceTracking(), 1000);
                }
            } else {
                updatePersistentStatus(statusElement, 'ADB 重置失敗，請重啟應用程式');
                if (typeof showSnackAlert === 'function') {
                    showSnackAlert('ADB 重置失敗，請手動重啟應用程式');
                }
            }
        } else if (errorMsg.includes('failed to authenticate')) {
            updatePersistentStatus(statusElement, '配對碼錯誤，請檢查配對碼');
        } else {
            updatePersistentStatus(statusElement, '無線連線失敗，請手動輸入 IP 與配對碼');
        }

        setTimeout(() => removePersistentStatus(statusElement), 4000);
    }
}

// Restart ADB server to fix protocol issues
async function restartAdbServer() {
    try {
        await runADBcommand('kill-server', 0, true);
        await runADBcommand('start-server', 2, true);
        return true;
    } catch (error) {
        return false;
    }
}

// Enhanced ADB reset with protocol error handling
async function enhancedAdbReset() {
    try {
        console.log('[wireless] Starting enhanced ADB reset...');

        // Step 1: Force disconnect all devices multiple times
        for (let i = 0; i < 3; i++) {
            try {
                await runADBcommand('disconnect', 0, true);
                console.log(`[wireless] Disconnect attempt ${i + 1} completed`);
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (disconnectError) {
                console.log(`[wireless] Disconnect attempt ${i + 1} failed (expected):`, disconnectError.message);
            }
        }

        // Step 2: Multiple kill-server attempts
        for (let i = 0; i < 2; i++) {
            try {
                await runADBcommand('kill-server', 0, true);
                console.log(`[wireless] ADB server kill attempt ${i + 1} completed`);
                await new Promise(resolve => setTimeout(resolve, 800));
            } catch (killError) {
                console.log(`[wireless] Kill-server attempt ${i + 1} failed:`, killError.message);
            }
        }

        // Step 3: Wait for complete server shutdown
        console.log('[wireless] Waiting for ADB server shutdown...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 4: Verify server is down and restart
        let restartAttempts = 0;
        let serverStarted = false;
        
        while (!serverStarted && restartAttempts < 3) {
            try {
                console.log(`[wireless] ADB server restart attempt ${restartAttempts + 1}`);
                await runADBcommand('start-server', 0, true);
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Verify server is working
                await runADBcommand('version', 0, true);
                serverStarted = true;
                console.log('[wireless] ADB server restart verified');
            } catch (startError) {
                restartAttempts++;
                console.log(`[wireless] Server restart attempt ${restartAttempts} failed:`, startError.message);
                if (restartAttempts < 3) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        if (!serverStarted) {
            throw new Error('Failed to restart ADB server after multiple attempts');
        }

        // Step 5: Final initialization wait
        console.log('[wireless] Waiting for ADB server initialization...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('[wireless] Enhanced ADB reset successful');
        return true;
    } catch (error) {
        console.log('[wireless] Enhanced ADB reset failed:', error);
        return false;
    }
}

// Legacy function for backward compatibility
async function completeAdbReset() {
    return enhancedAdbReset();
}

// 立即修復protocol fault錯誤的專用函數
async function immediateProtocolRepair() {
    console.log('[wireless] Starting immediate protocol fault repair...');
    try {
        // 強制終止所有ADB進程
        console.log('[wireless] Force killing all ADB processes...');
        
        // 多次嘗試kill-server確保清理乾淨
        for (let i = 0; i < 3; i++) {
            try {
                await runADBcommand('kill-server', 0, true);
                console.log(`[wireless] Kill-server attempt ${i + 1} completed`);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (killError) {
                console.log(`[wireless] Kill-server attempt ${i + 1} failed (expected):`, killError.message);
            }
        }
        
        // 等待進程完全終止
        console.log('[wireless] Waiting for ADB processes to terminate completely...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 重新啟動ADB server
        console.log('[wireless] Restarting ADB server...');
        let restartSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await runADBcommand('start-server', 0, true);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 驗證server是否正常工作
                const testResult = await runADBcommand('version', 0, true);
                if (testResult && !testResult.includes('protocol fault') && !testResult.includes('No error')) {
                    restartSuccess = true;
                    console.log('[wireless] ADB server restart verified successfully');
                    break;
                }
            } catch (startError) {
                console.log(`[wireless] Server restart attempt ${attempt + 1} failed:`, startError.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!restartSuccess) {
            throw new Error('Failed to restart ADB server after protocol repair');
        }
        
        console.log('[wireless] Immediate protocol repair successful');
        return true;
    } catch (error) {
        console.log('[wireless] Immediate protocol repair failed:', error.message);
        return false;
    }
}

// ADB health check to detect protocol issues early
async function performAdbHealthCheck() {
    console.log('[wireless] Performing ADB health check...');
    try {
        // Test 1: Check if ADB server is responsive
        const versionResult = await runADBcommand('version', 0, true);
        if (!versionResult || versionResult.includes('protocol fault') || versionResult.includes('No error')) {
            console.log('[wireless] ADB version check failed, protocol issue detected');
            throw new Error('ADB server version check failed - protocol fault');
        }

        // Test 2: Check devices command
        const devicesResult = await runADBcommand('devices', 0, true);
        if (!devicesResult || devicesResult.includes('protocol fault') || devicesResult.includes('No error')) {
            console.log('[wireless] ADB devices check failed, protocol issue detected');
            throw new Error('ADB devices command failed - protocol fault');
        }

        // Test 3: Check for any hung connections
        if (devicesResult.includes('offline') || devicesResult.includes('unauthorized')) {
            console.log('[wireless] Found problematic device connections, cleaning up...');
            await runADBcommand('disconnect', 0, true);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('[wireless] ADB health check passed');
        return true;
    } catch (error) {
        console.log('[wireless] ADB health check failed:', error.message);
        // 如果健康檢查失敗且包含protocol fault，立即嘗試修復
        if (error.message.includes('protocol fault') || error.message.includes('No error')) {
            console.log('[wireless] Health check detected protocol fault, attempting immediate repair...');
            const repairSuccess = await immediateProtocolRepair();
            if (repairSuccess) {
                console.log('[wireless] Protocol repair successful during health check');
                return true;
            }
        }
        return false;
    }
}

// Proactive ADB cleanup before wireless operations
async function proactiveAdbCleanup() {
    console.log('[wireless] Starting proactive ADB cleanup...');
    
    const healthCheck = await performAdbHealthCheck();
    if (!healthCheck) {
        console.log('[wireless] Health check failed, performing enhanced reset...');
        const resetSuccess = await enhancedAdbReset();
        if (!resetSuccess) {
            throw new Error('Unable to restore ADB server to healthy state');
        }
        
        // Verify reset worked
        await new Promise(resolve => setTimeout(resolve, 1000));
        const secondHealthCheck = await performAdbHealthCheck();
        if (!secondHealthCheck) {
            throw new Error('ADB server still unhealthy after reset');
        }
        console.log('[wireless] ADB server restored to healthy state');
    }

    // Standard cleanup
    try {
        await runADBcommand('disconnect', 0, true);
        console.log('[wireless] Proactive cleanup completed');
    } catch (cleanupError) {
        console.log('[wireless] Proactive cleanup had minor issues (normal):', cleanupError.message);
    }
}

// Reset all wireless connection state
function resetWirelessConnectionState() {
    console.log('[wireless] Resetting all wireless connection state...');
    
    // 停止所有活動的服務
    if (wirelessConnectionState.bonjour) {
        try {
            wirelessConnectionState.bonjour.destroy();
        } catch (error) {
            console.log('[wireless] Error destroying bonjour:', error.message);
        }
        wirelessConnectionState.bonjour = null;
    }

    // 清理狀態提示
    if (wirelessConnectionState.statusElement) {
        removePersistentStatus(wirelessConnectionState.statusElement);
    }

    // 清除所有超時
    if (wirelessConnectionState.waitingTimeout) {
        clearTimeout(wirelessConnectionState.waitingTimeout);
        wirelessConnectionState.waitingTimeout = null;
    }

    // 重置所有狀態變數
    wirelessConnectionState.isScanning = false;
    wirelessConnectionState.deviceAddress = null;
    wirelessConnectionState.devicePorts = [];
    wirelessConnectionState.isConnecting = false;
    wirelessConnectionState.connectionAttempts = 0;
    wirelessConnectionState.protocolFaultCount = 0;
    wirelessConnectionState.lastHealthCheck = null;
    
    console.log('[wireless] All wireless connection state reset complete');
}

// Stop scanning and reset connection state
function stopWirelessScanning() {
    console.log('[wireless] Stopping wireless scanning...');
    resetWirelessConnectionState();
}

// Initialize wireless connection event handlers
function initWirelessConnection() {
    const dialogWirelessConnect = document.querySelector('.dialog-wireless-connect');
    const iconWirelessConnect = document.getElementById('icon-wireless-connect');

    if (iconWirelessConnect) {
        iconWirelessConnect.addEventListener('click', () => {
            console.log('[wireless] Icon clicked, isConnected:', typeof isConnected !== 'undefined' ? isConnected : 'undefined');
            
            if (typeof isConnected !== 'undefined' && isConnected) {
                if (typeof showDisconnectDialog === 'function') {
                    showDisconnectDialog(true);
                }
                return;
            }

            if (dialogWirelessConnect) {
                // 立即顯示dialog，避免延遲
                console.log('[wireless] Opening dialog immediately');
                dialogWirelessConnect.open = true;
            }
        });
    }

    if (dialogWirelessConnect) {
        dialogWirelessConnect.addEventListener('open', () => {
            console.log('[wireless] Dialog opened, starting background initialization');
            
            // 立即開始QR碼加載，不等待健康檢查
            const qrImg = dialogWirelessConnect.querySelector('img');
            if (qrImg) {
                loadQRCodeWithAnimation(qrImg);
            }
            
            // 並行啟動後台任務，不阻塞UI
            Promise.resolve().then(async () => {
                try {
                    // 並行執行健康檢查和掃描啟動
                    const healthCheckPromise = proactiveAdbCleanup().catch(error => {
                        console.log('[wireless] Health check failed, continuing anyway:', error.message);
                    });
                    
                    const scanningPromise = new Promise(resolve => {
                        setTimeout(() => {
                            startWirelessScanning();
                            resolve();
                        }, 100); // 最小延遲以確保dialog完全渲染
                    });
                    
                    // 等待兩個任務完成，但不阻塞對話框顯示
                    await Promise.allSettled([healthCheckPromise, scanningPromise]);
                } catch (error) {
                    console.log('[wireless] Background initialization error:', error.message);
                    if (typeof showSnackAlert === 'function') {
                        showSnackAlert('ADB 服務可能異常，但仍可嘗試連接');
                    }
                }
            });
        });

        // 處理dialog關閉事件 - 只有在連接中時才阻止關閉
        dialogWirelessConnect.addEventListener('close', (event) => {
            console.log('[wireless] Dialog close event triggered, isConnecting:', wirelessConnectionState.isConnecting);
            if (wirelessConnectionState.isConnecting) {
                console.log('[wireless] Preventing dialog close - connection in progress');
                event.preventDefault();
                event.stopPropagation();
                dialogWirelessConnect.open = true;
                return;
            }
            console.log('[wireless] Dialog close allowed - stopping scanning');
            stopWirelessScanning();
        });

        // 監聽 beforeclose 事件來更好地控制關閉行為
        dialogWirelessConnect.addEventListener('beforeclose', (event) => {
            console.log('[wireless] Dialog beforeclose event triggered, isConnecting:', wirelessConnectionState.isConnecting);
            if (wirelessConnectionState.isConnecting) {
                console.log('[wireless] Preventing dialog beforeclose - connection in progress');
                event.preventDefault();
                return false;
            }
            console.log('[wireless] Dialog beforeclose allowed');
            return true;
        });
    }

    const ipConnectButton = document.getElementById('button-connect-ip');
    if (ipConnectButton) {
        ipConnectButton.addEventListener('click', async () => {
            const ipInput = document.querySelector('.dialog-wireless-connect mdui-text-field[label="IP 位置"]');
            const codeInput = document.querySelector('.dialog-wireless-connect mdui-text-field[label="配對代碼"]');

            if (!ipInput || !codeInput) {
                if (typeof showSnackAlert === 'function') {
                    showSnackAlert('找不到輸入欄位');
                }
                return;
            }

            const ip = ipInput.value.trim();
            const pairingCode = codeInput.value.trim();

            if (!ip || !pairingCode) {
                if (typeof showSnackAlert === 'function') {
                    showSnackAlert('請輸入 IP 位址與配對碼');
                }
                return;
            }

            const statusElement = createPersistentStatus('配對中...');

            wirelessConnectionState.isConnecting = true;
            if (dialogWirelessConnect) {
                // 儲存原始屬性值以便稍後恢復
                if (!dialogWirelessConnect.hasAttribute('data-original-close-on-esc')) {
                    dialogWirelessConnect.setAttribute('data-original-close-on-esc', dialogWirelessConnect.getAttribute('close-on-esc') || 'true');
                }
                if (!dialogWirelessConnect.hasAttribute('data-original-close-on-overlay-click')) {
                    dialogWirelessConnect.setAttribute('data-original-close-on-overlay-click', dialogWirelessConnect.getAttribute('close-on-overlay-click') || 'true');
                }
                
                dialogWirelessConnect.setAttribute('close-on-esc', 'false');
                dialogWirelessConnect.setAttribute('close-on-overlay-click', 'false');
            }

            try {
                // Enhanced preventive cleanup before manual pairing
                updatePersistentStatus(statusElement, '準備配對中...');
                console.log('[wireless] Performing enhanced preventive cleanup before manual pairing');

                try {
                    await proactiveAdbCleanup();
                } catch (cleanupError) {
                    console.log('[wireless] Proactive cleanup failed, attempting basic cleanup');
                    try {
                        await runADBcommand('disconnect', 0, true);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (basicCleanupError) {
                        console.log('[wireless] Basic cleanup completed (error expected)');
                    }
                }

                // Parse IP and port from input - 配對需要使用正確的配對端口
                let pairingIP, pairingPort;
                if (ip.includes(':')) {
                    const parts = ip.split(':');
                    pairingIP = parts[0];
                    pairingPort = parts[1];
                } else {
                    pairingIP = ip;
                    // 如果只提供IP，常見的配對端口是5555或其他隨機端口
                    // 使用者需要提供完整的IP:PORT格式
                    if (typeof showSnackAlert === 'function') {
                        showSnackAlert('請提供完整的 IP:配對端口 格式（例如：192.168.1.100:12345）');
                    }
                    updatePersistentStatus(statusElement, '需要完整的 IP:配對端口 格式');
                    setTimeout(() => removePersistentStatus(statusElement), 3000);
                    wirelessConnectionState.isConnecting = false;
                    if (dialogWirelessConnect) {
                        restoreDialogCloseAttributes(dialogWirelessConnect);
                    }
                    return;
                }

                updatePersistentStatus(statusElement, '配對中...');

                // Implement robust IP pairing with protocol error detection
                let pairResult = null;
                let pairAttempts = 0;
                const maxPairAttempts = 3;

                while (!pairResult && pairAttempts < maxPairAttempts) {
                    try {
                        pairAttempts++;
                        console.log(`[wireless] IP pairing attempt ${pairAttempts}/${maxPairAttempts}`);
                        
                        pairResult = await runADBcommand(`pair ${pairingIP}:${pairingPort} ${pairingCode}`, 0);
                        console.log('[wireless] Manual IP pairing result:', pairResult);
                        
                        // Check for protocol fault specifically
                        if (pairResult && pairResult.includes('protocol fault')) {
                            throw new Error('Protocol fault detected');
                        }
                        
                        if (!pairResult || (!pairResult.includes('Successfully paired') && !pairResult.includes('成功') && !pairResult.includes('paired to'))) {
                            throw new Error(`配對失敗: ${pairResult}`);
                        }
                        
                        break; // Success
                    } catch (pairError) {
                        console.log(`[wireless] IP pairing attempt ${pairAttempts} failed:`, pairError.message);
                        
                        if (pairError.message.includes('protocol fault') || pairError.message.includes('No error')) {
                            console.log('[wireless] Protocol fault detected in IP pairing, performing emergency reset...');
                            updatePersistentStatus(statusElement, '偵測到協定錯誤，重置中...');
                            
                            const resetSuccess = await enhancedAdbReset();
                            if (resetSuccess) {
                                console.log('[wireless] Emergency reset successful, retrying IP pairing...');
                                updatePersistentStatus(statusElement, '配對中...');
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } else {
                                throw new Error('Emergency ADB reset failed');
                            }
                        } else if (pairAttempts >= maxPairAttempts) {
                            throw pairError;
                        }
                        
                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                updatePersistentStatus(statusElement, '連線中...');
                // Connect command typically uses port 5555
                const connectResult = await runADBcommand(`connect ${pairingIP}:5555`, 2);
                console.log('[wireless] Manual IP connection result:', connectResult);
                
                if (!connectResult || (!connectResult.includes('connected to') && !connectResult.includes('already connected'))) {
                    throw new Error(`連線失敗: ${connectResult}`);
                }

                // Wait for device to be properly recognized
                updatePersistentStatus(statusElement, '驗證裝置連線...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Verify device connection
                try {
                    const devicesResult = await runADBcommand('devices', 1, true);
                    if (!devicesResult.includes(`${pairingIP}:5555`)) {
                        console.log('[wireless] Device verification failed, retrying connection...');
                        await runADBcommand(`connect ${pairingIP}:5555`, 1, true);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (verifyError) {
                    console.log('[wireless] Device verification error:', verifyError);
                }

                updatePersistentStatus(statusElement, 'IP 連線成功！');

                // 重置錯誤計數，IP連線成功
                wirelessConnectionState.protocolFaultCount = 0;
                wirelessConnectionState.connectionAttempts = 0;
                wirelessConnectionState.isConnecting = false;
                
                if (dialogWirelessConnect) {
                    restoreDialogCloseAttributes(dialogWirelessConnect);
                    dialogWirelessConnect.open = false;
                }

                setTimeout(() => removePersistentStatus(statusElement), 2000);

                if (typeof window.handleWirelessConnection === 'function') {
                    await window.handleWirelessConnection(`${pairingIP}:5555`);
                } else if (typeof getDevice === 'function') {
                    await getDevice();
                }

            } catch (error) {
                wirelessConnectionState.isConnecting = false;
                if (dialogWirelessConnect) {
                    restoreDialogCloseAttributes(dialogWirelessConnect);
                }

                const errorMsg = error.message || error.toString();
                console.log('[wireless] Manual IP connection failed:', errorMsg);

                if (errorMsg.includes('protocol fault') || errorMsg.includes('No error')) {
                    updatePersistentStatus(statusElement, 'ADB 協定錯誤，正在清理連線...');

                    // Show toast notification
                    if (typeof showSnackAlert === 'function') {
                        showSnackAlert('偵測到 ADB 協定錯誤，正在重置連線');
                    }

                    // Complete ADB reset procedure
                    const resetSuccess = await completeAdbReset();
                    if (resetSuccess) {
                        updatePersistentStatus(statusElement, 'ADB 已重置，請重新嘗試連線');
                        // Show success toast
                        if (typeof showSnackAlert === 'function') {
                            showSnackAlert('ADB 伺服器已重置完成');
                        }
                        // Restart device tracking if available
                        if (typeof window.startDeviceTracking === 'function') {
                            setTimeout(() => window.startDeviceTracking(), 1000);
                        }
                    } else {
                        updatePersistentStatus(statusElement, 'ADB 重置失敗，請重啟應用程式後重試');
                        if (typeof showSnackAlert === 'function') {
                            showSnackAlert('ADB 重置失敗，請手動重啟應用程式');
                        }
                    }
                } else if (errorMsg.includes('failed to authenticate')) {
                    updatePersistentStatus(statusElement, '配對碼錯誤，請檢查配對碼是否正確');
                } else if (errorMsg.includes('cannot connect')) {
                    updatePersistentStatus(statusElement, '無法連線到裝置，請檢查 IP 位址與網路');
                } else {
                    updatePersistentStatus(statusElement, 'IP 連線失敗，請檢查 IP 與配對碼');
                }

                setTimeout(() => removePersistentStatus(statusElement), 5000);
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWirelessConnection);
} else {
    initWirelessConnection();
}
