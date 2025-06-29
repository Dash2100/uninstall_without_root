const { app } = require('electron');


// DOM element references
const els = {
    // overlay
    appLoading: document.getElementById('app-loading'),
    // dialog
    dialogWarning: document.querySelector('.dialog-warning'),
    dialogDeleteApp: document.querySelector('.dialog-delete-app'),
    dialogSelectDevice: document.querySelector('.dialog-select-device'),
    dialogWirelessConnect: document.querySelector('.dialog-wireless-connect'),
    dialogDisconnectConfirm: document.querySelector('.dialog-disconnect-confirm'),
    // card
    appCardTemplate: document.getElementById('app-card-template'),
    appInfoTemplate: document.getElementById('app-info-template'),
    // navbar icons
    iconWirelessConnect: document.getElementById('icon-wireless-connect'),
    iconConnected: document.getElementById('icon-connected'),
    iconDisconnected: document.getElementById('icon-disconnected'),
    iconLoading: document.getElementById('icon-loading'),
    // applist
    appListContainer: document.getElementById('app-list-content'),
    appListLoading: document.getElementById('app-list-loading'),
    appListDisconnected: document.getElementById('app-list-disconnected'),
    // search bar
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
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

        // devices list
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

        // automatically connect if only one is available
        if (devices.length === 1) {
            selectedDevice = devices[0].id;
            isConnected = true;
            toggleConnectionIcon(true, false);
            showSnackAlert(`已連接到設備: ${selectedDevice}`);
            await refreshAppList();
            return;
        }

        // if multiple devices are found, show selection dialog
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

async function showDeviceSelectionDialog() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');

    menu.innerHTML = '';

    for (const device of connectedDevices) {
        try {
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

    const confirmBtn = dialog.querySelector('mdui-button[slot="action"]');
    confirmBtn.onclick = () => confirmDeviceSelection();

    dialog.open = true;
}

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

    refreshAppList();
}

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
    // 先顯示對話框，顯示空白狀態
    const enabled = !disabledApps.includes(pkg);
    showInfoDialog(pkg, '', '', '', enabled, true);
    
    try {
        const command = selectedDevice
            ? `-s ${selectedDevice} shell dumpsys package ${pkg}`
            : `shell dumpsys package ${pkg}`;
        const info = await runADBcommand(command);
        const { versionName, versionCode, lastUpdateTime } = parseAppInfo(info);
        
        // 更新對話框內容
        updateInfoDialog(pkg, versionName, versionCode, lastUpdateTime, enabled);
    } catch (err) {
        console.error('Get package info error:', err);
        // 更新對話框顯示錯誤狀態
        updateInfoDialog(pkg, '未知', '未知', '未知', enabled);
    }
}

function parseAppInfo(info) {
    return {
        versionName: (/versionName=([^\s]+)/.exec(info) || [])[1] || '未知',
        versionCode: (/versionCode=([^\s]+)/.exec(info) || [])[1] || '未知',
        lastUpdateTime: (/lastUpdateTime=([^\n]+)/.exec(info) || [])[1] || '未知'
    };
}

function showInfoDialog(pkg, vName, vCode, updated, enabled, isLoading = false) {
    const html = els.appInfoTemplate.innerHTML
        .replace(/{{app.packageName}}/g, pkg)
        .replace(/{{app.version}}/g, `${vName} (${vCode})`)
        .replace(/{{app.latestUpdate}}/g, updated)
        .replace(/{{app.isEnable}}/g, enabled ? '啟用中' : '已停用');
    const div = document.createElement('div');
    div.innerHTML = html;
    const dialog = div.querySelector('.dialog-appinfo');
    
    // 為對話框設置ID以便後續更新
    dialog.id = `dialog-appinfo-${pkg.replace(/\./g, '-')}`;
    
    document.body.appendChild(dialog);
    setupDialogButtons(dialog, pkg, enabled, isLoading);
    setTimeout(() => dialog.open = true, 1);
}

