// settings
const settingsLanguage = document.getElementById('settings-language');
const settingsDarkMode = document.getElementById('settings-darkmode');

settingsLanguage.addEventListener('change', (event) => {
    const selectedLanguage = event.target.value;

    if (selectedLanguage === "") {
        setTimeout(() => {
            settingsLanguage.value = appLang;
        }, 1);

        return;
    }
    appLang = selectedLanguage;

    // 更新配置
    if (!appConfig.app) appConfig.app = {};
    appConfig.app.language = selectedLanguage;
    saveConfig();
});

settingsDarkMode.addEventListener('change', (event) => {
    const isDarkMode = event.target.checked;
    document.body.classList.toggle('mdui-theme-dark', isDarkMode);

    // 更新配置
    if (!appConfig.app) appConfig.app = {};
    appConfig.app.darkMode = isDarkMode;
    saveConfig();
});

const loadConfig = () => {
    if (window.electronAPI && window.electronAPI.getConfig) {
        window.electronAPI.getConfig()
            .then(config => {
                appConfig = config;
                console.log('[Config] 已載入配置:', appConfig);

                // 套用配置到 UI
                applyConfig();
            })
            .catch(err => {
                console.error('[Config] 載入配置失敗:', err);
            });
    }
};

const saveConfig = () => {
    // 儲存配置到後端
    if (window.electronAPI && window.electronAPI.saveConfig) {
        window.electronAPI.saveConfig(appConfig)
            .then(() => {
                console.log('[Config] 配置已儲存');
            })
            .catch(err => {
                console.error('[Config] 儲存配置失敗:', err);
            });
    }
};

const applyConfig = () => {
    if (appConfig.app && appConfig.app.language) {
        appLang = appConfig.app.language;
        if (settingsLanguage) {
            settingsLanguage.value = appLang;
        }
    }

    // 套用深色模式設定
    if (appConfig.app && appConfig.app.darkMode !== undefined) {
        if (appConfig.app.darkMode) {
            document.body.classList.add('mdui-theme-dark');
        } else {
            document.body.classList.remove('mdui-theme-dark');
        }

        if (settingsDarkMode) {
            settingsDarkMode.checked = appConfig.app.darkMode;
        }
    }
};