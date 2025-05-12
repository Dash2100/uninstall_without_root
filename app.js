const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');

// 載入設定檔
let config = {};
const defaultConfig = {
    "app": {
        "language": "zh",
        "darkMode": true,
        "window": {
            "width": 500,
            "height": 900
        }
    },
    "adb": {
        "autoConnect": true,
        "paths": {
            "mac-arm64": "adb/mac-arm64/adb",
            "win-x64": "adb/win-x64/adb.exe"
        }
    },
    "developer": {
        "devTools": false
    }
};

// 獲取應用程式的用戶數據目錄
function getUserDataPath() {
    // 在開發模式和生產模式中獲取正確的 userData 路徑
    return app.getPath('userData');
}

// 載入設定檔
try {
    // 使用 app.getPath('userData') 確保在打包後仍能正確讀取/寫入配置
    const userDataPath = getUserDataPath();
    const configPath = path.join(userDataPath, 'config.json');

    console.log('[Config] 嘗試從以下路徑載入設定檔:', configPath);

    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('[Config] 已從使用者數據目錄載入設定檔');
    } else {
        // 檢查開發環境中的配置文件
        const devConfigPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(devConfigPath)) {
            const configData = fs.readFileSync(devConfigPath, 'utf8');
            config = JSON.parse(configData);
            console.log('[Config] 已從開發目錄載入設定檔');
        } else {
            // 使用默認配置
            config = JSON.parse(JSON.stringify(defaultConfig));
            console.log('[Config] 設定檔不存在，使用預設設定');
            // 寫入默認配置到用戶數據目錄
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        }
    }
} catch (error) {
    console.error('[Config] 讀取設定檔失敗:', error);
    config = JSON.parse(JSON.stringify(defaultConfig));
}

// adb functions

// 儲存設定檔
function saveConfig() {
    try {
        const userDataPath = getUserDataPath();
        const configPath = path.join(userDataPath, 'config.json');

        // 確保目錄存在
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log('[Config] 設定檔已儲存至:', configPath);
    } catch (error) {
        console.error('[Config] 儲存設定檔失敗:', error);
    }
}

// 獲取應用程序根路徑（在打包和非打包環境下都適用）
function getAppResourcePath() {
    // 檢查是否在打包環境中運行
    const isPackaged = app.isPackaged;
    let appPath;

    if (isPackaged) {
        // 在打包環境中，使用 resources 路徑
        appPath = process.resourcesPath;
    } else {
        // 在開發環境中，使用 __dirname
        appPath = __dirname;
    }

    console.log('[App] 應用程序資源路徑:', appPath);
    return appPath;
}

function getAdbPath() {
    const platform = os.platform();
    const arch = os.arch();
    const appResourcePath = getAppResourcePath();

    console.log('[ADB] 正在獲取 ADB 路徑，平台:', platform, '架構:', arch, '應用資源路徑:', appResourcePath);

    // 從設定檔讀取路徑，如果沒有則使用預設值
    if (config.adb && config.adb.paths) {
        if (platform === 'darwin') {
            if (arch === 'arm64' && config.adb.paths['mac-arm64']) {
                const adbPath = path.join(appResourcePath, config.adb.paths['mac-arm64']);
                console.log('[ADB] 從配置獲取 Mac ARM64 ADB 路徑:', adbPath);
                return adbPath;
            }
        } else if (platform === 'win32' && config.adb.paths['win-x64']) {
            const adbPath = path.join(appResourcePath, config.adb.paths['win-x64']);
            console.log('[ADB] 從配置獲取 Windows x64 ADB 路徑:', adbPath);
            return adbPath;
        }
    }

    // 使用預設路徑
    if (platform === 'darwin') {
        if (arch === 'arm64') { // MacOS ARM64
            const adbPath = path.join(appResourcePath, 'adb', 'mac-arm64', 'adb');
            console.log('[ADB] 使用預設 Mac ARM64 ADB 路徑:', adbPath);
            return adbPath;
        } else { // MacOS Intel
            // 嘗試使用 mac-arm64 作為 Intel Mac 的後備選擇
            const adbPath = path.join(appResourcePath, 'adb', 'mac-arm64', 'adb');
            console.log('[ADB] 使用預設 Mac Intel ADB 路徑 (使用 arm64 作為備用):', adbPath);
            return adbPath;
        }
    } else if (platform === 'win32') { // Windows
        const adbPath = path.join(appResourcePath, 'adb', 'win-x64', 'adb.exe');
        console.log('[ADB] 使用預設 Windows x64 ADB 路徑:', adbPath);
        return adbPath;
    } else {
        console.log('[ADB] 不支援的平台或架構');
        return "N/A";
    }
}

