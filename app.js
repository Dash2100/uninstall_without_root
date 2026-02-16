// Electron main process entry
const { app, BrowserWindow } = require('electron');
const { exec } = require('child_process');

const config = require('./main/config');
const adbService = require('./main/adb-service');
const windowManager = require('./main/window');
const fileService = require('./main/file-service');
const scrcpyService = require('./main/scrcpy-service');

// Register all IPC handlers
config.registerIPC();
adbService.registerIPC();
windowManager.registerIPC();
fileService.registerIPC();
scrcpyService.registerIPC();

// App lifecycle
app.whenReady().then(async () => {
    console.log('[App] app.whenReady');
    const mainWindow = windowManager.createWindow();
    adbService.setMainWindow(mainWindow);

    // Start ADB device tracking when window is ready
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('[ADB] Window loaded, starting device tracking');
        setTimeout(() => adbService.startAdbTracking(), 1000);
    });

    await Promise.all([adbService.initADB(), fileService.initTemp()]);
});

app.on('activate', () => {
    console.log('[App] activate event');
    if (BrowserWindow.getAllWindows().length === 0) {
        const mainWindow = windowManager.createWindow();
        adbService.setMainWindow(mainWindow);
    }
});

app.on('window-all-closed', () => {
    console.log('[App] window-all-closed event');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async () => {
    console.log('[App] before-quit cleanup');
    adbService.stopAdbTracking();
    scrcpyService.killScrcpy();

    const terminalWindow = windowManager.getTerminalWindow();
    if (terminalWindow && !terminalWindow.isDestroyed()) {
        terminalWindow.close();
    }

    const adbPath = await adbService.getAdbPath();
    exec(`"${adbPath}" kill-server`, () => {});
});
