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
    searchBtn: document.getElementById('button-search'),
    refreshBtn: document.getElementById('button-applist-refresh')
};

// State
let isConnected = false;
let isConnecting = false;
let appsList = { apps: { user: {}, system: {} } };
let disabledApps = [];
let connectedDevices = [];
let selectedDevice = null;
let useHelperMethod = false;


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
    els.appListDisconnected.style.display = 'flex';
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

// Handle device disconnection
let disconnectionNotified = false;
let noDeviceNotified = false;
function handleDeviceDisconnected() {
    // Avoid duplicate notifications
    if (disconnectionNotified || !isConnected) {
        return;
    }

    disconnectionNotified = true;
    isConnected = false;
    isConnecting = false;
    selectedDevice = null;
    useHelperMethod = false;
    toggleConnectionIcon(false, false);
    clearAppList();

    // Close any open app info dialogs
    const appInfoDialogs = document.querySelectorAll('.dialog-appinfo');
    appInfoDialogs.forEach(dialog => {
        dialog.open = false;
        // Remove dialog from DOM after closing
        setTimeout(() => {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        }, 100);
    });

    showSnackAlert('與裝置的連線中斷');

    // Reset notification flag after a delay
    setTimeout(() => {
        disconnectionNotified = false;
    }, 3000);
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
            toggleConnectionIcon(false, false);
            return;
        }

        const lines = output.trim().split('\n').slice(1).filter(Boolean);
        if (!lines.length) {
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
            await finalizeConnection(devices[0].id);
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

async function confirmDeviceSelection() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');
    const selectedValue = menu.value;

    if (!selectedValue) {
        showSnackAlert('請選擇一個裝置');
        return;
    }

    dialog.open = false;
    await finalizeConnection(selectedValue);
}

async function runADBcommandWithDevice(command) {
    const fullCommand = selectedDevice && !command.startsWith('-s')
        ? `-s ${selectedDevice} ${command}`
        : command;
    return await runADBcommand(fullCommand);
}

// Push helper DEX to device and validate the result
async function pushHelperDex() {
    try {
        const dexPath = await window.getHelperDexPath();

        // Verify the DEX file exists locally before pushing
        const exists = await window.checkFileExists(dexPath);
        
        if (!exists) {
            console.error('[Helper] DEX file not found at:', dexPath);
            return false;
        }

        const pushCmd = selectedDevice
            ? `-s ${selectedDevice} push "${dexPath}" /data/local/tmp/helper.dex`
            : `push "${dexPath}" /data/local/tmp/helper.dex`;

        const result = await runADBcommand(pushCmd, 0);

        console.log('[Helper] Push DEX result:', result);

        if (result && result.includes('1 file pushed')) {
            console.log('[Helper] DEX pushed successfully');
            return true;
        }
        console.warn('[Helper] DEX push result unexpected:', result);
        return false;
    } catch (err) {
        console.error('[Helper] Failed to push DEX:', err);
        return false;
    }
}

// Finalize device connection: push helper DEX, set state, refresh app list
async function finalizeConnection(deviceId) {
    selectedDevice = deviceId;
    isConnected = true;
    disconnectionNotified = false;
    noDeviceNotified = false;

    // Keep loading icon while pushing helper DEX
    toggleConnectionIcon(false, true);
    const pushSuccess = await pushHelperDex();
    useHelperMethod = pushSuccess;

    toggleConnectionIcon(true, false);
    showSnackAlert(`已連接到設備: ${selectedDevice}`);
    if (!pushSuccess) {
        showSnackAlert('Helper 推送失敗，已切換至相容模式');
    }
    await refreshAppList();
}

async function refreshAppList() {
    showLoading();
    try {
        if (useHelperMethod) {
            appsList = await fetchAppsWithHelper();
            // Build disabledApps from helper data
            disabledApps = [];
            for (const type of ['user', 'system']) {
                for (const app of Object.values(appsList.apps[type])) {
                    if (!app.enabled) {
                        disabledApps.push(app.package_name);
                    }
                }
            }
        } else {
            disabledApps = await fetchDisabledApps();
            appsList = await fetchAppsLegacy();
        }
        const term = els.searchInput.value.trim().toLowerCase();
        const toShow = term ? filterApps(appsList, term) : appsList;
        renderAppList(toShow);
    } catch (err) {
        console.error('[adb] Refresh App List Error:', err);
        clearAppList();
        showSnackAlert('獲取應用程式列表時發生錯誤');
    }
}

