// settings
const settingsLanguage = document.getElementById('settings-language');
const settingsDarkMode = document.getElementById('settings-darkmode');
const settingsAppdata = document.getElementById('settings-appdata');
const settingsDebugMode = document.getElementById('settings-debugmode');
const settingsChAPKPath = document.getElementById('settings-chapkpath');
const settingsChAPKPathText = document.getElementById('settings-extract-path');
const resetSettingsButton = document.getElementById('settings-reset');

function loadConfig() {
    window.getConfig().then((response) => {
        const { language, darkmode, delete_data, debug_mode, extrect_path } = response;
        console.log('[config] Loaded config:', response);
        console.log(language, darkmode, delete_data, debug_mode, extrect_path);

        // update UI
        settingsLanguage.value = language;
        settingsDarkMode.checked = darkmode;
        settingsAppdata.checked = delete_data;
        settingsDebugMode.checked = debug_mode;
        settingsChAPKPathText.innerText = truncateFilePath(extrect_path, 30);

        // update theme
        if (!darkmode) {
            document.body.classList.remove('mdui-theme-dark');
        } else {
            document.body.classList.add('mdui-theme-dark');
        }

        // 如果啟用了調試模式，確保窗口大小正確
        if (debug_mode) {
            toggleTerminal(true);
        } else {
            toggleTerminal(false);
        }
    });
}

function updateConfig(key, value) {
    // 使用 window.updateConfig 而不是遞迴呼叫本地函數
    return window.setConfig(key, value).then((response) => {
        console.log('[config] Updated config:', response);
        return response;
    });
}

// language
settingsLanguage.addEventListener('change', (event) => {
    const selectedLanguage = event.target.value;

    if (selectedLanguage === "") {
        setTimeout(() => {
            settingsLanguage.value = appLang;
        }, 1);

        return;
    }
    updateConfig('language', selectedLanguage);
    appLang = selectedLanguage;
});


// darkmode
settingsDarkMode.addEventListener('change', (event) => {
    const checked = event.target.checked;

    updateConfig('darkmode', checked);

    if (checked) {
        document.body.classList.add('mdui-theme-dark');
    } else {
        document.body.classList.remove('mdui-theme-dark');
    }
});

// appdata
settingsAppdata.addEventListener('change', (event) => {
    const checked = event.target.checked;

    updateConfig('delete_data', checked);
});

// debug mode
settingsDebugMode.addEventListener('change', (event) => {
    const checked = event.target.checked;

    updateConfig('debug_mode', checked).then(() => {
        window.resizeWindow(checked).then(() => {
            toggleTerminal(checked);
        });
    });
});

settingsChAPKPath.addEventListener('click', async (event) => {
    try {
        // 選擇資料夾
        const result = await window.showOpenDialog({ // 直接使用 Node.js 整合的 API
            properties: ['openDirectory'],
            title: '選擇資料夾位置'
        });

        // 檢查用戶是否選擇了資料夾
        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];

            updateConfig('extrect_path', selectedPath);

            let truncatePath = truncateFilePath(selectedPath, 30);

            settingsChAPKPathText.innerText = truncatePath;
        }
    } catch (err) {
        console.error('Error selecting folder:', err);
    }
});

// clear settings
resetSettingsButton.addEventListener('click', () => {
    showQuestionDialog({
        title: '確定要重置設定?',
        description: '所有設定將會恢復為預設值',
        acceptText: '清除',
        denyText: '取消',
        onAccept: () => {
            window.resetConfig().then(() => {
                // 重置後調整窗口大小 (因為默認為非調試模式)
                window.resizeWindow(false);
                loadConfig();
                showSnackAlert("設定已重置為預設值");
            });
        }
    });
});

// file path truncation
function truncateFilePath(filePath, maxLength) {
    if (filePath.length <= maxLength) {
        return filePath;
    }

    const isWindows = filePath.includes('\\');
    const separator = isWindows ? '\\' : '/';

    const lastSeparatorIndex = filePath.lastIndexOf(separator);
    const lastSegment = lastSeparatorIndex !== -1 ? filePath.substring(lastSeparatorIndex) : '';

    let beginLength = isWindows ? filePath.indexOf(':\\') + 2 : 1;

    const firstSeparatorAfterRoot = filePath.indexOf(separator, beginLength);
    if (firstSeparatorAfterRoot !== -1) {
        beginLength = firstSeparatorAfterRoot + 1;
    }

    const endLength = lastSegment.length;
    const ellipsis = "...";

    if (beginLength + ellipsis.length + endLength >= maxLength) {
        const halfMax = Math.floor((maxLength - ellipsis.length) / 2);
        return filePath.substring(0, halfMax) + ellipsis +
            filePath.substring(filePath.length - halfMax);
    }

    const keepBeginning = filePath.substring(0, beginLength);
    const keepEnd = lastSegment;

    return keepBeginning + ellipsis + keepEnd;
}

// 當除錯模式開關狀態改變時
document.addEventListener('DOMContentLoaded', () => {
    const debugModeSwitch = document.getElementById('settings-debugmode');
    if (debugModeSwitch) {
        debugModeSwitch.addEventListener('change', (event) => {
            toggleTerminal(event.target.checked);
        });
    }
});

loadConfig();