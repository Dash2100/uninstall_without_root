const { app } = require("electron");

const appLoading = document.getElementById('app-loading');

const dialogConfirmUninstall = document.querySelector(".dialog-confirm-uninstall");
const dialogWarning = document.querySelector(".dialog-warning");
const dialogAppInfo = document.querySelector(".dialog-appinfo");
const dialogDeleteApp = document.querySelector(".dialog-delete-app");

// icon
const iconConnected = document.getElementById('icon-connected');
const iconDisconnected = document.getElementById('icon-disconnected');

// button
const buttonApplistRefresh = document.getElementById('button-applist-refresh');

// applist container
const appListContainer = document.getElementById('app-list-content');
const appListLoadingPlaceholder = document.getElementById('app-list-loading');
const appListConnectPlaceholder = document.getElementById('app-list-disconnected');

// applist holder
const appListHolder = document.getElementById('app-list-holder');
const appListLoading = document.getElementById('app-list-loading');

// search
const searchInput = document.getElementById('search-input');

// ==================== Local States ====================
let isConnected = false;
let appsList = [];
let appsDisabled = [];

// ===================== UI Functions ====================
const createAppCard = (app, appType) => {
    const templateHTML = document.getElementById('app-card-template').innerHTML;

    // 確定應用是否啟用
    const isEnabled = !appsDisabled.includes(app.package_name);
    const status = isEnabled ? "啟用中" : "停用中";
    // 使用低飽和度的顏色
    const statusClass = isEnabled ? "bg-green-900 text-white" : "bg-red-900 text-white";

    const cardHTML = templateHTML
        .replaceAll('{{app.packageName}}', app.package_name)
        .replaceAll('{{app.type}}', appType)
        .replaceAll('{{app.status}}', status)
        .replaceAll('{{app.statusClass}}', statusClass);

    const template = document.createElement('template');

    template.innerHTML = cardHTML.trim();

    const card = template.content.firstChild;

    // 添加點擊事件監聽器
    card.addEventListener('click', () => {
        viewAppInfo(app.package_name);
    });

    return card;
};

const updateAppList = (apps) => {
    // 隱藏佔位元素
    appListLoadingPlaceholder.style.display = 'none';
    appListConnectPlaceholder.style.display = 'none';

    // 顯示內容區域
    appListContainer.style.display = 'block';

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

const clearAppList = () => {
    // 清除應用列表內容
    appListContainer.innerHTML = '';

    // 隱藏內容區域和載入中佔位元素
    appListContainer.style.display = 'none';
    appListLoadingPlaceholder.style.display = 'none';

    // 顯示連接裝置佔位元素
    appListConnectPlaceholder.style.display = 'flex';
}

const getDevice = () => {
    isConnected = false;

    // get current devices
    iconConnected.classList.add('hidden');
    iconDisconnected.classList.remove('hidden');

    runADBcommand('devices')
        .then(devices => {
            if (devices && devices.includes('List of devices attached')) {
                const lines = devices.trim().split('\n');
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

                const deviceId = connectedDevices[0].id; // 第一個設備 ID
                const deviceStatus = connectedDevices[0].status;

                if (deviceStatus !== "device") {
                    showSnackAlert("連接到設備: " + deviceId + " 失敗，目前狀態: " + deviceStatus);
                    clearAppList();
                    return;
                }

                // connected successfully
                showSnackAlert("已連接到設備: " + deviceId);

                isConnected = true; // state

                iconConnected.classList.remove('hidden');
                iconDisconnected.classList.add('hidden');

                // get app list
                getAppList();

                getDisabledApps();

            } else {
                clearAppList();
                showSnackAlert("無法連接到設備");
            }
        })
        .catch(error => {
            console.error('[adb] Get Device Error:', error);
            showSnackAlert("連接設備時發生錯誤");
            console.error(error);
        });
}

const getAppList = () => {
    // check state
    if (!isConnected) {
        showSnackAlert("請先連接到設備");
        return;
    }

    // 顯示載入中
    appListConnectPlaceholder.style.display = 'none';
    appListContainer.style.display = 'none';
    appListLoadingPlaceholder.style.display = 'flex';

    // 首先獲取已停用的應用列表
    return getDisabledApps()
        .then(() => {
            // 然後獲取應用列表
            return runADBcommand('shell pm list packages -f');
        })
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

            appsList = appsDict || {};

            //check search input
            const searchTerm = searchInput.value.trim().toLowerCase();
            // 根據搜尋內容決定顯示全部或過濾後的應用列表
            updateAppList(searchTerm ? filterAppsBySearchTerm(appsDict, searchTerm) : appsDict);
        })
        .catch((error) => {
            console.error('[adb] Get App List Error:', error);
            // clear app list
            appListContainer.innerHTML = '';

            // show error message
            showSnackAlert("獲取應用程式列表時發生錯誤");
            console.error(error);
        });
};

