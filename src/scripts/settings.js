// Select settings elements
const settingsEls = {
    darkMode: document.getElementById('settings-darkmode'),
    debugMode: document.getElementById('settings-debugmode'),
    colorPicker: document.getElementById('settings-colorpicker'),
    resetColor: document.getElementById('settings-reset-color'),
    chAPKPath: document.getElementById('settings-chapkpath'),
    openAPKPath: document.getElementById('settings-openpath'),
    extractPathText: document.getElementById('settings-extract-path'),
    resetButton: document.getElementById('settings-reset'),
    adbInfo: document.getElementById('settings-adb-info'),
    adbSelect: document.getElementById('settings-adb-select'),
    adbReset: document.getElementById('settings-adb-reset'),
    adbDownload: document.getElementById('settings-adb-download'),
    scrcpyInfo: document.getElementById('settings-scrcpy-info'),
    scrcpySelect: document.getElementById('settings-scrcpy-select'),
    scrcpyReset: document.getElementById('settings-scrcpy-reset'),
    scrcpyDownload: document.getElementById('settings-scrcpy-download'),
};

// Load configuration and update UI
async function loadConfig() {
    const { darkmode, debug_mode, extract_path, theme_color } =
        await window.getConfig();
    const defaultConfig = await window.getDefaultConfig();
    console.log('[config] Loaded config:', { darkmode, debug_mode, extract_path, theme_color });

    settingsEls.darkMode.checked = darkmode;
    settingsEls.debugMode.checked = debug_mode;

    settingsEls.extractPathText.innerText = truncateFilePath(extract_path, 35);

    // Load saved color or use default
    const savedColor = theme_color || defaultConfig.theme_color;
    settingsEls.colorPicker.value = savedColor;
    applyColorScheme(savedColor);

    document.body.classList.toggle('mdui-theme-dark', darkmode);
    toggleTerminal(debug_mode);

    // Load ADB info
    loadAdbInfo();
}

// Update extract path display
async function updateExtractPathDisplay() {
    try {
        const config = await window.getConfig();
        settingsEls.extractPathText.innerText = truncateFilePath(config.extract_path, 35);
    } catch (error) {
        console.error('Error updating extract path display:', error);
    }
}

// Update a config key
const updateConfig = (key, value) =>
    window.setConfig(key, value).then((cfg) => {
        console.log('[config] Updated config:', cfg);
        return cfg;
    });

settingsEls.darkMode.addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateConfig('darkmode', checked);
    document.body.classList.toggle('mdui-theme-dark', checked);
});


settingsEls.debugMode.addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateConfig('debug_mode', checked).then(() => {
        toggleTerminal(checked);
    });
});

// Uncheck debug mode toggle when terminal window is closed manually
window.onTerminalWindowClosed = function () {
    settingsEls.debugMode.checked = false;
    updateConfig('debug_mode', false);
};

// Apply color scheme using MDUI
function applyColorScheme(color) {
    try {
        if (window.mdui?.setColorScheme) {
            window.mdui.setColorScheme(color);
        }
    } catch (error) {
        console.error('Error applying color scheme:', error);
    }
}

// Color picker real-time update events
settingsEls.colorPicker.addEventListener('input', (e) => {
    const color = e.target.value;
    applyColorScheme(color);
});

settingsEls.colorPicker.addEventListener('change', (e) => {
    const color = e.target.value;
    updateConfig('theme_color', color);
});

// Reset color to default (will be bound in DOMContentLoaded)
// Moved to DOMContentLoaded to ensure proper binding

// Change extract path
settingsEls.chAPKPath.addEventListener('click', async () => {
    try {
        const { canceled, filePaths } = await window.showOpenDialog({
            properties: ['openDirectory'],
            title: '選擇資料夾位置',
        });
        if (!canceled && filePaths.length) {
            const selected = filePaths[0];
            await updateConfig('extract_path', selected);
            settingsEls.extractPathText.innerText = truncateFilePath(selected, 35);
        }
    } catch (err) {
        console.error('Error selecting folder:', err);
    }
});

// End of selecting folder

settingsEls.openAPKPath.addEventListener('click', async () => {
    try {
        const extractPath = await window.getConfig().then(cfg => cfg.extract_path);
        if (extractPath) {
            const exists = await window.checkFileExists(extractPath);
            if (exists) {
                await window.openFilePath(extractPath);
            } else {
                showSnackAlert('提取路徑不存在，請先選擇一個有效的資料夾');
            }
        } else {
            showSnackAlert('提取路徑未設定，請先設定提取路徑');
        }
    } catch (err) {
        console.error('Error opening APK path:', err);
    }
});

