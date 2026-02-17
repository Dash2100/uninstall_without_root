const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const { getAdbPath } = require('./adb-service');

let mainWindow = null;
let terminalWindow = null;

function getMainWindow() {
    return mainWindow;
}

function getTerminalWindow() {
    return terminalWindow;
}

function createWindow() {
    console.log('[App] createWindow: opening main window');
    mainWindow = new BrowserWindow({
        width: 750, height: 800, resizable: false,
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#0f0f0f',
        title: '解除安裝原廠應用程式免ROOT',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
    global.mainWindow = mainWindow;

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (terminalWindow && !terminalWindow.isDestroyed()) {
            terminalWindow.close();
            terminalWindow = null;
        }
        app.quit();
    });

    console.log('[App] main window created');
    return mainWindow;
}

function registerIPC() {
    ipcMain.handle('break-window', () => {
        console.log('[App] break-window event received');
        const win = BrowserWindow.getFocusedWindow();
        if (win) {
            console.log('[App] breaking window:', win.id);
            app.quit();
        } else {
            console.log('[App] no focused window to break');
        }
    });

    ipcMain.handle('open-terminal-window', () => {
        if (terminalWindow && !terminalWindow.isDestroyed()) {
            terminalWindow.focus();
            return;
        }

        const mainBounds = mainWindow ? mainWindow.getBounds() : { x: 100, y: 100, height: 800 };

        terminalWindow = new BrowserWindow({
            width: 450, height: mainBounds.height, resizable: true,
            x: mainBounds.x + 750 + 10,
            y: mainBounds.y,
            autoHideMenuBar: true,
            backgroundColor: '#0a0a0a',
            title: 'ADB Terminal',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        terminalWindow.loadFile(path.join(__dirname, '..', 'src', 'terminal.html'));

        terminalWindow.on('closed', () => {
            terminalWindow = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal-window-closed');
            }
        });
    });

    ipcMain.handle('close-terminal-window', () => {
        if (terminalWindow && !terminalWindow.isDestroyed()) {
            terminalWindow.close();
            terminalWindow = null;
        }
    });

    ipcMain.on('terminal-append', (_e, text, type) => {
        if (terminalWindow && !terminalWindow.isDestroyed()) {
            terminalWindow.webContents.send('terminal-append', text, type);
        }
    });

    ipcMain.on('terminal-clear', () => {
        if (terminalWindow && !terminalWindow.isDestroyed()) {
            terminalWindow.webContents.send('terminal-clear');
        }
    });

    ipcMain.handle('terminal-execute-adb', async (_e, cmd) => {
        console.log('[Terminal] execute command:', cmd);
        const adb = await getAdbPath();
        return new Promise((res, rej) => {
            exec(`"${adb}" ${cmd}`, (err, out, errOut) => {
                if (err) return rej(err.message);
                return res(out || errOut);
            });
        });
    });
}

module.exports = {
    createWindow, getMainWindow, getTerminalWindow, registerIPC
};