// Fetch apps using helper DEX (returns rich data with labels)
async function fetchAppsWithHelper() {
    const shellCmd = 'shell "CLASSPATH=/data/local/tmp/helper.dex app_process /data/local/tmp/ com.dash.helper.AdbHelper LIST_ALL"';
    const command = selectedDevice
        ? `-s ${selectedDevice} ${shellCmd}`
        : shellCmd;
    const res = await runADBcommand(command, 0);
    const list = JSON.parse(res.trim());
    const apps = { user: {}, system: {} };
    for (const item of list) {
        const target = item.isSystem ? apps.system : apps.user;
        target[item.packageName] = {
            package_name: item.packageName,
            label: item.label || item.packageName,
            versionName: item.versionName || '',
            enabled: item.enabled,
            app_path: ''
        };
    }
    return { apps };
}

// Legacy fetch using native ADB commands (fallback)
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

async function fetchAppsLegacy() {
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
        target[pkg] = { package_name: pkg, label: pkg, app_path: apkPath, enabled: true };
    });
    return { apps };
}

function filterApps({ apps }, term) {
    if (!term) return { apps };

    const filtered = { apps: { user: {}, system: {} } };
    const lowerTerm = term.toLowerCase();

    for (const type of Object.keys(apps)) {
        for (const app of Object.values(apps[type])) {
            const matchName = app.package_name.toLowerCase().includes(lowerTerm);
            const matchLabel = app.label && app.label.toLowerCase().includes(lowerTerm);
            if (matchName || matchLabel) {
                filtered.apps[type][app.package_name] = app;
            }
        }
    }
    return filtered;
}

let virtualScrollData = {
    allApps: [],
    itemHeight: 80,
    containerHeight: 0,
    scrollTop: 0,
    visibleCount: 0,
    bufferSize: 5,
    startIndex: 0,
    endIndex: 0
};

function initVirtualScroll() {
    const container = els.appListContainer;
    virtualScrollData.containerHeight = container.clientHeight || 600;
    virtualScrollData.visibleCount = Math.ceil(virtualScrollData.containerHeight / virtualScrollData.itemHeight);

    container.addEventListener('scroll', handleVirtualScroll);
    window.addEventListener('resize', () => {
        virtualScrollData.containerHeight = container.clientHeight || 600;
        virtualScrollData.visibleCount = Math.ceil(virtualScrollData.containerHeight / virtualScrollData.itemHeight);
        renderVirtualAppList();
    });
}

let scrollTimeout = null;
function handleVirtualScroll() {
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }

    scrollTimeout = setTimeout(() => {
        virtualScrollData.scrollTop = els.appListContainer.scrollTop;
        renderVirtualAppList();
    }, 16); // ~60fps
}

function renderAppList({ apps }) {
    clearPlaceholders();

    virtualScrollData.allApps = [
        ...Object.values(apps.user).map(app => ({ ...app, type: '使用者程式' })),
        ...Object.values(apps.system).map(app => ({ ...app, type: '系統程式' }))
    ];

    if (!virtualScrollData.containerHeight) {
        initVirtualScroll();
    }

    renderVirtualAppList();
}

function renderVirtualAppList() {
    const { allApps, itemHeight, visibleCount, bufferSize, scrollTop } = virtualScrollData;

    if (allApps.length === 0) {
        els.appListContainer.innerHTML = '';
        return;
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(allApps.length, startIndex + visibleCount + bufferSize * 2);

    virtualScrollData.startIndex = startIndex;
    virtualScrollData.endIndex = endIndex;

    const totalHeight = allApps.length * itemHeight;
    const offsetY = startIndex * itemHeight;

    els.appListContainer.innerHTML = '';
    els.appListContainer.style.height = `${virtualScrollData.containerHeight}px`;
    els.appListContainer.style.position = 'relative';
    els.appListContainer.style.overflow = 'auto';

    const scrollContainer = document.createElement('div');
    scrollContainer.style.height = `${totalHeight}px`;
    scrollContainer.style.position = 'relative';

    const visibleContainer = document.createElement('div');
    visibleContainer.style.transform = `translateY(${offsetY}px)`;
    visibleContainer.style.position = 'absolute';
    visibleContainer.style.top = '0';
    visibleContainer.style.left = '0';
    visibleContainer.style.right = '0';

    const frag = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
        const app = allApps[i];
        const card = createAppCard(app, app.type);
        card.style.height = `${itemHeight}px`;
        card.style.boxSizing = 'border-box';
        frag.appendChild(card);
    }

    visibleContainer.appendChild(frag);
    scrollContainer.appendChild(visibleContainer);
    els.appListContainer.appendChild(scrollContainer);
}

