const { app, BrowserWindow, ipcMain } = require('electron');

const { exec } = require('child_process');

// auto reloader
// require('electron-reloader')(module);

const os = require('os');
const fs = require('fs');
const path = require('path');

// ================= ADB functions =================

function getAdbPath() {
    const platform = os.platform();
    const arch = os.arch();

    // 判斷是開發環境還是已打包的生產環境
    const isPackaged = app.isPackaged;

    // 獲取基本路徑 - 開發時使用 __dirname，打包後使用 app.getAppPath()
    const basePath = isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked')
        : __dirname;

    if (platform === 'darwin') {
        if (arch === 'arm64') { // MacOS
            return path.join(basePath, 'adb', 'mac-arm64', 'adb');
        } else if (arch === 'x64') { // 加入 Intel Mac 支援
            return path.join(basePath, 'adb', 'mac-x64', 'adb');
        }
    } else if (platform === 'win32') { // Windows
        return path.join(basePath, 'adb', 'win-x64', 'adb.exe');
    } else if (platform === 'linux') { // 加入 Linux 支援
        if (arch === 'x64') {
            return path.join(basePath, 'adb', 'linux-x64', 'adb');
        } else if (arch === 'arm64') {
            return path.join(basePath, 'adb', 'linux-arm64', 'adb');
        }
    }

    console.error(`Unsupported platform: ${platform} ${arch}`);
    return "N/A";
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
        width: 850,
        height: 900,
        resizable: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // 將窗口对象存储为全局变量，以便後續可存取
    global.mainWindow = win;

    win.setBackgroundColor("#0f0f0f");
    win.setTitle("解除安裝原廠應用程式免ROOT");

    // win.webContents.openDevTools();

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

// adb shound be kill when app quit
app.on('before-quit', () => {
    const adbPath = getAdbPath();
    exec(`"${adbPath}" kill-server`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error killing ADB server: ${error.message}`);
            return;
        }
        console.log('ADB server killed:', stdout);
    });
});