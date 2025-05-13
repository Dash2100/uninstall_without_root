const { ipcRenderer, remote } = require('electron');
const path = require('path');

// Direct Node.js access through renderer process
window.executeAdbCommand = (command) => ipcRenderer.invoke('execute-adb-command', command);
window.showOpenDialog = (options) => ipcRenderer.invoke('dialog:showOpenDialog', options);
window.getConfig = () => ipcRenderer.invoke('get-config');
window.setConfig = (key, value) => ipcRenderer.invoke('set-config', key, value);
window.resetConfig = () => ipcRenderer.invoke('reset-config');
window.resizeWindow = (enableDebug) => ipcRenderer.invoke('resize-window', enableDebug);

console.log('Node.js integration enabled in renderer process');