function createAppCard(app, type) {
    const tmpl = els.appCardTemplate.innerHTML;
    const enabled = !disabledApps.includes(app.package_name);
    const status = enabled ? '啟用中' : '停用中';
    const statusClass = enabled ? 'bg-green-900 text-white' : 'bg-red-900 text-white';
    const label = app.label || app.package_name;
    // In helper mode: show type and packageName; in fallback mode: only show type
    const subtitle = useHelperMethod
        ? `${type} ${app.package_name}`
        : type;
    const html = tmpl
        .replace(/{{app.packageName}}/g, app.package_name)
        .replace(/{{app.label}}/g, label)
        .replace(/{{app.status}}/g, status)
        .replace(/{{app.statusClass}}/g, statusClass)
        .replace(/{{app.subtitle}}/g, subtitle);
    const wrapper = document.createElement('template');
    wrapper.innerHTML = html.trim();
    const card = wrapper.content.firstChild;
    card.classList.add('app-card');
    card.addEventListener('click', () => {
        // Only open app info if device is connected
        if (isConnected) {
            viewAppInfo(app.package_name);
        }
    });
    return card;
}

async function viewAppInfo(pkg) {
    // Check if device is connected before showing app info
    if (!isConnected) {
        showSnackAlert('設備未連接，無法查看應用程式信息');
        return;
    }

    try {
        if (useHelperMethod) {
            const shellCmd = `shell "CLASSPATH=/data/local/tmp/helper.dex app_process /data/local/tmp/ com.dash.helper.AdbHelper ${pkg}"`;
            const command = selectedDevice
                ? `-s ${selectedDevice} ${shellCmd}`
                : shellCmd;
            const res = await runADBcommand(command, 0);
            const info = JSON.parse(res.trim());
            const enabled = info.enabled;
            showInfoDialog({
                packageName: info.packageName,
                label: info.label || info.packageName,
                version: `${info.versionName} (${info.versionCode})`,
                uid: info.uid,
                isSystem: info.isSystem,
                enabled: enabled,
                installTime: formatTimestamp(info.installTime),
                updateTime: formatTimestamp(info.updateTime),
                apkPath: info.apkPath || '',
                permissions: info.permissions || []
            });
        } else {
            const command = selectedDevice
                ? `-s ${selectedDevice} shell dumpsys package ${pkg}`
                : `shell dumpsys package ${pkg}`;
            const info = await runADBcommand(command);
            const parsed = parseAppInfoLegacy(info);
            const enabled = !disabledApps.includes(pkg);
            showInfoDialog({
                packageName: pkg,
                label: pkg,
                version: `${parsed.versionName} (${parsed.versionCode})`,
                uid: '',
                isSystem: false,
                enabled: enabled,
                installTime: '',
                updateTime: parsed.lastUpdateTime,
                apkPath: '',
                permissions: []
            });
        }
    } catch (err) {
        console.error('Get package info error:', err);
        if (isConnected) {
            showInfoDialog({
                packageName: pkg, label: pkg, version: '未知',
                uid: '', isSystem: false, enabled: false,
                installTime: '', updateTime: '未知', apkPath: '', permissions: []
            });
        }
    }
}

// Format unix timestamp to readable date string
function formatTimestamp(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return d.toLocaleString();
    } catch {
        return '';
    }
}

function parseAppInfoLegacy(info) {
    return {
        versionName: (/versionName=([^\s]+)/.exec(info) || [])[1] || '未知',
        versionCode: (/versionCode=([^\s]+)/.exec(info) || [])[1] || '未知',
        lastUpdateTime: (/lastUpdateTime=([^\n]+)/.exec(info) || [])[1] || '未知'
    };
}

