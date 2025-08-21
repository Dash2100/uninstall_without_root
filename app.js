// Electron main process entry
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { exec, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Paths
console.log('[App] Paths defined:', {
    userData: app.getPath('userData'),
    tempPath: path.join(app.getPath('userData'), 'temp'),
    configPath: path.join(app.getPath('userData'), 'config.json')
});
const userData = app.getPath('userData');
const tempPath = path.join(userData, 'temp');
const configPath = path.join(userData, 'config.json');

// Get built-in ADB executable path
function getBuiltinAdbPath() {
    const platform = os.platform();
    const arch = os.arch();
    let adbPath;
    const base = app.isPackaged ? process.resourcesPath : __dirname;
    if (platform === 'darwin') {
        adbPath = path.join(base, 'adb', `mac-${arch}`, 'adb');
    } else if (platform === 'win32') {
        adbPath = path.join(base, 'adb', 'win-x64', 'adb.exe');
    } else if (platform === 'linux') {
        adbPath = path.join(base, 'adb', `linux-${arch}`, 'adb');
    } else {
        throw new Error(`Unsupported platform: ${platform} ${arch}`);
    }
    return adbPath;
}

// Get ADB executable path (custom or built-in)
async function getAdbPath() {
    const config = await readConfig();
    if (config.custom_adb_path && await fs.promises.access(config.custom_adb_path).then(() => true).catch(() => false)) {
        console.log('[ADB] Using custom ADB path:', config.custom_adb_path);
        return config.custom_adb_path;
    }
    const builtinPath = getBuiltinAdbPath();
    console.log('[ADB] Using built-in ADB path:', builtinPath);
    return builtinPath;
}

// Ensure ADB is executable
async function initADB() {
    const adb = await getAdbPath();
    console.log('[ADB] initADB: ensuring executable:', adb);
    if (os.platform() !== 'win32') {
        fs.chmod(adb, 0o755, () => {
            console.log('[ADB] chmod applied to:', adb);
        });
    }
    return adb;
}

function getDefaultExtractPath() {
    const docPath = app.getPath('documents');
    const defaultPath = path.join(docPath, 'ADBExtracted');

    // create folder if it doesn't exist
    fs.promises.mkdir(defaultPath, { recursive: true })
        .then(() => console.log('[File] Default extract path ensured:', defaultPath))
        .catch(err => console.error('[File] Error ensuring default extract path:', err));

    console.log('[File] getDefaultExtractPath:', defaultPath);

    return defaultPath;
}

// Default config
const defaultConfig = {
    darkmode: true,
    debug_mode: false,
    extract_path: getDefaultExtractPath(),
    theme_color: '#6750A4',
    custom_adb_path: null // null 表示使用內建版本
};

// Write default config
async function resetConfig() {
    console.log('[Config] resetConfig: writing default config to:', configPath);

    await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));

    console.log('[Config] default config written');

    getDefaultExtractPath(); // Ensure default extract path exists

    return defaultConfig;
}

// Read config or reset if missing/corrupt
async function readConfig() {
    console.log('[Config] readConfig: reading config from:', configPath);
    try {
        await fs.promises.access(configPath);
    } catch {
        console.log('[Config] config not found, resetting');
        return resetConfig();
    }
    try {
        const data = await fs.promises.readFile(configPath, 'utf-8');
        console.log('[Config] config data read');
        return JSON.parse(data);
    } catch (err) {
        console.log('[Config] error parsing config, resetting');
        return resetConfig();
    }
}

// Clear temp folder
async function formatTemp() {
    console.log('[File] formatTemp: clearing temp folder:', tempPath);
    const files = await fs.promises.readdir(tempPath).catch(() => []);
    console.log('[File] files found:', files);
    await Promise.all(
        files.map(f => fs.promises.rm(path.join(tempPath, f), { recursive: true, force: true }))
    );
    console.log('[File] temp folder cleared');
}

