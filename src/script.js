const { ipcRenderer, remote } = require('electron');
const path = require('path');

// Direct Node.js access through renderer process
window.executeAdbCommand = (command) => ipcRenderer.invoke('execute-adb-command', command);
window.showOpenDialog = (options) => ipcRenderer.invoke('dialog:showOpenDialog', options);
window.getConfig = () => ipcRenderer.invoke('get-config');
window.setConfig = (config) => ipcRenderer.invoke('set-config', config);
window.resetConfig = () => ipcRenderer.invoke('reset-config');

console.log('Node.js integration enabled in renderer process');