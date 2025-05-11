const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');

// adb functions

function getAdbPath() {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'darwin') {
        if (arch === 'arm64') { // MacOS
            return path.join(__dirname, 'adb', 'mac-arm64', 'adb');
        }
    } else if (platform === 'win32') { // Windows
        return path.join(__dirname, 'adb', 'win-x64', 'adb.exe');
    } else {
        return "N/A";
    }
}

// set adb file permission to executable
function getADBPermission() {
    const adbPath = getAdbPath();

    if (os.platform() !== 'win32') {
        try {
            fs.chmodSync(adbPath, '755');
        } catch (error) {
            console.error('Failed to get ADB permission:', error);
        }
    }
    return adbPath;
}

function initADB() {
    try {
        getADBPermission();
    } catch (error) {
        console.error('Initializing ADB failed:', error);
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 500,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.webContents.openDevTools();

    win.loadFile("./src/index.html");
}

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.whenReady().then(() => {
    console.log("[adb] Used Adb Path: ", getAdbPath());

    // Initialize ADB
    initADB();

    createWindow();
});

// IPC commands
ipcMain.handle('execute-adb-command', async (event, command) => {
    return new Promise((resolve, reject) => {
        const adbPath = getAdbPath();
        const fullCommand = `"${adbPath}" ${command}`;

        console.log('[adb] Run command:', fullCommand);

        exec(fullCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`: ${error}`);
                reject(error.message);
                return;
            }

            if (stderr) {
                console.error(`stderr: ${stderr}`);
            }

            resolve(stdout);
        });
    });
});