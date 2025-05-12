const { contextBridge, ipcRenderer, dialog } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    executeAdbCommand: (command) => ipcRenderer.invoke('execute-adb-command', command),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (config) => ipcRenderer.invoke('set-config', config),
    resetConfig: () => ipcRenderer.invoke('reset-config'),
});