// Truncate long file paths
function truncateFilePath(filePath, maxLength) {
    if (filePath.length <= maxLength) return filePath;
    const sep = filePath.includes('\\') ? '\\' : '/';
    const parts = filePath.split(sep);
    const ellipsis = '...';
    const half = Math.floor((maxLength - ellipsis.length) / 2);
    return filePath.slice(0, half) + ellipsis + filePath.slice(-half);
}

// Load ADB information
async function loadAdbInfo() {
    try {
        const adbInfo = await window.getAdbInfo();
        if (adbInfo.isCustom) {
            settingsEls.adbInfo.textContent = `自訂版本 ${adbInfo.version} - ${truncateFilePath(adbInfo.path, 35)}`;
        } else {
            settingsEls.adbInfo.textContent = `內建版本 ${adbInfo.version}`;
        }
    } catch (error) {
        console.error('Error loading ADB info:', error);
        settingsEls.adbInfo.textContent = '無法取得 ADB 資訊';
    }
}

// Select custom ADB file
async function selectAdbFile() {
    try {
        const { canceled, filePaths } = await window.showOpenDialog({
            properties: ['openFile'],
            title: '選擇 ADB 執行檔',
            filters: [
                { name: 'ADB 執行檔', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }
            ]
        });

        if (!canceled && filePaths.length) {
            const selectedPath = filePaths[0];
            settingsEls.adbInfo.textContent = '正在測試 ADB...';

            // Test the selected ADB
            const testResult = await window.testAdbPath(selectedPath);

            if (testResult.success) {
                // Save custom ADB path
                await updateConfig('custom_adb_path', selectedPath);
                settingsEls.adbInfo.textContent = `自訂版本 ${testResult.version} - ${truncateFilePath(selectedPath, 35)}`;
                showSnackAlert(`ADB 設定成功！版本：${testResult.version}`);

                try {
                    await window.restartAdbTracking();
                } catch (error) {
                    console.error('Error restarting ADB tracking:', error);
                }
            } else {
                settingsEls.adbInfo.textContent = '測試失敗，請重新選擇';
                showSnackAlert(`ADB 測試失敗：${testResult.error}`);

                setTimeout(() => loadAdbInfo(), 1000);
            }
        }
    } catch (error) {
        console.error('Error selecting ADB file:', error);
        showSnackAlert('選擇檔案時發生錯誤');
        loadAdbInfo();
    }
}

// Reset to built-in ADB
async function resetToBuiltinAdb() {
    try {
        await updateConfig('custom_adb_path', null);
        await loadAdbInfo();
        showSnackAlert('已恢復使用內建 ADB');

        try {
            await window.restartAdbTracking();
        } catch (error) {
            console.error('Error restarting ADB tracking:', error);
        }
    } catch (error) {
        console.error('Error resetting ADB:', error);
        showSnackAlert('重置 ADB 設定時發生錯誤');
    }
}

// Load Scrcpy information
async function loadScrcpyInfo() {
    try {
        const scrcpyInfo = await window.getScrcpyInfo();
        if (scrcpyInfo.isCustom) {
            settingsEls.scrcpyInfo.textContent = `自訂版本 ${scrcpyInfo.version} - ${truncateFilePath(scrcpyInfo.path, 30)}`;
        } else {
            settingsEls.scrcpyInfo.textContent = `內建版本 ${scrcpyInfo.version}`;
        }
    } catch (error) {
        console.error('Error loading scrcpy info:', error);
        settingsEls.scrcpyInfo.textContent = '無法取得 Scrcpy 資訊';
    }
}

// Select custom Scrcpy file
async function selectScrcpyFile() {
    try {
        const { canceled, filePaths } = await window.showOpenDialog({
            properties: ['openFile'],
            title: '選擇 Scrcpy 執行檔',
            filters: [
                { name: 'Scrcpy 執行檔', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }
            ]
        });

        if (!canceled && filePaths.length) {
            const selectedPath = filePaths[0];
            const exists = await window.checkFileExists(selectedPath);
            if (exists) {
                await updateConfig('custom_scrcpy_path', selectedPath);
                settingsEls.scrcpyInfo.textContent = `自訂版本 - ${truncateFilePath(selectedPath, 30)}`;
                showSnackAlert('Scrcpy 路徑設定成功！');
            } else {
                showSnackAlert('所選檔案不存在');
            }
        }
    } catch (error) {
        console.error('Error selecting Scrcpy file:', error);
        showSnackAlert('選擇檔案時發生錯誤');
    }
}

