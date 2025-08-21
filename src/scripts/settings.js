// Select settings elements
const settingsEls = {
    darkMode: document.getElementById('settings-darkmode'),
    appData: document.getElementById('settings-appdata'),
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
};

// Load configuration and update UI
async function loadConfig() {
    const { darkmode, delete_data, debug_mode, extract_path, theme_color } =
        await window.getConfig();
    console.log('[config] Loaded config:', { darkmode, delete_data, debug_mode, extract_path, theme_color });

    settingsEls.darkMode.checked = darkmode;
    settingsEls.appData.checked = delete_data;
    settingsEls.debugMode.checked = debug_mode;

    // Update extract path display based on debug mode
    const pathLength = debug_mode ? 12 : 35;
    settingsEls.extractPathText.innerText = truncateFilePath(extract_path, pathLength);

    // Load saved color or use default
    const savedColor = theme_color || '#6750A4';
    settingsEls.colorPicker.value = savedColor;
    applyColorScheme(savedColor);

    document.body.classList.toggle('mdui-theme-dark', darkmode);
    toggleTerminal(debug_mode);

    // Load ADB info
    loadAdbInfo();
}

// Update extract path display based on debug mode
async function updateExtractPathDisplay() {
    try {
        const config = await window.getConfig();
        const pathLength = config.debug_mode ? 12 : 35;
        settingsEls.extractPathText.innerText = truncateFilePath(config.extract_path, pathLength);
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

settingsEls.appData.addEventListener('change', (e) => {
    updateConfig('delete_data', e.target.checked);
});

settingsEls.debugMode.addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateConfig('debug_mode', checked).then(() => {
        toggleTerminal(checked);
        loadAdbInfo();
        updateExtractPathDisplay();
    });
});

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

            const config = await window.getConfig();
            const pathLength = config.debug_mode ? 12 : 35;
            settingsEls.extractPathText.innerText = truncateFilePath(selected, pathLength);
        }
    } catch (err) {
        console.error('Error selecting folder:', err);
    }
});

// Reset settings
settingsEls.resetButton.addEventListener('click', () => {
    showQuestionDialog({
        title: '確定要重置設定?',
        description: '所有設定將會恢復為預設值',
        acceptText: '清除',
        denyText: '取消',
        onAccept: () => {
            window.resetConfig().then(() => {
                loadConfig();
                showSnackAlert('設定已重置為預設值');
            });
        },
    });
});

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
            const config = await window.getConfig();
            const pathLength = config.debug_mode ? 12 : 35;
            settingsEls.adbInfo.textContent = `自訂版本 ${adbInfo.version} - ${truncateFilePath(adbInfo.path, pathLength)}`;
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
                const config = await window.getConfig();
                const pathLength = config.debug_mode ? 12 : 35;
                settingsEls.adbInfo.textContent = `自訂版本 ${testResult.version} - ${truncateFilePath(selectedPath, pathLength)}`;
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    // Ensure reset button is properly bound after DOM is loaded
    const resetColorBtn = document.getElementById('settings-reset-color');
    if (resetColorBtn) {
        resetColorBtn.addEventListener('click', () => {
            const defaultColor = '#6750A4';
            settingsEls.colorPicker.value = defaultColor;
            updateConfig('theme_color', defaultColor);
            applyColorScheme(defaultColor);
        });
    }

    // ADB event listeners
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
});