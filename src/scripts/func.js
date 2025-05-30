// Electron and DOM element references
const { app } = require('electron');
const els = {
    // overlay
    appLoading: document.getElementById('app-loading'),
    // dialog
    dialogWarning: document.querySelector('.dialog-warning'),
    dialogDeleteApp: document.querySelector('.dialog-delete-app'),
    dialogSelectDevice: document.querySelector('.dialog-select-device'),
    dialogWirelessConnect: document.querySelector('.dialog-wireless-connect'),
    // card
    appCardTemplate: document.getElementById('app-card-template'),
    appInfoTemplate: document.getElementById('app-info-template'),
    // navbar icons
    iconConnected: document.getElementById('icon-connected'),
    iconDisconnected: document.getElementById('icon-disconnected'),
    iconLoading: document.getElementById('icon-loading'),
    // applist
    appListContainer: document.getElementById('app-list-content'),
    appListLoading: document.getElementById('app-list-loading'),
    appListDisconnected: document.getElementById('app-list-disconnected'),
    // search bar
    searchInput: document.getElementById('search-input'),
    refreshBtn: document.getElementById('button-applist-refresh')
};

// State
let isConnected = false;
let isConnecting = false;
let appsList = { apps: { user: {}, system: {} } };
let disabledApps = [];
let connectedDevices = [];
let selectedDevice = null;

// UI Helpers
function toggleConnectionIcon(connected, loading = false) {
    els.iconConnected.classList.toggle('hidden', !connected || loading);
    els.iconDisconnected.classList.toggle('hidden', connected || loading);

    if (els.iconLoading) {
        els.iconLoading.classList.toggle('hidden', !loading);
    }
}

function clearAppList() {
    els.appListContainer.innerHTML = '';
    els.appListContainer.style.display = 'none';
}

function clearPlaceholders() {
    els.appListLoading.style.display = 'none';
    els.appListDisconnected.style.display = 'none';
    els.appListContainer.style.display = 'block';
}

function showLoading() {
    els.appListContainer.style.display = 'none';
    els.appListDisconnected.style.display = 'none';
    els.appListLoading.style.display = 'flex';
}

// Core Logic
async function getDevice() {
    if (isConnecting) return;

    isConnecting = true;
    isConnected = false;
    toggleConnectionIcon(false, true);

    try {
        const output = await runADBcommand('devices');
        if (!output.includes('List of devices attached')) {
            clearAppList();
            showSnackAlert('無法連接到設備');
            toggleConnectionIcon(false, false);
            return;
        }

        const lines = output.trim().split('\n').slice(1).filter(Boolean);
        if (!lines.length) {
            showSnackAlert('目前沒有連接到設備');
            toggleConnectionIcon(false, false);
            clearAppList();
            return;
        }

        // 解析裝置列表
        const devices = [];
        for (const line of lines) {
            const [id, status] = line.split('\t');
            if (status === 'device') {
                devices.push({ id, status });
            }
        }

        if (devices.length === 0) {
            showSnackAlert('沒有可用的設備');
            toggleConnectionIcon(false, false);
            clearAppList();
            return;
        }

        // 如果只有一個裝置，直接連接
        if (devices.length === 1) {
            selectedDevice = devices[0].id;
            isConnected = true;
            toggleConnectionIcon(true, false);
            showSnackAlert(`已連接到設備: ${selectedDevice}`);
            await refreshAppList();
            return;
        }

        // 多個裝置時顯示選擇對話框
        connectedDevices = devices;
        await showDeviceSelectionDialog();

    } catch (err) {
        console.error('[adb] Get Device Error:', err);
        showSnackAlert('連接設備時發生錯誤');
        clearAppList();
        toggleConnectionIcon(false, false);
    } finally {
        isConnecting = false;
    }
}

// 新增：顯示裝置選擇對話框
async function showDeviceSelectionDialog() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');

    // 清空現有選項
    menu.innerHTML = '';

    // 為每個裝置添加選項
    for (const device of connectedDevices) {
        try {
            // 獲取裝置型號
            const modelOutput = await runADBcommand(`-s ${device.id} shell getprop ro.product.model`);
            const model = modelOutput.trim() || '未知型號';

            const menuItem = document.createElement('mdui-menu-item');
            menuItem.value = device.id;
            menuItem.setAttribute('selected-icon', 'link');
            menuItem.textContent = `${model} (${device.id})`;
            menu.appendChild(menuItem);
        } catch (err) {
            console.error(`獲取裝置 ${device.id} 型號失敗:`, err);
            const menuItem = document.createElement('mdui-menu-item');
            menuItem.value = device.id;
            menuItem.setAttribute('selected-icon', 'link');
            menuItem.textContent = `未知型號 (${device.id})`;
            menu.appendChild(menuItem);
        }
    }

    // 設置確認按鈕事件
    const confirmBtn = dialog.querySelector('mdui-button[slot="action"]');
    confirmBtn.onclick = () => confirmDeviceSelection();

    dialog.open = true;
}

