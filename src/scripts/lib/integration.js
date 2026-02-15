const { ipcRenderer } = require('electron');

window.executeAdbCommand = (command) => ipcRenderer.invoke('execute-adb-command', command);
window.showOpenDialog = (options) => ipcRenderer.invoke('dialog:showOpenDialog', options);
window.getConfig = () => ipcRenderer.invoke('get-config');
window.setConfig = (key, value) => ipcRenderer.invoke('set-config', key, value);
window.resetConfig = () => ipcRenderer.invoke('reset-config');
window.openFilePath = (filePath) => ipcRenderer.invoke('open-file-path', filePath);
window.getTempFolderPath = () => ipcRenderer.invoke('get-temp-folder-path');
window.formatTempFolder = () => ipcRenderer.invoke('format-temp-folder');
window.testAdbPath = (adbPath) => ipcRenderer.invoke('test-adb-path', adbPath);
window.getAdbInfo = () => ipcRenderer.invoke('get-adb-info');
window.restartAdbTracking = () => ipcRenderer.invoke('restart-adb-tracking');
window.renameAndMoveApk = () => ipcRenderer.invoke('rename-and-move-apk');
window.checkFileExists = (filePath) => ipcRenderer.invoke('check-file-exists', filePath);
window.breakWindow = () => ipcRenderer.invoke('break-window');
window.getHelperDexPath = () => ipcRenderer.invoke('get-helper-dex-path');
window.openTerminalWindow = () => ipcRenderer.invoke('open-terminal-window');
window.closeTerminalWindow = () => ipcRenderer.invoke('close-terminal-window');

// USB Device Change Monitoring
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Integration] Setting up USB device monitoring');

    ipcRenderer.on('adb-device-changed', (event, deviceList) => {
        console.log('[Integration] USB device change:', deviceList);

        if (typeof window.handleDeviceChange === 'function') {
            window.handleDeviceChange(deviceList);
        } else {
            console.warn('[Integration] handleDeviceChange function not available yet');

            setTimeout(() => {
                if (typeof window.handleDeviceChange === 'function') {
                    window.handleDeviceChange(deviceList);
                }
            }, 500);
        }
    });

    // Sync debug mode toggle when terminal window is closed manually
    ipcRenderer.on('terminal-window-closed', () => {
        console.log('[Integration] Terminal window closed');
        if (typeof window.onTerminalWindowClosed === 'function') {
            window.onTerminalWindowClosed();
        }
    });
});