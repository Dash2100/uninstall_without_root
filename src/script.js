const dialogConfirmUninstall = document.querySelector(".dialog-confirm-uninstall");
const dialogWarning = document.querySelector(".dialog-warning");
const dialogAppInfo = document.querySelector(".dialog-appinfo");
const dialogDeleteApp = document.querySelector(".dialog-delete-app");
const dialogADBResponse = document.querySelector(".dialog-adb-response");

const snackbarDisconnected = document.querySelector(".snackbar-disconnected");
const snackbarConnected = document.querySelector(".snackbar-connected");

const snackbarDeviceId = document.querySelector("#snackbar-device-id");
const adbResponse = document.getElementById("adb-response");
const appListContainer = document.getElementById("app-list-container");
const searchField = document.getElementById("search-app-field");

let currentDeviceId = null;
let appList = [];

// 用於延遲加載的變數
let allApps = []; // 存儲所有應用
let currentPage = 0;
const APPS_PER_PAGE = 20; // 每次加載的應用數量
let isLoadingMore = false;

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

const uninstallApp = (packageName) => {
    // 更新對話框內容
    const deleteAppNameElement = document.getElementById('delete-app-name');
    if (deleteAppNameElement) deleteAppNameElement.textContent = packageName;

    // 打開確認對話框
    dialogDeleteApp.open = true;

    // 為確認按鈕添加事件
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

    // 移除舊的事件監聽器
    const newConfirmDeleteBtn = confirmDeleteBtn.cloneNode(true);
    confirmDeleteBtn.parentNode.replaceChild(newConfirmDeleteBtn, confirmDeleteBtn);

    // 添加新的事件監聽器
    newConfirmDeleteBtn.addEventListener('click', async () => {
        try {
            dialogDeleteApp.open = false;

            // 顯示處理中
            showAdbResponse('正在執行卸載命令，請稍候...');

            // 這裡只是顯示模擬的成功訊息，因為我們只實現了列出應用的功能
            setTimeout(() => {
                showAdbResponse(`模擬卸載：${packageName} 成功! (實際未執行卸載)`);
            }, 1500);

        } catch (error) {
            console.error('卸載應用失敗:', error);
            showAdbResponse(`卸載應用失敗: ${error.message || error}`);
        }
    });
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

// 檢查 ADB 連接狀態
const checkAdbConnection = async (loadApps = false) => {
    try {
        const devices = await window.adb.getDevices();

        if (devices && devices.length > 0) {
            // 只使用第一個連接的設備
            const device = devices[0];
            currentDeviceId = device.id;
            snackbarDeviceId.textContent = device.id;
            snackbarConnected.open = true;

            // 只在明確要求時才加載應用列表
            if (loadApps) {
                loadAppList();
            }
            return true;
        } else {
            snackbarDisconnected.open = true;
            return false;
        }
    } catch (error) {
        console.error('檢查ADB連接出錯:', error);
        snackbarDisconnected.open = true;
        showAdbResponse(`檢查ADB連接出錯: ${error.message || error}`);
        return false;
    }
};

// 顯示 ADB 命令的回應
const showAdbResponse = (response) => {
    adbResponse.textContent = response;
    dialogADBResponse.open = true;
};

// 加載應用列表
const loadAppList = async () => {
    try {
        // 顯示加載中
        appListContainer.innerHTML = `
            <div class="flex justify-center items-center p-5">
                <mdui-circular-progress></mdui-circular-progress>
            </div>
        `;

        // 檢查連接 (不要在這裡自動重新加載列表)
        const isConnected = await checkAdbConnection(false);
        if (!isConnected) {
            appListContainer.innerHTML = `
                <div class="flex justify-center items-center p-5">
                    <p>未連接到ADB裝置，請檢查連接</p>
                </div>
            `;
            return;
        }

        // 獲取應用列表
        appList = await window.adb.getAppList();

        // 渲染應用列表
        renderAppList(appList);
    } catch (error) {
        console.error('加載應用列表失敗:', error);
        appListContainer.innerHTML = `
            <div class="flex justify-center items-center p-5">
                <p>加載應用列表失敗: ${error.message || error}</p>
            </div>
        `;
    }
};

// 渲染應用列表
const renderAppList = (apps) => {
    if (!apps || apps.length === 0) {
        appListContainer.innerHTML = `
            <div class="flex justify-center items-center p-5">
                <p>未找到應用程式</p>
            </div>
        `;
        return;
    }

    // 儲存所有應用以便分頁加載
    allApps = [...apps];
    currentPage = 0;

    // 清空容器
    appListContainer.innerHTML = '';

    // 添加滾動事件監聽器
    setupInfiniteScroll();

    // 載入第一頁
    loadMoreApps();
};

// 顯示應用程式詳細資訊
const showAppInfo = (element) => {
    const packageName = element.getAttribute('data-package-name');

    // 獲取參考元素
    const appPackageElement = document.getElementById('app-package');
    const deleteAppNameElement = document.getElementById('delete-app-name');

    // 更新對話框內容
    if (appPackageElement) appPackageElement.textContent = packageName;
    if (deleteAppNameElement) deleteAppNameElement.textContent = packageName;

    // 打開對話框
    dialogAppInfo.open = true;
};

// 載入更多應用
const loadMoreApps = () => {
    if (isLoadingMore || currentPage * APPS_PER_PAGE >= allApps.length) return;

    isLoadingMore = true;

    // 計算當前要顯示的應用
    const startIdx = currentPage * APPS_PER_PAGE;
    const endIdx = Math.min(startIdx + APPS_PER_PAGE, allApps.length);
    const appsToRender = allApps.slice(startIdx, endIdx);

    // 使用 DocumentFragment 提高渲染性能
    const fragment = document.createDocumentFragment();
    const template = document.createElement('template');

    appsToRender.forEach(app => {
        template.innerHTML = `
            <mdui-card clickable variant="elevated" data-package-name="${app.packageName}"
                class="w-full h-20 flex rounded-none" onclick="showAppInfo(this)">
                <mdui-avatar class="my-auto mx-4" icon="adb"></mdui-avatar>
                <div class="flex flex-col justify-center flex-1 min-w-0">
                    <p class="text-lg package-name truncate">${app.packageName}</p>
                </div>
                <mdui-button-icon variant="tonal" class="my-auto ml-2 mr-6" icon="info"></mdui-button-icon>
            </mdui-card>
        `;

        fragment.appendChild(template.content.cloneNode(true));
    });

    // 添加載入中提示元素作為最後一個元素
    if (endIdx < allApps.length) {
        const loadingElement = document.createElement('div');
        loadingElement.id = 'loading-indicator';
        loadingElement.className = 'flex justify-center items-center p-3';
        loadingElement.innerHTML = '<mdui-circular-progress density="compact"></mdui-circular-progress>';
        fragment.appendChild(loadingElement);
    }

    // 添加到容器
    appListContainer.appendChild(fragment);

    // 更新頁碼
    currentPage++;

    // 延遲一點以避免UI阻塞
    setTimeout(() => {
        isLoadingMore = false;
    }, 50);
};

// 設置滾動加載
const setupInfiniteScroll = () => {
    // 監視容器的滾動
    const scrollHandler = () => {
        if (isLoadingMore) return;

        // 如果滾動到接近底部，加載更多
        const scrollHeight = appListContainer.scrollHeight;
        const scrollTop = appListContainer.scrollTop;
        const clientHeight = appListContainer.clientHeight;

        if (scrollTop + clientHeight >= scrollHeight - 100) {
            loadMoreApps();
        }
    };

    // 移除已有的事件監聽器
    appListContainer.removeEventListener('scroll', scrollHandler);

    // 添加滾動事件監聽器
    appListContainer.addEventListener('scroll', scrollHandler);
};

// 搜索應用
const searchApps = () => {
    const query = searchField.value.toLowerCase();

    if (!query || !appList || appList.length === 0) {
        renderAppList(appList);
        return;
    }

    const filteredApps = appList.filter(app => {
        return app.packageName.toLowerCase().includes(query);
    });

    renderAppList(filteredApps);
};

const initApp = async () => {
    // 初始化頁面
    switchPage('appList');

    // 等待 DOM 完全加載
    setTimeout(async () => {
        // 顯示免責聲明
        if (dialogWarning) dialogWarning.open = true;

        // 只檢測裝置連線，但不自動加載應用列表
        await checkAdbConnection(false);

        // 顯示初始提示或說明（而不是直接加載應用列表）
        if (appListContainer) {
            appListContainer.innerHTML = `
                <div class="flex flex-col justify-center items-center p-5 text-center">
                    <p class="mb-3">請點擊右上角的連接按鈕或下方的重新整理按鈕來載入應用列表</p>
                    <span class="material-icons text-3xl mb-2">arrow_upward</span>
                </div>
            `;
        }

        // 為搜索框添加事件
        if (searchField) {
            searchField.addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    searchApps();
                }
            });
        }
    }, 500);
};