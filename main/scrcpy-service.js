const { app, ipcMain } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { readConfig } = require('./config');

let scrcpyProcess = null;

function getMainWindow() {
    return global.mainWindow || null;
}

async function getScrcpyPath() {
    const config = await readConfig();
    if (config.custom_scrcpy_path) {
        try {
            await fs.promises.access(config.custom_scrcpy_path);
            console.log('[Scrcpy] Using custom path:', config.custom_scrcpy_path);
            return config.custom_scrcpy_path;
        } catch {
            console.log('[Scrcpy] Custom path not accessible, falling back to built-in');
        }
    }
    const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
    
    let builtinPath;
    if (os.platform() === 'win32') {
        builtinPath = path.join(base, 'scrcpy', 'win-x64', 'scrcpy.exe');
    } else if (os.platform() === 'darwin') {
        builtinPath = path.join(base, 'scrcpy', 'mac-arm64', 'scrcpy');
    } else if (os.platform() === 'linux') {
        builtinPath = path.join(base, 'scrcpy', 'linux-x64', 'scrcpy');
    } else {
        builtinPath = path.join(base, 'scrcpy', 'scrcpy');
    }

    if (os.platform() !== 'win32') {
        try {
            fs.chmodSync(builtinPath, 0o755);
        } catch (e) {
            // Ignore if we can't chmod
        }
    }
    return builtinPath;
}

function killScrcpy() {
    if (scrcpyProcess) {
        scrcpyProcess.kill();
        scrcpyProcess = null;
    }
}

function registerIPC() {
    ipcMain.handle('start-scrcpy', async (_e, serial) => {
        console.log('[Scrcpy] Starting scrcpy for device:', serial);

        if (scrcpyProcess) {
            console.log('[Scrcpy] Already running, killing previous instance');
            scrcpyProcess.kill();
            scrcpyProcess = null;
        }

        const scrcpyPath = await getScrcpyPath();
        console.log('[Scrcpy] Scrcpy path:', scrcpyPath);

        try {
            await fs.promises.access(scrcpyPath);
        } catch {
            console.error('[Scrcpy] scrcpy executable not found at:', scrcpyPath);
            return { success: false, error: `找不到 scrcpy 執行檔: ${scrcpyPath}` };
        }

        const args = ['-s', serial, '--window-title', 'Scrcpy Mirror'];

        return new Promise((resolve) => {
            scrcpyProcess = spawn(scrcpyPath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: path.dirname(scrcpyPath)
            });

            let resolved = false;

            function resolveOnce(result) {
                if (!resolved) {
                    resolved = true;
                    resolve(result);
                }
            }

            function notifyStopped() {
                scrcpyProcess = null;
                const mainWindow = getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scrcpy-stopped');
                }
            }

            scrcpyProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                console.log('[Scrcpy] stderr:', msg);
                if (!resolved && msg.includes('INFO')) {
                    resolveOnce({ success: true, pid: scrcpyProcess.pid });
                }
            });

            scrcpyProcess.stdout.on('data', (data) => {
                console.log('[Scrcpy] stdout:', data.toString());
            });

            scrcpyProcess.on('error', (err) => {
                console.error('[Scrcpy] Error:', err);
                resolveOnce({ success: false, error: err.message });
                notifyStopped();
            });

            scrcpyProcess.on('close', (code) => {
                console.log('[Scrcpy] Process closed with code:', code);
                resolveOnce({ success: false, error: `Process exited with code ${code}` });
                notifyStopped();
            });

            setTimeout(() => {
                if (!resolved && scrcpyProcess) {
                    resolveOnce({ success: true, pid: scrcpyProcess.pid });
                }
            }, 3000);
        });
    });

    ipcMain.handle('stop-scrcpy', () => {
        console.log('[Scrcpy] Stopping scrcpy');
        if (scrcpyProcess) {
            scrcpyProcess.kill();
            scrcpyProcess = null;
            return { success: true };
        }
        return { success: false, error: 'No scrcpy process running' };
    });

    ipcMain.handle('is-scrcpy-running', () => {
        return scrcpyProcess !== null;
    });

    ipcMain.handle('get-scrcpy-info', async () => {
        const config = await readConfig();
        const scrcpyPath = await getScrcpyPath();
        const isCustom = config.custom_scrcpy_path && config.custom_scrcpy_path === scrcpyPath;

        const testResult = await new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(`"${scrcpyPath}" --version`, { timeout: 5000 }, (err, out) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    const versionMatch = out.match(/scrcpy (\d+\.\d+[\.\d]*)/);
                    const version = versionMatch ? versionMatch[1] : '未知版本';
                    resolve({ success: true, version });
                }
            });
        });

        return {
            path: scrcpyPath,
            isCustom,
            version: testResult.success ? testResult.version : '未知',
            error: testResult.error
        };
    });
}

module.exports = { killScrcpy, registerIPC };