// 新增：確認裝置選擇
function confirmDeviceSelection() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');
    const selectedValue = menu.value;

    if (!selectedValue) {
        showSnackAlert('請選擇一個裝置');
        return;
    }

    selectedDevice = selectedValue;
    isConnected = true;
    toggleConnectionIcon(true, false);
    showSnackAlert(`已連接到設備: ${selectedDevice}`);
    dialog.open = false;

    // 連接後刷新應用程式列表
    refreshAppList();
}

// 修改 runADBcommand 函數以支援指定裝置
async function runADBcommandWithDevice(command) {
    const fullCommand = selectedDevice && !command.startsWith('-s')
        ? `-s ${selectedDevice} ${command}`
        : command;
    return await runADBcommand(fullCommand);
}

async function refreshAppList() {
    showLoading();
    try {
        disabledApps = await fetchDisabledApps();
        appsList = await fetchApps();
        const term = els.searchInput.value.trim().toLowerCase();
        const toShow = term ? filterApps(appsList, term) : appsList;
        renderAppList(toShow);
    } catch (err) {
        console.error('[adb] Refresh App List Error:', err);
        clearAppList();
        showSnackAlert('獲取應用程式列表時發生錯誤');
    }
}

async function fetchDisabledApps() {
    try {
        const command = selectedDevice
            ? `-s ${selectedDevice} shell pm list packages -d`
            : 'shell pm list packages -d';
        const res = await runADBcommand(command);
        return res.trim().split('\n').map(l => l.replace('package:', '').trim());
    } catch (err) {
        console.error('[adb] Get Disabled Apps Error:', err);
        showSnackAlert('獲取「已停用的應用程式」時發生錯誤');
        return [];
    }
}

async function fetchApps() {
    const command = selectedDevice
        ? `-s ${selectedDevice} shell pm list packages -f`
        : 'shell pm list packages -f';
    const res = await runADBcommand(command);
    const lines = res.trim().split('\n');
    const apps = { user: {}, system: {} };
    lines.forEach(line => {
        const match = /package:(.+)=([^\s]+)/.exec(line) || [];
        const apkPath = match[1] || '';
        const pkg = match[2] || line.replace('package:', '').trim();
        const target = line.includes('/data/app/') || line.includes('/data/user/')
            ? apps.user : apps.system;
        target[pkg] = { package_name: pkg, app_path: apkPath };
    });
    return { apps };
}

function filterApps({ apps }, term) {
    const filtered = { apps: { user: {}, system: {} } };
    Object.keys(apps).forEach(type => {
        Object.values(apps[type]).forEach(app => {
            if (app.package_name.toLowerCase().includes(term)) {
                filtered.apps[type][app.package_name] = app;
            }
        });
    });
    return filtered;
}

function renderAppList({ apps }) {
    clearPlaceholders();
    els.appListContainer.innerHTML = '';
    const frag = document.createDocumentFragment();
    Object.values(apps.user).forEach(app => frag.appendChild(createAppCard(app, '使用者程式')));
    Object.values(apps.system).forEach(app => frag.appendChild(createAppCard(app, '系統程式')));
    els.appListContainer.appendChild(frag);
}

function createAppCard(app, type) {
    const tmpl = els.appCardTemplate.innerHTML;
    const enabled = !disabledApps.includes(app.package_name);
    const status = enabled ? '啟用中' : '停用中';
    const cls = enabled ? 'bg-green-900 text-white' : 'bg-red-900 text-white';
    const html = tmpl
        .replace(/{{app.packageName}}/g, app.package_name)
        .replace(/{{app.type}}/g, type)
        .replace(/{{app.status}}/g, status)
        .replace(/{{app.statusClass}}/g, cls);
    const wrapper = document.createElement('template');
    wrapper.innerHTML = html.trim();
    const card = wrapper.content.firstChild;
    card.addEventListener('click', () => viewAppInfo(app.package_name));
    return card;
}

async function viewAppInfo(pkg) {
    try {
        const command = selectedDevice
            ? `-s ${selectedDevice} shell dumpsys package ${pkg}`
            : `shell dumpsys package ${pkg}`;
        const info = await runADBcommand(command);
        const { versionName, versionCode, lastUpdateTime } = parseAppInfo(info);
        const enabled = !disabledApps.includes(pkg);
        showInfoDialog(pkg, versionName, versionCode, lastUpdateTime, enabled);
    } catch (err) {
        console.error('Get package info error:', err);
        showInfoDialog(pkg, '未知', '未知', '未知', false);
    }
}

function parseAppInfo(info) {
    return {
        versionName: (/versionName=([^\s]+)/.exec(info) || [])[1] || '未知',
        versionCode: (/versionCode=([^\s]+)/.exec(info) || [])[1] || '未知',
        lastUpdateTime: (/lastUpdateTime=([^\n]+)/.exec(info) || [])[1] || '未知'
    };
}

