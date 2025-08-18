const { ipcRenderer } = require('electron');

window.executeAdbCommand = (command) => ipcRenderer.invoke('execute-adb-command', command);
window.showOpenDialog = (options) => ipcRenderer.invoke('dialog:showOpenDialog', options);
window.getConfig = () => ipcRenderer.invoke('get-config');
window.setConfig = (key, value) => ipcRenderer.invoke('set-config', key, value);
window.resetConfig = () => ipcRenderer.invoke('reset-config');
window.openFilePath = (filePath) => ipcRenderer.invoke('open-file-path', filePath);
window.getTempFolderPath = () => ipcRenderer.invoke('get-temp-folder-path');
window.formatTempFolder = () => ipcRenderer.invoke('format-temp-folder');
window.renameAndMoveApk = () => ipcRenderer.invoke('rename-and-move-apk');
window.checkFileExists = (filePath) => ipcRenderer.invoke('check-file-exists', filePath);
window.breakWindow = () => ipcRenderer.invoke('break-window');

// USB Device Change Monitoring Setup
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Integration] Setting up USB device monitoring');
    
    ipcRenderer.on('adb-device-changed', (event, deviceList) => {
        console.log('[Integration] Device change received:', deviceList);
        
        // Check if we have the necessary functions available
        if (typeof window.handleDeviceChange === 'function') {
            window.handleDeviceChange(deviceList);
        } else {
            console.warn('[Integration] handleDeviceChange function not available yet');
            // Retry after a delay to allow other scripts to load
            setTimeout(() => {
                if (typeof window.handleDeviceChange === 'function') {
                    window.handleDeviceChange(deviceList);
                }
            }, 1000);
        }
    });
});