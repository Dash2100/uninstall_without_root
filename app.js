const { app, BrowserWindow, ipcMain, shell } = require('electron');

const { exec } = require('child_process');

// auto reloader
// require('electron-reloader')(module);

const os = require('os');
const fs = require('fs');
const path = require('path');

// temp folder
const tempPath = path.join(app.getPath('userData'), 'temp');

// ================= ADB functions =================

const getAdbPath = () => {
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
const getADBPermission = () => {
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

const initADB = () => {
    try {
        getADBPermission();
    } catch (error) {
        console.error('Initializing ADB failed:', error);
    }
}

const createWindow = () => {
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

    global.mainWindow = win;

    win.setBackgroundColor("#0f0f0f");
    win.setTitle("解除安裝原廠應用程式免ROOT");

    // win.webContents.openDevTools();

    win.loadFile("./src/index.html");
}

// readconfig
const resetConfigToDefault = () => {
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

const readConfig = () => {
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

// delete all files in temp folder
const formatTempFolder = () => {
    // delete everything including subfolders
    fs.readdir(tempPath, (err, files) => {
        if (err) {
            console.error("[temp] Error reading temp folder:", err);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(tempPath, file);
            fs.rm(filePath, { recursive: true, force: true }, (err) => {
                if (err) {
                    console.error("[temp] Error deleting file:", err);
                } else {
                    console.log("[temp] Deleted file:", filePath);
                }
            });
        });
    });
    console.log("[temp] Temp folder formatted.");
}

// init apk temp folder
const initTempFolder = () => {
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
    } else {
        formatTempFolder();
    }

    console.log("[temp] Temp folder path:", tempPath);

    return tempPath;
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

ipcMain.handle('format-temp-folder', async (event) => {
    formatTempFolder();
    console.log("[temp] Temp folder formatted.");
});

ipcMain.handle('get-temp-folder-path', async (event) => {
    const tempPath = path.join(app.getPath('userData'), 'temp');
    console.log("[temp] Temp folder path:", tempPath);
    return tempPath;
});

ipcMain.handle('rename-and-move-apk', async () => {
    const config = readConfig();
    const extrectPath = path.join(app.getPath('userData'), config.extrect_path);

    if (!fs.existsSync(extrectPath)) {
        fs.mkdirSync(extrectPath);
    }

    // 使用 Promise 包裝 fs.readdir
    try {
        const files = await new Promise((resolve, reject) => {
            fs.readdir(tempPath, (err, files) => {
                if (err) {
                    console.log("[temp] reading temp folder error:", err);
                    reject(err);
                } else {
                    resolve(files);
                }
            });
        });

        if (files.length === 0) {
            console.log("[temp] apk not found, check if it's still extracting...");
            // 直接返回物件，而非 JSON 字符串
            return {
                state: false,
                error: false
            };
        } else {
            console.log("[temp] apk found:", files);
            // 直接返回物件，而非 JSON 字符串
            return {
                state: true,
                files: files
            };
        }
    } catch (error) {
        console.log("[temp] error:", error);
        // 直接返回物件，而非 JSON 字符串
        return {
            state: false,
            error: true,
            message: error.message
        };
    }
});

ipcMain.handle('open-file-path', async (event, filePath) => {
    shell.showItemInFolder(filePath);
});

// reset config
ipcMain.handle('reset-config', async (event) => {
    resetConfigToDefault();
});

// check file exists
ipcMain.handle('check-file-exists', async (event, filePath) => {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        console.log(`[file] 檔案存在: ${filePath}`);
        return true;
    } catch (error) {
        console.log(`[file] 檔案不存在: ${filePath}`);
        return false;
    }
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

app.whenReady().then(() => {
    console.log("[app] App is initializing...");
    console.log("[adb] Used Adb Path: ", getAdbPath());

    readConfig();

    // Initialize ADB
    initADB();

    // Initialize temp folder
    initTempFolder();

    // electron window
    createWindow();
});