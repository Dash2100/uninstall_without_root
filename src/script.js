const dialogConfirmUninstall = document.querySelector(".dialog-confirm-uninstall");
const dialogWarning = document.querySelector(".dialog-warning");
const dialogAppInfo = document.querySelector(".dialog-appinfo");
const dialogDeleteApp = document.querySelector(".dialog-delete-app");

const snackbarDisconnected = document.querySelector(".snackbar-disconnected");
const snackbarConnected = document.querySelector(".snackbar-connected");
const snackbarDeviceId = document.querySelector("#snackbar-device-id");

const pages = {
    appList: document.getElementById('appList'),
    settings: document.getElementById('settings'),
    about: document.getElementById('about')
};

function switchPage(pageId) {
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

const initApp = () => {
    // init pqage
    switchPage('appList');

    // 免責聲明
    // dialogWarning.open = true;

    // Test dialog - can be removed in production
    // dialogDeleteApp.open = true; 
};