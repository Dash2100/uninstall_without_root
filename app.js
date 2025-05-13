const { app, BrowserWindow, ipcMain } = require('electron');

const { exec } = require('child_process');

const os = require('os');
const fs = require('fs');
const path = require('path');

// ================= ADB functions =================

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
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.webContents.openDevTools();

    win.loadFile("./src/index.html");
}

// readconfig
function resetConfigToDefault() {
    const configPath = path.join(app.getPath('userData'), 'config.json');

    console.log("[config] Config Path: ", configPath);

    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        console.log("[config] Config file deleted.");
    }

    // Create default config
    const defaultConfig = {
        "language": "zh",
        "darkmode": true,
        "delete_data": false,
        "debug_mode": false,
        "extrect_path": "./extrect_apks"
    }

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 4), 'utf-8');
    console.log("[config] Config file created with default values.");
}

function readConfig() {
    const configPath = path.join(app.getPath('userData'), 'config.json');

    console.log("[config] Config Path: ", configPath);

    if (!fs.existsSync(configPath)) {
        resetConfigToDefault();

        // Read the config file again
        return readConfig();
    }

    // Read the config file
    const configData = fs.readFileSync(configPath, 'utf-8');

    try {
        const config = JSON.parse(configData);
        console.log("[config] Config file loaded:", config);

        return config;
    } catch (error) {
        console.error("[config] Failed to parse config file:", error);
        return null;
    }
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

    readConfig();

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

ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(options);
    return result;
});

// get config
ipcMain.handle('get-config', async (event) => {
    return readConfig();
});

// set config
ipcMain.handle('set-config', async (event, config) => {
    const configPath = path.join(app.getPath('userData'), 'config.json');

    console.log("[config] Config Path: ", configPath);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
    console.log("[config] Config file updated:", config);
});

// reset config
ipcMain.handle('reset-config', async (event) => {
    resetConfigToDefault();
});