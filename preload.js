const { contextBridge, ipcRenderer } = require('electron');

// 暴露 ADB API 到渲染進程
contextBridge.exposeInMainWorld('adb', {
    getDevices: () => ipcRenderer.invoke('adb:getDevices'),
    getAppList: () => ipcRenderer.invoke('adb:getAppList')
});

window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency])
    }
})