function updateInfoDialog(pkg, vName, vCode, updated, enabled) {
    const dialogId = `dialog-appinfo-${pkg.replace(/\./g, '-')}`;
    const dialog = document.getElementById(dialogId);
    
    if (!dialog) return;
    
    // 更新對話框內容
    const description = dialog.querySelector('[slot="description"]');
    if (description) {
        description.innerHTML = `
            <div class="flex flex-col gap-2 max-w-full overflow-hidden">
                <p class="break-words">APP包名: <span class="break-all">${pkg}</span></p>
                <p class="break-words">APP版本: <span class="break-all">${vName} (${vCode})</span></p>
                <p class="break-words">最後更新: <span class="break-all">${updated}</span></p>
                <p class="break-words">啟用狀態: <span class="break-all">${enabled ? '啟用中' : '已停用'}</span></p>
            </div>
        `;
    }
    
    // 重新設置按鈕狀態（移除載入狀態）
    setupDialogButtons(dialog, pkg, enabled, false);
}

function setupDialogButtons(dialog, pkg, enabled, isLoading = false) {
    const btns = {
        enable: dialog.querySelector("mdui-button[icon='power_settings_new']"),
        disable: dialog.querySelector("mdui-button[icon='power_off']"),
        extract: dialog.querySelector("mdui-button[icon='download']"),
        delete: dialog.querySelector("mdui-button[icon='delete']")
    };
    
    if (isLoading) {
        // 載入狀態時禁用所有按鈕
        Object.values(btns).forEach(btn => {
            if (btn) btn.disabled = true;
        });
    } else {
        // 正常狀態 - 只有啟用/停用按鈕根據狀態禁用，其他按鈕保持啟用
        btns.enable.disabled = enabled;
        btns.disable.disabled = !enabled;
        btns.extract.disabled = false;
        btns.delete.disabled = false;
        
        // 清除之前的事件監聽器並重新添加
        const newEnable = btns.enable.cloneNode(true);
        const newDisable = btns.disable.cloneNode(true);
        const newExtract = btns.extract.cloneNode(true);
        const newDelete = btns.delete.cloneNode(true);
        
        btns.enable.parentNode.replaceChild(newEnable, btns.enable);
        btns.disable.parentNode.replaceChild(newDisable, btns.disable);
        btns.extract.parentNode.replaceChild(newExtract, btns.extract);
        btns.delete.parentNode.replaceChild(newDelete, btns.delete);
        
        newEnable.addEventListener('click', () => toggleAppState(pkg, true, dialog));
        newDisable.addEventListener('click', () => toggleAppState(pkg, false, dialog));
        newExtract.addEventListener('click', () => downloadAPK(pkg, dialog));
        newDelete.addEventListener('click', () => promptDelete(dialog, pkg));
    }
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
    
    // 控制清除按鈕的顯示
    if (term) {
        els.searchClearBtn.classList.remove('hidden');
    } else {
        els.searchClearBtn.classList.add('hidden');
    }
    
    renderAppList(term ? filterApps(appsList, term) : appsList);
});

// 清除搜尋按鈕事件監聽器
els.searchClearBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClearBtn.classList.add('hidden');
    if (isConnected) {
        renderAppList(appsList);
    }
});

els.iconWirelessConnect.addEventListener('click', () => {
    if (isConnected) {
        els.dialogDisconnectConfirm.open = true;
        return;
    }
    els.dialogWirelessConnect.open = true;
});

function confirmWarning() {
    els.dialogWarning.open = false;

    getDevice();
}

function confirmDisconnectAndWireless() {
    els.dialogDisconnectConfirm.open = false;
    
    isConnected = false;
    selectedDevice = null;
    toggleConnectionIcon(false, false);
    
    clearAppList();
    
    showSnackAlert('已斷開現有連接');
    
    els.dialogWirelessConnect.open = true;
}

// initialize the app
function initApp() {
    // page elements fade-in
    els.appLoading.classList.remove('app-loading-showing');

    // default page
    switchPage('appList');

    // disclaimer
    // els.dialogWarning.open = true;

    // remove automatic device selection dialog
    getDevice();

    // els.dialogWirelessConnect.open = true;
}

initApp();