// Reset Scrcpy path
async function resetScrcpyPath() {
    try {
        await updateConfig('custom_scrcpy_path', null);
        settingsEls.scrcpyInfo.textContent = '使用內建版本';
        showSnackAlert('已恢復使用內建 Scrcpy');
    } catch (error) {
        console.error('Error resetting Scrcpy path:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    // Ensure reset button is properly bound after DOM is loaded
    const resetColorBtn = document.getElementById('settings-reset-color');
    if (resetColorBtn) {
        resetColorBtn.addEventListener('click', async () => {
            const defaultConfig = await window.getDefaultConfig();
            const defaultColor = defaultConfig.theme_color;
            settingsEls.colorPicker.value = defaultColor;
            updateConfig('theme_color', defaultColor);
            applyColorScheme(defaultColor);
        });
    }

    // ADB event listeners
    if (settingsEls.adbDownload) {
        settingsEls.adbDownload.addEventListener('click', async () => {
            const btn = settingsEls.adbDownload;
            btn.loading = true;
            settingsEls.adbInfo.textContent = '正在下載 ADB 最新版...';
            const res = await window.downloadAdb();
            btn.loading = false;
            if (res.success) {
                showSnackAlert('ADB 下載並設定成功！');
                await loadAdbInfo();
                try {
                    await window.restartAdbTracking();
                } catch (e) {
                    console.error('Error restarting ADB tracking:', e);
                }
            } else {
                showSnackAlert('ADB 下載失敗：' + res.error);
                loadAdbInfo();
            }
        });
    }

    if (settingsEls.adbSelect) {
        settingsEls.adbSelect.addEventListener('click', selectAdbFile);
    }

    if (settingsEls.adbReset) {
        settingsEls.adbReset.addEventListener('click', () => {
            showQuestionDialog({
                title: '恢復內建 ADB',
                description: '確定要恢復使用內建的 ADB 版本嗎？',
                acceptText: '確定',
                denyText: '取消',
                onAccept: resetToBuiltinAdb,
            });
        });
    }

    // Reset all settings
    if (settingsEls.resetButton) {
        settingsEls.resetButton.addEventListener('click', () => {
            showQuestionDialog({
                title: '重置所有設定',
                description: '確定要將所有設定（包含外觀、儲存路徑、ADB/Scrcpy 版本）恢復為預設值嗎？',
                acceptText: '確定重置',
                denyText: '取消',
                onAccept: async () => {
                    await window.resetConfig();
                    await loadConfig();
                    await loadAdbInfo();
                    await loadScrcpyInfo();
                    applyColorScheme(settingsEls.colorPicker.value);
                    showSnackAlert('所有設定已恢復為預設值');
                    try {
                        await window.restartAdbTracking();
                    } catch (e) {
                        console.error('Error restarting ADB tracking:', e);
                    }
                }
            });
        });
    }

    // Scrcpy event listeners
    if (settingsEls.scrcpyDownload) {
        settingsEls.scrcpyDownload.addEventListener('click', async () => {
            const btn = settingsEls.scrcpyDownload;
            btn.loading = true;
            settingsEls.scrcpyInfo.textContent = '正在下載 Scrcpy 最新版...';
            const res = await window.downloadScrcpy();
            btn.loading = false;
            if (res.success) {
                showSnackAlert('Scrcpy 下載並設定成功！');
                await loadScrcpyInfo();
            } else {
                showSnackAlert('Scrcpy 下載失敗：' + res.error);
                loadScrcpyInfo();
            }
        });
    }

    if (settingsEls.scrcpySelect) {
        settingsEls.scrcpySelect.addEventListener('click', selectScrcpyFile);
    }

    if (settingsEls.scrcpyReset) {
        settingsEls.scrcpyReset.addEventListener('click', () => {
            showQuestionDialog({
                title: '恢復內建 Scrcpy',
                description: '確定要恢復使用內建的 Scrcpy 版本嗎？',
                acceptText: '確定',
                denyText: '取消',
                onAccept: resetScrcpyPath,
            });
        });
    }

    loadScrcpyInfo();
});