// Ensure temp folder
async function initTemp() {
    console.log('[File] initTemp: creating temp folder:', tempPath);
    await fs.promises.mkdir(tempPath, { recursive: true });
    await formatTemp();
}

// Create application window
function createWindow() {
    console.log('[App] createWindow: opening main window');
    mainWindow = new BrowserWindow({
        width: 750, height: 800, resizable: false,
        autoHideMenuBar: true,
        backgroundColor: '#0f0f0f',
        title: '解除安裝原廠應用程式免ROOT',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
    global.mainWindow = mainWindow;

    // Start ADB device tracking when window is ready
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('[ADB] Window loaded, starting device tracking');
        setTimeout(() => startAdbTracking(), 1000);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopAdbTracking();
    });

    console.log('[App] main window created');
}

// Execute external ADB command
ipcMain.handle('execute-adb-command', async (_e, cmd) => {
    console.log('[ADB] execute command:', cmd);
    return new Promise(async (res, rej) => {
        const adb = await getAdbPath();
        exec(`"${adb}" ${cmd}`, (err, out, errOut) => {
            if (err) {
                console.log('[ADB] command error:', err);
                return rej(err.message);
            }
            // console.log('[ADB] command output:', out);
            return res(out);
        });
    });
});

// Show open dialog
ipcMain.handle('dialog:showOpenDialog', (_e, opts) => {
    console.log('[Dialog] showOpenDialog:', opts);
    return dialog.showOpenDialog(opts);
});

// Get config
ipcMain.handle('get-config', () => {
    console.log('[Config] get-config');
    return readConfig();
});

// Set config
ipcMain.handle('set-config', async (_e, key, val) => {
    console.log('[Config] set-config:', key, val);
    const cfg = await readConfig();
    cfg[key] = val;
    await fs.promises.writeFile(configPath, JSON.stringify(cfg, null, 2));
    console.log('[Config] config updated');
    return cfg;
});

// Reset config via IPC
ipcMain.handle('reset-config', () => {
    console.log('[Config] reset-config requested');
    return resetConfig();
});

// Format temp via IPC
ipcMain.handle('format-temp-folder', () => {
    console.log('[File] format-temp-folder requested');
    return formatTemp();
});

// Get temp path
ipcMain.handle('get-temp-folder-path', () => {
    console.log('[File] get-temp-folder-path:', tempPath);
    return tempPath;
});

// Check file exists
ipcMain.handle('check-file-exists', (_e, file) => {
    console.log('[File] check-file-exists:', file);
    return fs.promises.access(file).then(() => true).catch(() => false);
});

// Rename and move APK files
ipcMain.handle('rename-and-move-apk', async () => {
    console.log('[File] rename-and-move-apk: moving from temp to dest');
    const cfg = await readConfig();

    let dest = cfg.extract_path;
    console.log('[Config] dest from config:', dest);

    if (!path.isAbsolute(dest)) {
        dest = path.join(userData, dest);
        console.log('[File] resolved dest:', dest);
    }

    await fs.promises.mkdir(dest, { recursive: true });
    console.log('[File] ensured dest directory exists');

    const files = await fs.promises.readdir(tempPath);
    console.log('[File] files to move:', files);

    if (files.length === 0) {
        console.log('[File] no files to move');
        return { state: false, error: false };
    }

    await Promise.all(
        files.map(f => {
            console.log('[File] moving file:', f);
            return fs.promises.rename(path.join(tempPath, f), path.join(dest, f));
        })
    );

    console.log('[File] files moved successfully');
    return { state: true, files };
});

// Open file in explorer
ipcMain.handle('open-file-path', (_e, fp) => {
    console.log('[File] open-file-path:', fp);
    return shell.showItemInFolder(fp);
});

// break window
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