function showInfoDialog(pkg, vName, vCode, updated, enabled) {
    const html = els.appInfoTemplate.innerHTML
        .replace(/{{app.packageName}}/g, pkg)
        .replace(/{{app.version}}/g, `${vName} (${vCode})`)
        .replace(/{{app.latestUpdate}}/g, updated)
        .replace(/{{app.isEnable}}/g, enabled ? '啟用中' : '已停用');
    const div = document.createElement('div');
    div.innerHTML = html;
    const dialog = div.querySelector('.dialog-appinfo');
    document.body.appendChild(dialog);
    setupDialogButtons(dialog, pkg, enabled);
    setTimeout(() => dialog.open = true, 1);
}

function setupDialogButtons(dialog, pkg, enabled) {
    const btns = {
        enable: dialog.querySelector("mdui-button[icon='power_settings_new']"),
        disable: dialog.querySelector("mdui-button[icon='power_off']"),
        extract: dialog.querySelector("mdui-button[icon='download']"),
        delete: dialog.querySelector("mdui-button[icon='delete']")
    };
    btns.enable.disabled = enabled;
    btns.disable.disabled = !enabled;
    btns.enable.addEventListener('click', () => toggleAppState(pkg, true, dialog));
    btns.disable.addEventListener('click', () => toggleAppState(pkg, false, dialog));
    btns.extract.addEventListener('click', () => downloadAPK(pkg, dialog));
    btns.delete.addEventListener('click', () => promptDelete(dialog, pkg));
}

async function toggleAppState(pkg, enable, dialog) {
    const action = enable ? enableAPP : disableAPP;
    try {
        await action(pkg);
        showSnackAlert(`應用程式 ${pkg} ${enable ? '已啟用' : '已停用'}`);
        disabledApps = enable
            ? disabledApps.filter(n => n !== pkg)
            : [...disabledApps, pkg];
        dialog.open = false;
        await refreshAppList();
    } catch (err) {
        console.error(`${enable ? 'Enable' : 'Disable'} app error:`, err);
        showSnackAlert(`錯誤：${enable ? '啟用' : '停用'}應用程式失敗`);
    }
}

function promptDelete(curDialog, pkg) {
    curDialog.open = false;
    const nameEl = document.getElementById('delete-app-name');
    const dataEl = document.getElementById('delete-app-data');
    window.getConfig().then(cfg => dataEl.checked = cfg.delete_data);
    nameEl.textContent = pkg;
    els.dialogDeleteApp.open = true;
    document.getElementById('confirm-delete-btn').onclick = () => {
        uninstallApp(pkg);
        els.dialogDeleteApp.open = false;
    };
}

async function uninstallApp(pkg) {
    const delData = document.getElementById('delete-app-data').checked;
    showSnackAlert(`正在刪除應用程式: ${pkg}...`);
    try {
        await deleteAPP(pkg, delData);
        showSnackAlert(`應用程式 ${pkg} 已成功刪除`);
        await refreshAppList();
    } catch (err) {
        console.error('Uninstall error:', err);
        showSnackAlert('錯誤：刪除應用程式失敗');
    }
}

function downloadAPK(pkg, dialog) {
    const extractBtn = dialog.querySelector("mdui-button[icon='download']");

    // 設置loading狀態
    extractBtn.loading = true;
    extractBtn.disabled = true;
    dialog.setAttribute('close-on-overlay-click', 'false');

    window.getConfig()
        .then(cfg => extractAPK(pkg, cfg.extract_path))
        .then(ok => {
            showSnackAlert(ok ? `應用程式 ${pkg} 已成功提取` : `提取應用程式 ${pkg} 失敗`);
        })
        .catch(err => {
            console.error('Extract APK error:', err);
            showSnackAlert('錯誤：提取應用程式失敗');
        })
        .finally(() => {
            // 恢復按鈕狀態
            extractBtn.loading = false;
            extractBtn.disabled = false;
            dialog.setAttribute('close-on-overlay-click', 'true');
        });
}

// Event Listeners
els.refreshBtn.addEventListener('click', () => isConnected && refreshAppList());
els.searchInput.addEventListener('input', () => {
    if (!isConnected) return;
    const term = els.searchInput.value.trim().toLowerCase();
    renderAppList(term ? filterApps(appsList, term) : appsList);
});

function confirmWarning() {
    els.dialogWarning.open = false;

    getDevice();
}

// 修改初始化函數
function initApp() {
    // 頁面 fase in
    els.appLoading.classList.remove('app-loading-showing');

    // 預設分頁
    switchPage('appList');

    // 面責聲明
    // els.dialogWarning.open = true;

    // 移除自動顯示裝置選擇對話框
    getDevice();

    // els.dialogWirelessConnect.open = true;
}

initApp();