// set adb file permission to executable
function getADBPermission() {
    const adbPath = getAdbPath();
    console.log('[ADB] 設定 ADB 權限，路徑:', adbPath);

    if (os.platform() !== 'win32') {
        try {
            // 檢查文件是否存在
            if (!fs.existsSync(adbPath)) {
                console.error('[ADB] ADB 文件不存在，無法設定權限:', adbPath);
                return adbPath;
            }

            // 檢查文件是否可寫
            try {
                fs.accessSync(adbPath, fs.constants.W_OK);
            } catch (err) {
                console.error('[ADB] ADB 文件沒有寫入權限:', err);
                // 對於打包後的資源，讀寫許可權可能受限，忽略這個錯誤並繼續嘗試
            }

            // 嘗試設定執行權限
            try {
                fs.chmodSync(adbPath, '755');
                console.log('[ADB] 已成功設定 ADB 執行權限');

                // 驗證權限設置是否成功
                const stats = fs.statSync(adbPath);
                const mode = stats.mode.toString(8);
                console.log('[ADB] 設定後的檔案權限模式:', mode);
            } catch (chmodError) {
                console.error('[ADB] 設定執行權限失敗:', chmodError);
            }

        } catch (error) {
            console.error('[ADB] 設定 ADB 權限失敗:', error);

            // 尝试使用子进程设置权限（备选方案）
            try {
                if (fs.existsSync(adbPath)) {
                    console.log('[ADB] 嘗試使用子進程設定權限:', adbPath);
                    exec(`chmod 755 "${adbPath}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[ADB] 使用子進程設定權限失敗:', error);
                        } else {
                            console.log('[ADB] 使用子進程成功設定權限');
                        }
                    });
                }
            } catch (subError) {
                console.error('[ADB] 子進程設定權限失敗:', subError);
            }
        }
    }
    return adbPath;
}

function testAdbConnection() {
    const adbPath = getAdbPath();

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(adbPath)) {
            console.error(`[ADB] ADB 文件不存在: ${adbPath}`);
            reject(new Error(`ADB 文件不存在: ${adbPath}`));
            return;
        }

        const command = `"${adbPath}" version`;
        console.log(`[ADB] 測試 ADB 連接: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`[ADB] 測試失敗: ${error.message}`);
                reject(error);
                return;
            }

            console.log(`[ADB] 測試成功，版本資訊: ${stdout}`);
            resolve(stdout);
        });
    });
}

function initADB() {
    try {
        getADBPermission();
    } catch (error) {
        console.error('Initializing ADB failed:', error);
    }
}

function createWindow() {
    // 從設定檔讀取視窗大小，如果沒有則使用預設值
    const windowWidth = config.app?.window?.width || 500;
    const windowHeight = config.app?.window?.height || 900;
    const showDevTools = config.developer?.devTools !== undefined ?
        config.developer.devTools : false;

    const win = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // 根據設定檔決定是否開啟開發者工具
    if (showDevTools) {
        win.webContents.openDevTools();
    }

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

// 在安裝過程中，確保用戶數據目錄中存在配置文件
function ensureConfigInUserData() {
    const userDataPath = getUserDataPath();
    const configPath = path.join(userDataPath, 'config.json');

    // 如果用戶數據目錄中沒有配置文件，就從資源中複製
    if (!fs.existsSync(configPath)) {
        try {
            // 首先檢查資源中是否有配置文件
            const resourceConfigPath = path.join(getAppResourcePath(), 'config.json');
            if (fs.existsSync(resourceConfigPath)) {
                const configData = fs.readFileSync(resourceConfigPath, 'utf8');
                if (!fs.existsSync(userDataPath)) {
                    fs.mkdirSync(userDataPath, { recursive: true });
                }
                fs.writeFileSync(configPath, configData, 'utf8');
                console.log('[Config] 已從資源複製配置文件到用戶數據目錄');
            } else {
                // 如果資源中沒有，就使用默認配置
                if (!fs.existsSync(userDataPath)) {
                    fs.mkdirSync(userDataPath, { recursive: true });
                }
                fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
                console.log('[Config] 已創建默認配置文件到用戶數據目錄');
            }
        } catch (error) {
            console.error('[Config] 複製配置文件失敗:', error);
        }
    }
}

app.whenReady().then(() => {
    // 確保用戶數據目錄中有配置文件
    ensureConfigInUserData();

    // 顯示 ADB 路徑
    const adbPath = getAdbPath();
    console.log("[adb] Used Adb Path: ", adbPath);

    // 檢查 ADB 文件是否存在
    if (fs.existsSync(adbPath)) {
        console.log("[adb] ADB 文件存在");

        // 初始化 ADB
        initADB();

        // 測試 ADB 連接
        testAdbConnection()
            .then(version => {
                console.log("[adb] ADB 連接測試成功:", version);
            })
            .catch(err => {
                console.error("[adb] ADB 連接測試失敗:", err.message);
            });
    } else {
        console.error("[adb] ADB 文件不存在！路徑:", adbPath);
    }

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

// 獲取設定檔
ipcMain.handle('get-config', async () => {
    return config;
});

// 儲存設定檔
ipcMain.handle('save-config', async (event, newConfig) => {
    // 更新全局設定檔
    config = newConfig;

    // 儲存到檔案
    saveConfig();

    return { success: true };
});