function showInfoDialog(appInfo) {
    // Check if device is still connected before showing dialog
    if (!isConnected) {
        console.log('Device disconnected, not showing app info dialog');
        return;
    }

    const html = els.appInfoTemplate.innerHTML
        .replace(/{{app.packageName}}/g, appInfo.packageName)
        .replace(/{{app.label}}/g, appInfo.label)
        .replace(/{{app.version}}/g, appInfo.version)
        .replace(/{{app.uid}}/g, appInfo.uid ? `UID: ${appInfo.uid}` : '')
        .replace(/{{app.type}}/g, appInfo.isSystem ? '系統程式' : '使用者程式')
        .replace(/{{app.isEnable}}/g, appInfo.enabled ? '啟用中' : '已停用')
        .replace(/{{app.installTime}}/g, appInfo.installTime)
        .replace(/{{app.updateTime}}/g, appInfo.updateTime)
        .replace(/{{app.apkPath}}/g, appInfo.apkPath)
        .replace(/{{app.permissions}}/g, appInfo.permissions.length
            ? appInfo.permissions.join('\n')
            : '');
    const div = document.createElement('div');
    div.innerHTML = html;
    const dialog = div.querySelector('.dialog-appinfo');

    // Hide empty info rows
    dialog.querySelectorAll('.app-info-row').forEach(row => {
        const val = row.querySelector('.app-info-value');
        if (val && !val.textContent.trim()) {
            row.style.display = 'none';
        }
    });

    document.body.appendChild(dialog);
    setupDialogButtons(dialog, appInfo.packageName, appInfo.enabled);
    setTimeout(() => {
        if (isConnected) {
            dialog.open = true;
        } else {
            document.body.removeChild(dialog);
        }
    }, 1);
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
    // Check if device is connected before performing operations
    if (!isConnected) {
        showSnackAlert('設備未連接，無法執行操作');
        dialog.open = false;
        return;
    }

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
        if (isConnected) {
            showSnackAlert(`錯誤：${enable ? '啟用' : '停用'}應用程式失敗`);
        }
    }
}

function promptDelete(curDialog, pkg) {
    curDialog.open = false;
    const nameEl = document.getElementById('delete-app-name');
    nameEl.textContent = pkg;
    els.dialogDeleteApp.open = true;
    document.getElementById('confirm-delete-btn').onclick = () => {
        uninstallApp(pkg);
        els.dialogDeleteApp.open = false;
    };
}

async function uninstallApp(pkg) {
    // Check if device is connected before uninstalling
    if (!isConnected) {
        showSnackAlert('設備未連接，無法執行卸載操作');
        return;
    }

    showSnackAlert(`正在刪除應用程式: ${pkg}...`);
    try {
        await deleteAPP(pkg, false);
        showSnackAlert(`應用程式 ${pkg} 已成功刪除`);
        await refreshAppList();
    } catch (err) {
        console.error('Uninstall error:', err);
        if (isConnected) {
            showSnackAlert('錯誤：刪除應用程式失敗');
        }
    }
}

function downloadAPK(pkg, dialog) {
    // Check if device is connected before extracting APK
    if (!isConnected) {
        showSnackAlert('設備未連接，無法提取 APK');
        return;
    }

    const extractBtn = dialog.querySelector("mdui-button[icon='download']");

    // 設置loading狀態
    extractBtn.loading = true;
    extractBtn.disabled = true;
    dialog.setAttribute('close-on-overlay-click', 'false');

    window.getConfig()
        .then(cfg => extractAPK(pkg, cfg.extract_path))
        .then(ok => {
            if (isConnected) {
                showSnackAlert(ok ? `應用程式 ${pkg} 已成功提取` : `提取應用程式 ${pkg} 失敗`);
            }
        })
        .catch(err => {
            console.error('Extract APK error:', err);
            if (isConnected) {
                showSnackAlert('錯誤：提取應用程式失敗');
            }
        })
        .finally(() => {
            // 恢復按鈕狀態
            extractBtn.loading = false;
            extractBtn.disabled = false;
            dialog.setAttribute('close-on-overlay-click', 'true');
        });
}

// Handle wireless connection success
window.handleWirelessConnection = async function (deviceId) {
    console.log('[Wireless] Handling wireless connection success for device:', deviceId);

    try {
        await finalizeConnection(deviceId);
    } catch (err) {
        console.error('[Wireless] Error during wireless connection finalization:', err);
    }
};