// Test ADB and get version info
ipcMain.handle('test-adb-path', async (_e, adbPath) => {
    console.log('[ADB] Testing ADB path:', adbPath);
    return new Promise((resolve) => {
        exec(`"${adbPath}" version`, { timeout: 5000 }, (err, out, errOut) => {
            if (err) {
                console.log('[ADB] Test failed:', err.message);
                resolve({ success: false, error: err.message });
            } else {
                // Extract version info from output
                const versionMatch = out.match(/Android Debug Bridge version (\d+\.\d+\.\d+)/);
                const version = versionMatch ? versionMatch[1] : '未知版本';
                console.log('[ADB] Test successful, version:', version);
                resolve({ success: true, version: version, fullOutput: out.trim() });
            }
        });
    });
});

// Get current ADB info
ipcMain.handle('get-adb-info', async () => {
    const config = await readConfig();
    const adbPath = await getAdbPath();
    const isCustom = config.custom_adb_path && config.custom_adb_path === adbPath;
    
    // Get version info
    const testResult = await new Promise((resolve) => {
        exec(`"${adbPath}" version`, { timeout: 5000 }, (err, out, errOut) => {
            if (err) {
                resolve({ success: false, error: err.message });
            } else {
                const versionMatch = out.match(/Android Debug Bridge version (\d+\.\d+\.\d+)/);
                const version = versionMatch ? versionMatch[1] : '未知版本';
                resolve({ success: true, version: version });
            }
        });
    });
    
    return {
        isCustom,
        path: adbPath,
        version: testResult.success ? testResult.version : '版本檢測失敗'
    };
});

// Restart ADB tracking when path changes
ipcMain.handle('restart-adb-tracking', async () => {
    console.log('[ADB] Restarting ADB tracking due to path change');
    stopAdbTracking();
    
    // Wait a moment before restarting
    setTimeout(() => {
        startAdbTracking();
    }, 1000);
    
    return { success: true };
});

// USB Device Change Monitoring
let adbTrackProcess = null;
let mainWindow = null;

async function startAdbTracking() {
    if (adbTrackProcess) {
        console.log('[ADB] Track process already running');
        return;
    }

    const adbPath = await getAdbPath();
    console.log('[ADB] Starting device tracking with:', adbPath);
    
    adbTrackProcess = spawn(adbPath, ['track-devices'], { 
        stdio: ['ignore', 'pipe', 'pipe'] 
    });

    adbTrackProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log('[ADB] Device tracking output:', output);
        
        // Notify renderer process about device changes
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('adb-device-changed', output);
        }
    });

    adbTrackProcess.stderr.on('data', (data) => {
        console.log('[ADB] Device tracking error:', data.toString());
    });

    adbTrackProcess.on('close', (code) => {
        console.log('[ADB] Track process closed with code:', code);
        adbTrackProcess = null;
        
        // Restart tracking if it wasn't intentionally stopped
        if (code !== 0 && !app.isQuitting) {
            setTimeout(() => {
                console.log('[ADB] Restarting device tracking...');
                startAdbTracking();
            }, 2000);
        }
    });

    adbTrackProcess.on('error', (error) => {
        console.error('[ADB] Track process error:', error);
        adbTrackProcess = null;
    });
}

function stopAdbTracking() {
    if (adbTrackProcess) {
        console.log('[ADB] Stopping device tracking');
        adbTrackProcess.kill();
        adbTrackProcess = null;
    }
}

// Kill ADB on exit
app.on('before-quit', async () => {
    console.log('[ADB] kill-server and stop tracking');
    stopAdbTracking();
    const adbPath = await getAdbPath();
    exec(`"${adbPath}" kill-server`, () => { });
});

// App lifecycle
app.whenReady()
    .then(async () => {
        console.log('[App] app.whenReady');
        createWindow();
        await Promise.all([initADB(), initTemp()]);
    });

app.on('activate', () => {
    console.log('[App] activate event');
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    console.log('[App] window-all-closed event');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});