const getDisabledApps = () => {
    return runADBcommand('shell pm list packages -d')
        .then((response) => {
            const lines = response.trim().split('\n');
            appsDisabled = lines.map(line => line.replace('package:', '').trim());
        })
        .catch((error) => {
            console.error('[adb] Get Disabled Packages Error:', error);
            showSnackAlert("獲取「已停用的應用程式」時發生錯誤");
            console.error(error);
        });
};

const viewAppInfo = (packageName) => {
    runADBcommand(`shell dumpsys package ${packageName}`)
        .then((packageInfo) => {
            // 從 packageInfo 解析資訊
            const appData = parseAppInfo(packageInfo);

            // 是否啟用
            const isEnabled = !appsDisabled.includes(packageName);
            const enableStatus = isEnabled ? "啟用中" : "已停用";

            // 顯示應用資訊對話框
            createAndShowAppInfoDialog(packageName, appData.versionName, appData.versionCode,
                appData.lastUpdateTime, enableStatus, isEnabled);
        })
        .catch(error => {
            console.error('獲取應用資訊失敗:', error);

            // 使用預設值顯示對話框
            createAndShowAppInfoDialog(packageName || "未知應用", "未知", "未知", "未知", "未知", false);
        });
};

// 解析應用程式資訊
const parseAppInfo = (packageInfo) => {
    // 預設值
    let versionName = "未知";
    let versionCode = "未知";
    let lastUpdateTime = "未知";

    if (packageInfo) {
        // 解析版本資訊
        const versionNameRegex = /versionName=([^\s]+)/;
        const versionCodeRegex = /versionCode=([^\s]+)/;
        const versionNameMatch = packageInfo.match(versionNameRegex);
        const versionCodeMatch = packageInfo.match(versionCodeRegex);

        if (versionNameMatch && versionNameMatch[1]) {
            versionName = versionNameMatch[1];
        }
        if (versionCodeMatch && versionCodeMatch[1]) {
            versionCode = versionCodeMatch[1];
        }

        // 解析最後更新時間
        const lastUpdateRegex = /lastUpdateTime=([^\n]+)/;
        const lastUpdateMatch = packageInfo.match(lastUpdateRegex);
        if (lastUpdateMatch && lastUpdateMatch[1]) {
            lastUpdateTime = lastUpdateMatch[1];
        }
    }

    return { versionName, versionCode, lastUpdateTime };
};

// 創建並顯示應用程式資訊對話框
const createAndShowAppInfoDialog = (packageName, versionName, versionCode, lastUpdateTime, enableStatus, isEnabled) => {
    // 使用模板建立對話框
    const template = document.getElementById('app-info-template');
    const dialogContent = template.innerHTML
        .replaceAll('{{app.packageName}}', packageName)
        .replaceAll('{{app.version}}', `${versionName} (${versionCode})`)
        .replaceAll('{{app.latestUpdate}}', lastUpdateTime)
        .replaceAll('{{app.isEnable}}', enableStatus);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = dialogContent;

    // 獲取對話框元素
    const dialog = tempDiv.querySelector('.dialog-appinfo');

    // 添加到文檔中
    document.body.appendChild(dialog);

    // 添加對話框關閉時的事件處理
    dialog.addEventListener('close', () => {
        if (dialog.parentNode) {
            setTimeout(() => {
                dialog.parentNode.removeChild(dialog);
            }, 300);
        }
    });

    // 設置按鈕及其事件
    setupAppInfoDialogButtons(dialog, packageName, isEnabled);

    // 打開對話框
    setTimeout(() => {
        dialog.open = true;
    }, 1);
};

// 設置應用資訊對話框按鈕
const setupAppInfoDialogButtons = (dialog, packageName, isEnabled) => {
    // 獲取按鈕元素
    const enableButton = dialog.querySelector('mdui-button[icon="power_settings_new"]');
    const disableButton = dialog.querySelector('mdui-button[icon="power_off"]');
    const extractButton = dialog.querySelector('mdui-button[icon="download"]');
    const deleteButton = dialog.querySelector('mdui-button[icon="delete"]');

    // 根據應用狀態設置按鈕啟用/禁用
    enableButton.disabled = isEnabled;
    disableButton.disabled = !isEnabled;

    // 啟用按鈕事件
    enableButton.addEventListener('click', () => {
        enableApp(packageName, dialog);
    });

    // 停用按鈕事件
    disableButton.addEventListener('click', () => {
        disableApp(packageName, dialog);
    });

    // 提取APK按鈕事件
    extractButton.addEventListener('click', () => {
        downloadAPK(packageName);
    });

    // 刪除按鈕事件
    deleteButton.addEventListener('click', () => {
        showDeleteConfirmation(dialog, packageName);
    });
};

// 顯示刪除確認對話框
const showDeleteConfirmation = (currentDialog, packageName) => {
    // 關閉當前對話框
    currentDialog.open = false;

    // 顯示刪除確認對話框
    const deleteAppName = document.getElementById('delete-app-name');
    const deleteAppData = document.getElementById('delete-app-data');

    // 設定預設勾選狀態 (根據設定值)
    window.getConfig().then((config) => {
        deleteAppData.checked = config.delete_data;
    });

    deleteAppName.textContent = packageName;
    dialogDeleteApp.open = true;

    // 設置確認刪除按鈕的事件
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    confirmDeleteBtn.onclick = () => {
        uninstallAppByPackageName(packageName);
        dialogDeleteApp.open = false;
    };
};

