// Select settings elements
const settingsEls = {
    darkMode: document.getElementById('settings-darkmode'),
    appData: document.getElementById('settings-appdata'),
    debugMode: document.getElementById('settings-debugmode'),
    chAPKPath: document.getElementById('settings-chapkpath'),
    openAPKPath: document.getElementById('settings-openpath'),
    extractPathText: document.getElementById('settings-extract-path'),
    resetButton: document.getElementById('settings-reset'),
};

// Load configuration and update UI
async function loadConfig() {
    const { darkmode, delete_data, debug_mode, extract_path } =
        await window.getConfig();
    console.log('[config] Loaded config:', { darkmode, delete_data, debug_mode, extract_path });

    settingsEls.darkMode.checked = darkmode;
    settingsEls.appData.checked = delete_data;
    settingsEls.debugMode.checked = debug_mode;
    settingsEls.extractPathText.innerText = truncateFilePath(extract_path, 35);

    document.body.classList.toggle('mdui-theme-dark', darkmode);
    toggleTerminal(debug_mode);
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
    updateConfig('debug_mode', checked).then(() => toggleTerminal(checked));
});

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

// Initialize
document.addEventListener('DOMContentLoaded', () => loadConfig());