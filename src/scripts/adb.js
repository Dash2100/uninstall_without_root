const runADBcommand = (command) => {
    const ADBResponse = window.executeAdbCommand(command);

    console.log('[adb] ADB command:', command);

    // append command to terminal
    appendToTerminal(`> ${command}`, 'command');

    // Return the Promise so it can be chained
    return ADBResponse
        .then((response) => {
            // console.log('[adb] ADB response:', response);

            if (response) {
                appendToTerminal(response, 'response');
            } else {
                appendToTerminal('(No output)', 'response');
            }

            return response;
        })
        .catch((error) => {
            console.error('[adb] ADB error:', error);
            appendToTerminal(error, 'error');

            return Promise.reject(error);
        });
}

const deleteAPP = (packageName, deleteData = false) => {
    const command = `shell pm uninstall --user 0 ${deleteData ? '-k ' : ''}${packageName}`;

    return runADBcommand(command)
        .then((response) => {
            if (response.includes('Success')) {
                appendToTerminal(`App ${packageName} uninstalled successfully.`, 'success');
                return true; // 返回成功狀態
            } else {
                appendToTerminal(`Failed to uninstall app ${packageName}.`, 'error');
                return false; // 返回失敗狀態
            }
        })
        .catch((error) => {
            appendToTerminal(`Error uninstalling app ${packageName}: ${error}`, 'error');
            return Promise.reject(error);
        });
}

// 啟用應用程式函數
const enableAPP = (packageName) => {
    const command = `shell pm enable --user 0 ${packageName}`;

    return runADBcommand(command)
        .then((response) => {
            if (response.includes('new state: enabled')) {
                appendToTerminal(`App ${packageName} enabled successfully.`, 'success');
                return true;
            } else {
                appendToTerminal(`Failed to enable app ${packageName}.`, 'error');
                return false;
            }
        })
        .catch((error) => {
            appendToTerminal(`Error enabling app ${packageName}: ${error}`, 'error');
            return Promise.reject(error);
        });
}

// 停用應用程式函數
const disableAPP = (packageName) => {
    const command = `shell pm disable-user --user 0 ${packageName}`;

    return runADBcommand(command)
        .then((response) => {
            if (response.includes('new state: disabled')) {
                appendToTerminal(`App ${packageName} disabled successfully.`, 'success');
                return true;
            } else {
                appendToTerminal(`Failed to disable app ${packageName}.`, 'error');
                return false;
            }
        })
        .catch((error) => {
            appendToTerminal(`Error disabling app ${packageName}: ${error}`, 'error');
            return Promise.reject(error);
        });
}

const checkAPK = () => {
    return window.renameAndMoveApk()
        .then((response) => {
            // 處理回傳值，確保它是一個 JSON 字符串或物件
            try {
                const resp = typeof response === 'string' ? JSON.parse(response) : response;

                if (resp.error) {
                    return "error";
                } else if (resp.state) {
                    return "done";
                } else {
                    return "not found";
                }
            } catch (error) {
                console.error("解析 APK 檢查回傳值失敗:", error);
                return "error";
            }
        })
        .catch(error => {
            console.error("檢查 APK 出錯:", error);
            return "error";
        });
}

const pullingCheckAPK = (packageName, targetPath) => {
    const maxRetries = 10;
    let attempts = 0;

    return new Promise((resolve, reject) => {
        const checkFile = () => {
            window.checkFileExists(targetPath)
                .then((exists) => {
                    if (exists) {
                        appendToTerminal(`APK ${packageName} 已成功提取到 ${targetPath}`, 'success');
                        resolve(true);
                    } else {
                        attempts++;
                        if (attempts < maxRetries) {
                            appendToTerminal(`檢查 APK 中...（${attempts}/${maxRetries}）`, 'info');
                            setTimeout(checkFile, 1000); // 每秒檢查一次
                        } else {
                            appendToTerminal(`提取 APK ${packageName} 超時`, 'error');
                            reject('提取超時，請重試');
                        }
                    }
                })
                .catch((error) => {
                    appendToTerminal(`檢查文件存在時出錯: ${error}`, 'error');
                    reject(error);
                });
        };

        // 開始檢查
        checkFile();
    });
}

// 提取應用程式 APK 函數
const extractAPK = (packageName, extractPath) => {
    const systemAPKPath = appsList.apps.system[packageName];
    const userAPKPath = appsList.apps.user[packageName];
    let apkPath = systemAPKPath || userAPKPath;
    apkPath = apkPath.app_path;

    if (!apkPath) {
        appendToTerminal(`APK path for ${packageName} not found.`, 'error');
        return Promise.reject(`APK 路徑 ${packageName} 未找到`);
    }

    return window.getTempFolderPath().then((tempPath) => {
        // format temp folder first
        return window.formatTempFolder()
            .then(() => {
                const targetFileName = `${packageName}.apk`;
                const targetPath = path.join(tempPath, targetFileName);

                // 執行 adb pull 命令
                const command = `pull "${apkPath}" "${targetPath}"`;
                appendToTerminal(`提取 APK 中: ${packageName}`, 'info');

                return runADBcommand(command)
                    .then(() => {
                        // 不管 pull 命令是否有輸出，都啟動輪詢檢查
                        appendToTerminal(`開始檢查 APK 是否已提取...`, 'info');
                        return pullingCheckAPK(packageName, targetPath);
                    })
                    .then((success) => {
                        if (success) {
                            return window.renameAndMoveApk()
                                .then((response) => {
                                    try {
                                        // 確認回傳值是否為字符串，若是則嘗試解析JSON
                                        const resp = typeof response === 'string' ? JSON.parse(response) : response;

                                        if (resp.error) {
                                            appendToTerminal(`移動 APK 時出錯: ${resp.message || '未知錯誤'}`, 'error');
                                            return Promise.reject("移動 APK 時出錯");
                                        }
                                        appendToTerminal(`APK 已成功提取並處理`, 'success');
                                        return true;
                                    } catch (error) {
                                        appendToTerminal(`處理 APK 回傳值時出錯: ${error}`, 'error');
                                        return Promise.reject(`解析回傳值失敗: ${error.message}`);
                                    }
                                });
                        } else {
                            return false;
                        }
                    })
                    .catch((error) => {
                        appendToTerminal(`Error extracting APK ${packageName}: ${error}`, 'error');
                        return Promise.reject(error);
                    });
            })
            .catch((error) => {
                appendToTerminal(`Error formatting temp folder: ${error}`, 'error');
                return Promise.reject(error);
            });
    }).catch((error) => {
        appendToTerminal(`Error getting temp folder path: ${error}`, 'error');
        return Promise.reject(error);
    });
}