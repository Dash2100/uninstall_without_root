const dialogConfirmUninstall = document.querySelector(".dialog-confirm-uninstall");
const dialogWarning = document.querySelector(".dialog-warning");
const dialogAppInfo = document.querySelector(".dialog-appinfo");
const dialogDeleteApp = document.querySelector(".dialog-delete-app");
const dialogADBResponse = document.querySelector(".dialog-adb-response");

const floatingPill = document.getElementsByClassName('floating-pill')[0];

// icon
const iconConnected = document.getElementById('icon-connected');
const iconDisconnected = document.getElementById('icon-disconnected');

// states
let appLang = "zh";
let isConnected = false;

// pages
const pages = {
    appList: document.getElementById('appList'),
    settings: document.getElementById('settings'),
    about: document.getElementById('about')
};

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

// UI
const createAppCard = (app, appType) => {
    const templateHTML = document.getElementById('app-card-template').innerHTML;

    const cardHTML = templateHTML
        .replace('{{app.name}}', app.package_name)
        .replace('{{app.type}}', appType);

    const template = document.createElement('template');
    template.innerHTML = cardHTML.trim();

    return template.content.firstChild;
};

const updateAppList = (apps) => {
    const appListContainer = document.getElementById('app_list');

    const fragment = document.createDocumentFragment();

    const userApps = apps.apps.user || {};
    Object.values(userApps).forEach(app => {
        fragment.appendChild(createAppCard(app, '使用者程式'));
    });

    const systemApps = apps.apps.system || {};
    Object.values(systemApps).forEach(app => {
        fragment.appendChild(createAppCard(app, '系統程式'));
    });

    appListContainer.innerHTML = '';
    appListContainer.appendChild(fragment);
};

const getDevice = () => {
    // state
    isConnected = false;

    // get current devices
    iconConnected.classList.add('hidden');
    iconDisconnected.classList.remove('hidden');

    const devices = window.executeAdbCommand('devices');
    devices.then((response) => {
        console.log('[adb] Response:', response);
        if (response.includes('List of devices attached')) {
            const lines = response.trim().split('\n');
            const deviceLines = lines.slice(1).filter(line => line.trim() !== '');

            // 如果沒有設備連著
            if (deviceLines.length === 0) {
                showSnackAlert("目前沒有連接到設備");
                return;
            }

            const connectedDevices = deviceLines.map(line => {
                const parts = line.trim().split('\t');
                return {
                    id: parts[0],
                    status: parts[1]
                };
            });

            const deviceId = connectedDevices[0].id; // 取得第一個設備的 ID
            const deviceStatus = connectedDevices[0].status;

            if (deviceStatus !== "device") {
                showSnackAlert("連接到設備: " + deviceId + " 失敗，目前狀態: " + deviceStatus);
                return;
            }

            // connected successfully
            showSnackAlert("已連接到設備: " + deviceId);

            isConnected = true; // state

            iconConnected.classList.remove('hidden');
            iconDisconnected.classList.add('hidden');

        } else {
            throw new Error('No devices connected');
        }
    }).catch((error) => {
        console.error('[adb] Error:', error);
        alert("ADB 初始化失敗: " + error);
    });
}

const getAppList = () => {
    // check state
    if (!isConnected) {
        showSnackAlert("請先連接到設備");
        return;
    }

    // 獲取應用列表
    return window.executeAdbCommand('shell pm list packages -f')
        .then((response) => {
            const lines = response.trim().split('\n');

            // object struct
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

                    const isUserApp = line.includes('/data/app/') ||
                        line.includes('/data/user/');

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

            console.log('[adb] Apps Dictionary:', appsDict);
            updateAppList(appsDict);
        })
        .catch((error) => {
            console.error('[adb] Get App List Error:', error);
            // clear app list
            const appListContainer = document.getElementById('app_list');
            appListContainer.innerHTML = '';

            // show error message
            showSnackAlert("獲取應用列表失敗: " + error);
        });
};


const initApp = () => {
    // 初始化頁面
    switchPage('appList');

    // 免責聲明
    // dialogWarning.open = true;

    // 取得設備
    // getDevice();
};