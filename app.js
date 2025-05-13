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
    // 讀取配置判斷是否啟用調試模式
    const config = readConfig();
    const debugMode = config && config.debug_mode;

    const win = new BrowserWindow({
        width: debugMode ? 900 : 500,
        height: 900,
        autoHideMenuBar: true,
        resizable: debugMode,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // 將窗口对象存储为全局变量，以便後續可存取
    global.mainWindow = win;

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
ipcMain.handle('set-config', async (event, key, value) => {
    const configPath = path.join(app.getPath('userData'), 'config.json');

    if (!fs.existsSync(configPath)) {
        resetConfigToDefault();
    }

    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);

    config[key] = value;

    // rewrite config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');

    console.log("[config] Config file", key, "updated:", value);
    return config;
});

// reset config
ipcMain.handle('reset-config', async (event) => {
    resetConfigToDefault();
});

// 調整視窗大小 (用於調試模式)
ipcMain.handle('resize-window', async (event, enableDebug) => {
    const win = global.mainWindow;
    if (win) {
        win.setSize(enableDebug ? 833 : 500, 900);
        win.setResizable(enableDebug);
        return { success: true };
    }
    return { success: false };
});