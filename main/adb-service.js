const { app, ipcMain } = require('electron');
const { exec, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { readConfig } = require('./config');

let adbTrackProcess = null;
let mainWindow = null;

function setMainWindow(win) {
    mainWindow = win;
}

function getBuiltinAdbPath() {
    const platform = os.platform();
    const arch = os.arch();
    const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
    if (platform === 'darwin') return path.join(base, 'adb', `mac-${arch}`, 'adb');
    if (platform === 'win32') return path.join(base, 'adb', 'win-x64', 'adb.exe');
    if (platform === 'linux') return path.join(base, 'adb', `linux-${arch}`, 'adb');
    throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

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

async function initADB() {
    const adb = await getAdbPath();
    console.log('[ADB] initADB: ensuring executable:', adb);
    if (os.platform() !== 'win32') {
        fs.chmod(adb, 0o755, () => console.log('[ADB] chmod applied to:', adb));
    }
    return adb;
}

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

function registerIPC() {
    ipcMain.handle('execute-adb-command', async (_e, cmd) => {
        console.log('[ADB] execute command:', cmd);
        return new Promise(async (res, rej) => {
            const adb = await getAdbPath();
            exec(`"${adb}" ${cmd}`, (err, out, errOut) => {
                if (err) {
                    console.log('[ADB] command error:', err);
                    return rej(err.message);
                }
                return res(out || errOut);
            });
        });
    });

    ipcMain.handle('test-adb-path', async (_e, adbPath) => {
        console.log('[ADB] Testing ADB path:', adbPath);
        return new Promise((resolve) => {
            exec(`"${adbPath}" version`, { timeout: 5000 }, (err, out) => {
                if (err) {
                    console.log('[ADB] Test failed:', err.message);
                    resolve({ success: false, error: err.message });
                } else {
                    const versionMatch = out.match(/Android Debug Bridge version (\d+\.\d+\.\d+)/);
                    const version = versionMatch ? versionMatch[1] : '未知版本';
                    console.log('[ADB] Test successful, version:', version);
                    resolve({ success: true, version, fullOutput: out.trim() });
                }
            });
        });
    });

    ipcMain.handle('get-adb-info', async () => {
        const config = await readConfig();
        const adbPath = await getAdbPath();
        const isCustom = config.custom_adb_path && config.custom_adb_path === adbPath;

        const testResult = await new Promise((resolve) => {
            exec(`"${adbPath}" version`, { timeout: 5000 }, (err, out) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    const versionMatch = out.match(/Android Debug Bridge version (\d+\.\d+\.\d+)/);
                    const version = versionMatch ? versionMatch[1] : '未知版本';
                    resolve({ success: true, version });
                }
            });
        });

        return {
            isCustom,
            path: adbPath,
            version: testResult.success ? testResult.version : '版本檢測失敗'
        };
    });

    ipcMain.handle('get-helper-dex-path', () => {
        const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
        const dexPath = path.join(base, 'adb', 'helper.dex');
        console.log('[ADB] Helper DEX path:', dexPath);
        return dexPath;
    });

    ipcMain.handle('restart-adb-tracking', async () => {
        console.log('[ADB] Restarting ADB tracking due to path change');
        stopAdbTracking();
        setTimeout(() => startAdbTracking(), 1000);
        return { success: true };
    });
}

module.exports = {
    initADB, getAdbPath, startAdbTracking, stopAdbTracking,
    setMainWindow, registerIPC
};
