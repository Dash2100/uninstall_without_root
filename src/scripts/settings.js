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
        }
    });
}

// function updateConfig() {

// }

// language
settingsLanguage.addEventListener('change', (event) => {
    const selectedLanguage = event.target.value;

    if (selectedLanguage === "") {
        setTimeout(() => {
            settingsLanguage.value = appLang;
        }, 1);

        return;
    }
    appLang = selectedLanguage;
});


// darkmode
settingsDarkMode.addEventListener('change', (event) => {
    const checked = event.target.checked;

    if (checked) {
        document.body.classList.add('mdui-theme-dark');
    } else {
        document.body.classList.remove('mdui-theme-dark');
    }
});

// appdata
settingsAppdata.addEventListener('change', (event) => {
    const checked = event.target.checked;

    console.log('Appdata toggle:', checked);
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
            console.log('用戶選擇的資料夾路徑:', selectedPath);

            let truncatePath = truncateFilePath(selectedPath, 30);

            settingsChAPKPathText.innerText = truncatePath;
        }
    } catch (err) {
        console.error('選擇文件時發生錯誤:', err);
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
            window.resetConfig();
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

loadConfig();