// Handle device change events (called from integration.js)
let appInitialized = false;
window.handleDeviceChange = function (deviceList) {
    console.log('[USB] Device change detected:', deviceList);

    // Ignore initial device status during app startup
    if (!appInitialized) {
        console.log('[USB] Ignoring device change during app initialization');
        return;
    }

    // Skip if already connecting
    if (isConnecting) {
        console.log('[USB] Ignoring device change while connecting');
        return;
    }

    // Check if this is a wireless connection
    const isWirelessDevice = deviceList.includes('.') && deviceList.includes(':');
    if (isWirelessDevice && typeof window.wirelessConnectionState !== 'undefined' &&
        window.wirelessConnectionState && window.wirelessConnectionState.isConnecting) {
        console.log('[USB] Ignoring device change during wireless connection process');
        return;
    }

    // Parse device list to check for available devices
    const hasValidDevice = deviceList.includes('device') || deviceList.includes('recovery');
    const wasConnected = isConnected;

    // If already connected and current device is still in the list, skip reconnection
    if (isConnected && selectedDevice && hasValidDevice && deviceList.includes(selectedDevice)) {
        console.log('[USB] Current device still connected, skipping reconnection');
        return;
    }

    setTimeout(async () => {
        if (hasValidDevice) {
            console.log('[USB] Valid device detected, refreshing connection');
            await getDevice();
        } else {
            console.log('[USB] No valid device found, updating UI to show disconnected state');
            if (wasConnected) {
                handleDeviceDisconnected();
            }
        }
    }, 800);
};

// Setup USB Device Change Monitoring
function setupUSBDeviceMonitoring() {
    console.log('[USB] Device change monitoring handler registered');
}

// Event Listeners
els.refreshBtn.addEventListener('click', () => isConnected && refreshAppList());
function performSearch() {
    if (!isConnected) return;
    const term = els.searchInput.value.trim().toLowerCase();
    renderAppList(term ? filterApps(appsList, term) : appsList);
}


els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

els.searchBtn.addEventListener('click', performSearch);

els.searchInput.addEventListener('clear', () => {
    if (isConnected) {
        renderAppList(appsList);
    }
});


function confirmWarning() {
    els.dialogWarning.open = false;

    getDevice();
}

function handleConnectionClick() {
    if (isConnected) {
        showDisconnectDialog(false);
    } else {
        getDevice();
    }
}

function showDisconnectDialog(openWirelessAfter = false) {
    const description = document.getElementById('disconnect-description');
    const confirmBtn = document.getElementById('confirm-disconnect-btn');

    if (openWirelessAfter) {
        description.textContent = '目前已連接到設備，是否要斷開現有連接並開始無線連接？';
        confirmBtn.onclick = () => confirmDisconnectAndWireless();
    } else {
        description.textContent = '目前已連接到設備，是否要斷開現有連接？';
        confirmBtn.onclick = () => confirmDisconnect();
    }

    els.dialogDisconnectConfirm.open = true;
}

async function confirmDisconnect() {
    els.dialogDisconnectConfirm.open = false;

    // Execute proper disconnect commands
    await executeDisconnectCommands();

    isConnected = false;
    selectedDevice = null;
    useHelperMethod = false;
    toggleConnectionIcon(false, false);

    clearAppList();
}

async function confirmDisconnectAndWireless() {
    els.dialogDisconnectConfirm.open = false;

    // Execute proper disconnect commands
    await executeDisconnectCommands();

    isConnected = false;
    selectedDevice = null;
    useHelperMethod = false;
    toggleConnectionIcon(false, false);

    clearAppList();

    els.dialogWirelessConnect.open = true;
}

async function executeDisconnectCommands() {
    try {
        showSnackAlert('正在中斷連線...');
        await runADBcommand('disconnect');
        // Remove the success toast to reduce notification count
    } catch (error) {
        console.error('Disconnect commands failed:', error);
        showSnackAlert('中斷連線時發生錯誤');
    }
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
    getDevice().then(() => {
        setTimeout(() => {
            appInitialized = true;
            console.log('[App] Initialization complete, USB monitoring active');
        }, 2000);
    });

    // Setup USB Device Change Monitoring
    setupUSBDeviceMonitoring();

    // els.dialogWirelessConnect.open = true;
}

initApp();