const enableApp = (packageName, dialog) => {
    // 使用 adb.js 中定義的函數
    enableAPP(packageName)
        .then((success) => {
            if (success) {
                showSnackAlert(`應用程式 ${packageName} 已啟用`);

                // 移除已停用列表中的此應用
                const index = appsDisabled.indexOf(packageName);
                if (index > -1) {
                    appsDisabled.splice(index, 1);
                }

                // 關閉對話框
                if (dialog && typeof dialog.open !== 'undefined') {
                    dialog.open = false;
                }

                // 重新整理應用程式列表
                getAppList();
            } else {
                showSnackAlert(`啟用應用程式 ${packageName} 失敗`);
            }
        })
        .catch((error) => {
            console.error('啟用應用程式時發生錯誤:', error);
            showSnackAlert(`錯誤：啟用應用程式失敗`);
        });
};

// 停用應用程式函數
const disableApp = (packageName, dialog) => {
    // 使用 adb.js 中定義的函數
    disableAPP(packageName)
        .then((success) => {
            if (success) {
                showSnackAlert(`應用程式 ${packageName} 已停用`);

                // 添加到已停用列表
                if (!appsDisabled.includes(packageName)) {
                    appsDisabled.push(packageName);
                }

                // 關閉對話框
                if (dialog && typeof dialog.open !== 'undefined') {
                    dialog.open = false;
                }

                // 重新整理應用程式列表
                getAppList();
            } else {
                showSnackAlert(`停用應用程式 ${packageName} 失敗`);
            }
        })
        .catch((error) => {
            console.error('停用應用程式時發生錯誤:', error);
            showSnackAlert(`錯誤：停用應用程式失敗`);
        });
};

const uninstallAppByPackageName = (packageName) => {
    // 獲取是否刪除應用資料的選項
    const deleteAppData = document.getElementById('delete-app-data').checked;

    // 顯示操作進行中的通知
    showSnackAlert(`正在刪除應用程式: ${packageName}...`);

    // 調用 adb.js 中的 deleteAPP 函數
    deleteAPP(packageName, deleteAppData)
        .then(() => {
            // 刪除成功後更新應用程式列表
            showSnackAlert(`應用程式 ${packageName} 已成功刪除`);

            // 重新獲取應用程式列表
            getAppList();
        })
        .catch((error) => {
            console.error(`刪除應用程式時發生錯誤: ${error}`);
            showSnackAlert(`錯誤：刪除應用程式失敗`);
        });
};

// button listeners
buttonApplistRefresh.addEventListener('click', () => {
    getAppList();
});

// search (if on input, auto search)
searchInput.addEventListener('input', () => {
    // If no apps loaded yet or not connected, don't search
    if (!isConnected || !appsList.apps) {
        return;
    }

    const searchTerm = searchInput.value.toLowerCase().trim();
    updateAppList(searchTerm ? filterAppsBySearchTerm(appsList, searchTerm) : appsList);
});

const confirmWarning = () => {
    dialogWarning.open = false;

    // 初始化列表
    clearAppList();

    // 取得設備
    getDevice();
}

// 在 createAppCard 函數後添加此函數
const filterAppsBySearchTerm = (apps, term) => {
    const result = {
        apps: {
            user: {},
            system: {}
        }
    };

    // 過濾使用者和系統應用
    ['user', 'system'].forEach(type => {
        const appsList = apps.apps[type] || {};
        Object.values(appsList).forEach(app => {
            if (app.package_name.toLowerCase().includes(term)) {
                result.apps[type][app.package_name] = app;
            }
        });
    });

    return result;
};

const downloadAPK = (packageName) => {
    // showSnackAlert(`正在提取應用程式: ${packageName}...`);
    console.log("Extracting APK:", packageName);

    // get extract path
    window.getConfig().then((config) => {
        const extractPath = config.extrect_path;

        extractAPK(packageName, extractPath)
            .then((success) => {
                if (success) {
                    showSnackAlert(`應用程式 ${packageName} 已成功提取到: ${extractPath}`);
                } else {
                    showSnackAlert(`提取應用程式 ${packageName} 失敗`);
                }
            })
            .catch((error) => {
                console.error('提取 APK 時發生錯誤:', error);
                showSnackAlert(`錯誤：提取應用程式失敗 - ${error}`);
            });
    }).catch((error) => {
        console.error('讀取設定時發生錯誤:', error);
        showSnackAlert(`錯誤：無法讀取設定檔`);
    });
};

const initApp = () => {
    // 隱藏載入畫面
    appLoading.classList.remove('app-loading-showing');

    // 初始化頁面
    switchPage('appList');

    // 免責聲明
    // dialogWarning.open = true;

    confirmWarning();
};