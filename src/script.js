const dialogConfirmUninstall = document.querySelector(".dialog-confirm-uninstall");
const dialogWarning = document.querySelector(".dialog-warning");
const dialogAppInfo = document.querySelector(".dialog-appinfo");
const dialogDeleteApp = document.querySelector(".dialog-delete-app");
const dialogADBResponse = document.querySelector(".dialog-adb-response");

const snackbarDisconnected = document.querySelector(".snackbar-disconnected");
const snackbarConnected = document.querySelector(".snackbar-connected");

const snackbarDeviceId = document.querySelector("#snackbar-device-id");

// settings
const settingsLanguage = document.getElementById('settings-language');
const settingsDarkMode = document.getElementById('settings-darkmode');

const pages = {
    appList: document.getElementById('appList'),
    settings: document.getElementById('settings'),
    about: document.getElementById('about')
};

let appLang = "zh";

const switchPage = (pageId) => {
    const currentPage = document.querySelector('.page.active');
    const newPage = document.getElementById(pageId);

    if (currentPage === newPage) return;

    if (currentPage) {
        currentPage.classList.remove('active');
    }

    newPage.classList.add('active');
    const navigationBar = document.querySelector('mdui-navigation-bar');

    if (pageId === 'appList') {
        navigationBar.value = 'apps';
    } else {
        navigationBar.value = pageId;
    }
}

const uninstallApp = (appId) => {
    dialogDeleteApp.open = true;
};

// settings

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

settingsDarkMode.addEventListener('change', (event) => {
    document.body.classList.toggle('mdui-theme-dark');
});

const initApp = () => {
    // init pqage
    switchPage('appList');

    // 免責聲明
    // dialogWarning.open = true;

    dialogADBResponse.open = true;
};