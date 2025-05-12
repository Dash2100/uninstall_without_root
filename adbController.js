const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let adbPath = '';

// 設定 ADB 路徑
function setAdbPath(path) {
    adbPath = path;
    console.log('[ADBController] ADB 路徑已設定為:', path);
}

// 檢查 ADB 是否存在且可執行
function checkAdb() {
    return new Promise((resolve, reject) => {
        if (!adbPath) {
            reject(new Error('ADB 路徑未設定'));
            return;
        }

        // 檢查文件是否存在
        if (!fs.existsSync(adbPath)) {
            reject(new Error(`ADB 執行檔案不存在: ${adbPath}`));
            return;
        }

        // 在非 Windows 平台檢查執行權限
        if (os.platform() !== 'win32') {
            try {
                fs.accessSync(adbPath, fs.constants.X_OK);
            } catch (error) {
                reject(new Error(`ADB 檔案沒有執行權限: ${error.message}`));
                return;
            }
        }

        // 嘗試執行 ADB 版本命令
        exec(`"${adbPath}" version`, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`ADB 執行測試失敗: ${error.message}`));
                return;
            }
            resolve(stdout);
        });
    });
}

// 設定 ADB 權限
function setAdbPermission() {
    return new Promise((resolve, reject) => {
        if (os.platform() === 'win32') {
            // Windows 不需要設定權限
            resolve(true);
            return;
        }

        // 非 Windows 平台
        try {
            fs.chmodSync(adbPath, '755');
            resolve(true);
        } catch (error) {
            console.error('[ADBController] 設定權限失敗:', error);

            // 使用子進程嘗試設定權限
            exec(`chmod 755 "${adbPath}"`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`設定權限失敗: ${error.message}`));
                } else {
                    resolve(true);
                }
            });
        }
    });
}

// 執行 ADB 命令
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        if (!adbPath) {
            reject(new Error('ADB 路徑未設定'));
            return;
        }

        const fullCommand = `"${adbPath}" ${command}`;
        console.log('[ADBController] 執行命令:', fullCommand);

        exec(fullCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`[ADBController] 命令執行錯誤:`, error);
                reject(error.message);
                return;
            }

            if (stderr) {
                console.error(`[ADBController] stderr: ${stderr}`);
            }

            resolve(stdout);
        });
    });
}

// 獲取已連接的設備
function getConnectedDevices() {
    return executeCommand('devices')
        .then(output => {
            const lines = output.trim().split('\n');
            const deviceLines = lines.slice(1).filter(line => line.trim() !== '');

            return deviceLines.map(line => {
                const parts = line.trim().split('\t');
                return {
                    id: parts[0],
                    status: parts[1]
                };
            });
        });
}

// 獲取應用程式列表
function getAppList() {
    return executeCommand('shell pm list packages -f')
        .then(output => {
            const lines = output.trim().split('\n');

            const appsDict = {
                apps: {
                    user: {},
                    system: {}
                }
            };

            lines.forEach(line => {
                const lastEqualsIndex = line.lastIndexOf('=');

                if (lastEqualsIndex !== -1) {
                    const packageName = line.substring(lastEqualsIndex + 1);
                    const apkPath = line.substring(8, lastEqualsIndex);

                    const isUserApp = line.includes('/data/app/') || line.includes('/data/user/');

                    if (isUserApp) {
                        appsDict.apps.user[packageName] = {
                            package_name: packageName,
                            app_path: apkPath
                        };
                    } else {
                        appsDict.apps.system[packageName] = {
                            package_name: packageName,
                            app_path: apkPath
                        };
                    }
                } else if (line.trim()) {
                    const packageName = line.replace('package:', '').trim();
                    appsDict.apps.system[packageName] = {
                        package_name: packageName,
                        app_path: ""
                    };
                }
            });

            return appsDict;
        });
}

// 卸載應用程式
function uninstallApp(packageName) {
    return executeCommand(`shell pm uninstall -k --user 0 ${packageName}`);
}

// 停用應用程式
function disableApp(packageName) {
    return executeCommand(`shell pm disable-user --user 0 ${packageName}`);
}

// 啟用應用程式
function enableApp(packageName) {
    return executeCommand(`shell pm enable --user 0 ${packageName}`);
}

// 提取 APK
function extractApk(packageName, outputPath) {
    // 首先獲取應用的 APK 路徑
    return executeCommand(`shell pm path ${packageName}`)
        .then(output => {
            const apkPath = output.trim().replace('package:', '');
            if (!apkPath) {
                throw new Error(`找不到應用程式 ${packageName} 的 APK 路徑`);
            }

            // 使用 pull 命令提取 APK
            return executeCommand(`pull ${apkPath} "${outputPath}"`);
        });
}

// 導出模組
module.exports = {
    setAdbPath,
    checkAdb,
    setAdbPermission,
    executeCommand,
    getConnectedDevices,
    getAppList,
    uninstallApp,
    disableApp,
    enableApp,
    extractApk
};