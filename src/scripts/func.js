const { app } = require('electron');


// DOM element references
const els = {
    // overlay
    appLoading: document.getElementById('app-loading'),
    // dialog
    dialogWarning: document.querySelector('.dialog-warning'),
    dialogDeleteApp: document.querySelector('.dialog-delete-app'),
    dialogSystemWarning: document.querySelector('.dialog-system-warning'),
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
let disabledApps = new Set();
let connectedDevices = [];
let selectedDevice = null;
let useHelperMethod = false;
let isFetchingAppInfo = false;
let manuallyDisconnected = false;
let currentFilter = 'all'; // 'all', 'user', 'system'
let currentSort = 'name'; // 'name', 'package', 'status'


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
    els.appListLoading.style.display = 'none';
    els.appListDisconnected.style.display = 'flex';
}

function clearPlaceholders() {
    els.appListLoading.style.display = 'none';
    els.appListDisconnected.style.display = 'none';
    els.appListContainer.style.display = 'block';
}

function showLoading(label) {
    els.appListContainer.style.display = 'none';
    els.appListDisconnected.style.display = 'none';
    els.appListLoading.style.display = 'flex';
    const loadingLabel = document.getElementById('app-list-loading-label');
    if (loadingLabel) {
        loadingLabel.textContent = label || '正在載入應用程式列表...';
    }
}

function updateLoadingLabel(label) {
    const loadingLabel = document.getElementById('app-list-loading-label');
    if (loadingLabel) {
        loadingLabel.textContent = label;
    }
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
let _showingDeviceSelection = false;

async function getDevice() {
    if (isConnecting) return;

    isConnecting = true;

    try {
        const wasConnected = isConnected;
        const previousDevice = selectedDevice;

        const output = await runADBcommand('devices');
        if (!output.includes('List of devices attached')) {
            isConnected = false;
            clearAppList();
            toggleConnectionIcon(false, false);
            return;
        }

        const lines = output.trim().split(/\r?\n/).slice(1).filter(Boolean);
        let devices = [];
        for (const line of lines) {
            const [id, status] = line.trim().split('\t');
            if (status && status.trim() === 'device') {
                devices.push({ id, status });
            }
        }

        // Deduplicate devices (same physical device via USB/Wireless/mDNS)
        if (devices.length > 1) {
            const serialMap = new Map();
            
            // Get serial for all devices concurrently
            await Promise.all(devices.map(async (device) => {
                try {
                    // Use -s to target specific device instance
                    const serialOutput = await runADBcommand(`-s ${device.id} shell getprop ro.serialno`);
                    const serial = serialOutput ? serialOutput.trim() : null;
                    
                    const key = serial || device.id; 
                    if (!serialMap.has(key)) serialMap.set(key, []);
                    serialMap.get(key).push(device);
                } catch (e) {
                    // If error (e.g. unauthorized), treat as unique using its ID
                    console.warn(`[USB] Failed to get serial for ${device.id}`, e);
                    if (!serialMap.has(device.id)) serialMap.set(device.id, []);
                    serialMap.get(device.id).push(device);
                }
            }));
            
            const uniqueDevices = [];
            for (const [key, candidates] of serialMap.entries()) {
                 if (candidates.length === 1) {
                     uniqueDevices.push(candidates[0]);
                 } else {
                     // Prefer IP:Port format (cleaner) over mDNS names
                     // Heuristic: shortest ID or one starting with digit is likely IP
                     const best = candidates.find(d => /^\d/.test(d.id) && !d.id.includes('_adb-tls-connect')) || candidates[0];
                     console.log(`[USB] Deduplicated ${key}: selected ${best.id} from`, candidates.map(c => c.id));
                     uniqueDevices.push(best);
                 }
            }
            devices = uniqueDevices;
        }

        console.log(`[USB] getDevice: found ${devices.length} device(s)`, devices.map(d => d.id));

        if (devices.length === 0) {
            if (wasConnected) {
                handleDeviceDisconnected();
            } else {
                toggleConnectionIcon(false, false);
                clearAppList();
            }
            return;
        }

        if (devices.length === 1) {
            if (wasConnected && previousDevice === devices[0].id) {
                console.log('[USB] Already connected to sole device, skipping');
                return;
            }
            isConnected = false;
            toggleConnectionIcon(false, true);
            await finalizeConnection(devices[0].id);
            return;
        }

        // Multiple devices - show selection dialog
        console.log(`[USB] Multiple devices detected (${devices.length}), showing selection`);
        connectedDevices = devices;
        _showingDeviceSelection = true;
        await showDeviceSelectionDialog();
        // isConnecting stays true while dialog is open; released by confirm or close handler

    } catch (err) {
        console.error('[adb] Get Device Error:', err);
        showSnackAlert('連接設備時發生錯誤');
        isConnected = false;
        clearAppList();
        toggleConnectionIcon(false, false);
    } finally {
        // Always release lock UNLESS the device selection dialog is showing
        if (!_showingDeviceSelection) {
            isConnecting = false;
        }
    }
}

async function showDeviceSelectionDialog() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');

    menu.innerHTML = '';

    // Fetch model names in parallel for speed
    const deviceInfos = await Promise.all(connectedDevices.map(async (device) => {
        try {
            const modelOutput = await runADBcommand(`-s ${device.id} shell getprop ro.product.model`);
            return { id: device.id, model: modelOutput.trim() || '未知型號' };
        } catch (err) {
            console.error(`獲取裝置 ${device.id} 型號失敗:`, err);
            return { id: device.id, model: '未知型號' };
        }
    }));

    for (const info of deviceInfos) {
        const menuItem = document.createElement('mdui-menu-item');
        menuItem.value = info.id;
        menuItem.setAttribute('selected-icon', 'link');
        // Indicate connection type (wireless if contains IP:port)
        const isWireless = info.id.includes(':');
        const typeLabel = isWireless ? '無線' : 'USB';
        const currentLabel = (selectedDevice === info.id) ? ' ✓ 目前連線' : '';
        menuItem.textContent = `${info.model} (${typeLabel}: ${info.id})${currentLabel}`;
        menu.appendChild(menuItem);
    }

    // Don't pre-select any device - user must actively choose
    menu.value = '';

    const confirmBtn = dialog.querySelector('mdui-button[slot="action"]');
    confirmBtn.onclick = () => confirmDeviceSelection();

    dialog.open = true;
}

function cancelDeviceSelection() {
    const dialog = els.dialogSelectDevice;
    dialog.open = false;
    _showingDeviceSelection = false;
    isConnecting = false;
}

async function confirmDeviceSelection() {
    const dialog = els.dialogSelectDevice;
    const menu = dialog.querySelector('mdui-menu');
    const selectedValue = menu.value;

    // Nothing selected = same as cancel
    if (!selectedValue) {
        cancelDeviceSelection();
        return;
    }

    dialog.open = false;
    _showingDeviceSelection = false;
    isConnecting = false;

    // If selecting the same device that's already connected, skip re-init
    if (isConnected && selectedDevice === selectedValue) {
        console.log('[USB] Same device selected, keeping connection');
        return;
    }

    isConnected = false;
    toggleConnectionIcon(false, true);
    await finalizeConnection(selectedValue);
}

// Release isConnecting lock if user closes the device selection dialog without selecting
if (els.dialogSelectDevice) {
    els.dialogSelectDevice.addEventListener('close', () => {
        if (_showingDeviceSelection) {
            console.log('[USB] Device selection dialog closed without selection');
            _showingDeviceSelection = false;
            isConnecting = false;
        }
    });
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
        // Check if DEX already exists on device (skip push for faster reconnection)
        const checkCmd = selectedDevice
            ? `-s ${selectedDevice} shell ls /data/local/tmp/helper.dex`
            : 'shell ls /data/local/tmp/helper.dex';
        try {
            const checkResult = await runADBcommand(checkCmd, 0, true);
            if (checkResult && checkResult.includes('helper.dex') && !checkResult.includes('No such file')) {
                console.log('[Helper] DEX already exists on device, skipping push');
                return true;
            }
        } catch (e) { /* file doesn't exist, proceed with push */ }

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
            disabledApps = new Set();
            for (const type of ['user', 'system']) {
                for (const app of Object.values(appsList.apps[type])) {
                    if (!app.enabled) {
                        disabledApps.add(app.package_name);
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
            app_path: '',
            isSystem: item.isSystem
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
        return new Set(res.trim().split(/\r?\n/).map(l => l.replace('package:', '').trim()));
    } catch (err) {
        console.error('[adb] Get Disabled Apps Error:', err);
        showSnackAlert('獲取「已停用的應用程式」時發生錯誤');
        return new Set();
    }
}

async function fetchAppsLegacy() {
    const command = selectedDevice
        ? `-s ${selectedDevice} shell pm list packages -f`
        : 'shell pm list packages -f';
    const res = await runADBcommand(command);
    const lines = res.trim().split(/\r?\n/);
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

    let allApps = [];
    if (currentFilter === 'all' || currentFilter === 'user') {
        allApps.push(...Object.values(apps.user).map(app => ({ ...app, type: '使用者程式' })));
    }
    if (currentFilter === 'all' || currentFilter === 'system') {
        allApps.push(...Object.values(apps.system).map(app => ({ ...app, type: '系統程式' })));
    }

    // Apply sort
    allApps.sort((a, b) => {
        if (currentSort === 'name') {
            return (a.label || a.package_name).localeCompare(b.label || b.package_name);
        } else if (currentSort === 'package') {
            return a.package_name.localeCompare(b.package_name);
        } else if (currentSort === 'status') {
            // Disabled apps first
            const aDisabled = disabledApps.has(a.package_name) ? 0 : 1;
            const bDisabled = disabledApps.has(b.package_name) ? 0 : 1;
            return aDisabled - bDisabled || (a.label || a.package_name).localeCompare(b.label || b.package_name);
        }
        return 0;
    });

    virtualScrollData.allApps = allApps;

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
    const enabled = !disabledApps.has(app.package_name);
    const label = app.label || app.package_name;
    // In helper mode: show type and packageName; in fallback mode: only show type
    const subtitle = useHelperMethod
        ? `${type} ${app.package_name}`
        : type;
    // Disabled apps get a different icon and red-tinted style
    const icon = enabled ? 'adb' : 'block';
    const iconStyle = enabled ? '' : 'background-color: rgba(239, 68, 68, 0.2); --mdui-color-primary: #ef4444; color: #ef4444;';
    const html = tmpl
        .replace(/{{app.packageName}}/g, app.package_name)
        .replace(/{{app.label}}/g, label)
        .replace(/{{app.icon}}/g, icon)
        .replace(/{{app.iconStyle}}/g, iconStyle)
        .replace(/{{app.subtitle}}/g, subtitle);
    const wrapper = document.createElement('template');
    wrapper.innerHTML = html.trim();
    const card = wrapper.content.firstChild;
    card.classList.add('app-card');
    card.addEventListener('click', async () => {
        if (!isConnected || isFetchingAppInfo) return;
        isFetchingAppInfo = true;
        const avatar = card.querySelector('mdui-avatar');
        const originalIcon = icon;
        const originalStyle = avatar ? avatar.getAttribute('style') || '' : '';
        if (avatar) {
            // Replace avatar with a spinner placeholder, keeping the original background
            const spinnerWrapper = document.createElement('div');
            spinnerWrapper.className = 'my-auto mx-4 flex items-center justify-center';
            spinnerWrapper.style.width = '40px';
            spinnerWrapper.style.height = '40px';
            spinnerWrapper.style.borderRadius = '50%';
            if (enabled) {
                spinnerWrapper.style.backgroundColor = 'rgb(var(--mdui-color-primary-container))';
            } else {
                spinnerWrapper.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            }
            const spinner = document.createElement('mdui-circular-progress');
            spinner.style.width = '24px';
            spinner.style.height = '24px';
            if (!enabled) {
                spinner.style.cssText = 'width:24px;height:24px;--mdui-color-primary:239,68,68;';
            }
            spinnerWrapper.appendChild(spinner);
            avatar.replaceWith(spinnerWrapper);
            avatar._spinnerWrapper = spinnerWrapper;
        }
        try {
            await viewAppInfo(app.package_name);
        } finally {
            if (avatar && avatar._spinnerWrapper) {
                avatar._spinnerWrapper.replaceWith(avatar);
                delete avatar._spinnerWrapper;
            }
            isFetchingAppInfo = false;
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
            // Check if we have partial info available immediately
            const app = (appsList.apps.user && appsList.apps.user[pkg]) || 
                        (appsList.apps.system && appsList.apps.system[pkg]);
            
            if (app) {
                // Show what we have
                showInfoDialog({
                    packageName: app.package_name,
                    label: app.label,
                    version: app.versionName,
                    uid: '',
                    isSystem: app.isSystem,
                    enabled: app.enabled,
                    installTime: '',
                    updateTime: '',
                    apkPath: '',
                    permissions: [],
                    isPartial: true
                });
                return;
            }

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
            const enabled = !disabledApps.has(pkg);
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

    const statusClass = appInfo.enabled ? 'bg-green-900 text-white' : 'bg-red-900 text-white';
    const html = els.appInfoTemplate.innerHTML
        .replace(/{{app.packageName}}/g, appInfo.packageName)
        .replace(/{{app.label}}/g, appInfo.label)
        .replace(/{{app.version}}/g, appInfo.version)
        .replace(/{{app.uid}}/g, appInfo.uid || '')
        .replace(/{{app.type}}/g, appInfo.isSystem ? '系統程式' : '使用者程式')
        .replace(/{{app.statusClass}}/g, statusClass)
        .replace(/{{app.isEnable}}/g, appInfo.enabled ? '啟用中' : '已停用')
        .replace(/{{app.installTime}}/g, appInfo.installTime)
        .replace(/{{app.updateTime}}/g, appInfo.updateTime);
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
    setupDialogButtons(dialog, appInfo);
    setTimeout(() => {
        if (isConnected) {
            dialog.open = true;
        } else {
            document.body.removeChild(dialog);
        }
    }, 1);
}

function setupDialogButtons(dialog, appInfo) {
    const btns = {
        enable: dialog.querySelector("mdui-button[icon='power_settings_new']"),
        disable: dialog.querySelector("mdui-button[icon='power_off']"),
        extract: dialog.querySelector("mdui-button[icon='download']"),
        delete: dialog.querySelector("mdui-button[icon='delete']")
    };
    btns.enable.disabled = appInfo.enabled;
    btns.disable.disabled = !appInfo.enabled;
    
    // Pass isSystem to toggleAppState and promptDelete
    btns.enable.addEventListener('click', () => toggleAppState(appInfo.packageName, true, dialog, appInfo.isSystem));
    btns.disable.addEventListener('click', () => toggleAppState(appInfo.packageName, false, dialog, appInfo.isSystem));
    btns.extract.addEventListener('click', () => downloadAPK(appInfo.packageName, dialog));
    btns.delete.addEventListener('click', () => promptDelete(dialog, appInfo.packageName, appInfo.isSystem));
}

function showSystemWarning(pkg, callback) {
    const dialog = els.dialogSystemWarning;
    
    // Move to end of body to ensure it shows on top of app detail dialog
    document.body.appendChild(dialog);

    const nameEl = document.getElementById('sys-warning-app-name');
    const confirmBtn = document.getElementById('confirm-sys-warning-btn');
    
    nameEl.textContent = pkg;
    
    // Override onclick to prevent multiple listeners
    confirmBtn.onclick = () => {
        dialog.open = false;
        callback();
    };
    
    dialog.open = true;
}

async function toggleAppState(pkg, enable, dialog, isSystem = false) {
    // Check if device is connected before performing operations
    if (!isConnected) {
        showSnackAlert('設備未連接，無法執行操作');
        dialog.open = false;
        return;
    }

    const action = async () => {
        const func = enable ? enableAPP : disableAPP;
        try {
            await func(pkg);
            showSnackAlert(`應用程式 ${pkg} ${enable ? '已啟用' : '已停用'}`);
            if (enable) {
                disabledApps.delete(pkg);
            } else {
                disabledApps.add(pkg);
            }
            dialog.open = false;
            await refreshAppList();
        } catch (err) {
            console.error(`${enable ? 'Enable' : 'Disable'} app error:`, err);
            if (isConnected) {
                showSnackAlert(`錯誤：${enable ? '啟用' : '停用'}應用程式失敗`);
            }
        }
    };

    if (!enable && isSystem) {
        // Disabling a system app -> Show Warning
        showSystemWarning(pkg, action);
    } else {
        await action();
    }
}

function promptDelete(curDialog, pkg, isSystem = false) {
    curDialog.open = false;
    
    const showDeleteConfirm = () => {
        const nameEl = document.getElementById('delete-app-name');
        nameEl.textContent = pkg;
        els.dialogDeleteApp.open = true;
        document.getElementById('confirm-delete-btn').onclick = () => {
            uninstallApp(pkg);
            els.dialogDeleteApp.open = false;
        };
    };

    if (isSystem) {
        showSystemWarning(pkg, showDeleteConfirm);
    } else {
        showDeleteConfirm();
    }
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
    manuallyDisconnected = false;

    try {
        await finalizeConnection(deviceId);
    } catch (err) {
        console.error('[Wireless] Error during wireless connection finalization:', err);
    }
};

// Handle device change events (called from integration.js)
let appInitialized = false;
let _deviceChangeTimer = null;
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

    // Skip during wireless connection process
    if (typeof window.wirelessConnectionState !== 'undefined' &&
        window.wirelessConnectionState && window.wirelessConnectionState.isConnecting) {
        console.log('[USB] Ignoring device change during wireless connection process');
        return;
    }

    // Debounce: cancel previous timer and wait for events to settle
    if (_deviceChangeTimer) {
        clearTimeout(_deviceChangeTimer);
    }

    _deviceChangeTimer = setTimeout(async () => {
        _deviceChangeTimer = null;

        if (manuallyDisconnected) {
            console.log('[USB] Ignoring device change after manual disconnect');
            return;
        }

        // Don't auto-connect while wireless dialog is open
        const wirelessDialog = document.querySelector('.dialog-wireless-connect');
        if (wirelessDialog && wirelessDialog.open) {
            console.log('[USB] Ignoring device change while wireless dialog is open');
            return;
        }

        // getDevice() already queries `adb devices` and handles single/multi device logic
        await getDevice();
    }, 1200);
};

// Setup USB Device Change Monitoring
function setupUSBDeviceMonitoring() {
    console.log('[USB] Device change monitoring handler registered');
}

// Filter/sort menu logic
const filterBtn = document.getElementById('button-filter');
const filterMenu = document.getElementById('filter-menu');

// Filter menu items
const filterItems = {
    all: document.getElementById('filter-all'),
    user: document.getElementById('filter-user'),
    system: document.getElementById('filter-system')
};
const sortItems = {
    name: document.getElementById('sort-name'),
    package: document.getElementById('sort-package'),
    status: document.getElementById('sort-status')
};

function updateFilterMenuIcons() {
    for (const [key, item] of Object.entries(filterItems)) {
        item.setAttribute('icon', key === currentFilter ? 'done' : '');
    }
    for (const [key, item] of Object.entries(sortItems)) {
        item.setAttribute('icon', key === currentSort ? 'done' : '');
    }
}

filterBtn.addEventListener('click', (e) => {
    const rect = filterBtn.getBoundingClientRect();
    filterMenu.style.top = `${rect.bottom + 4}px`;
    filterMenu.style.right = '20px';
    filterMenu.style.left = 'auto';
    filterMenu.classList.toggle('hidden');
    updateFilterMenuIcons();
});

// Close menu on outside click
document.addEventListener('click', (e) => {
    if (!filterMenu.contains(e.target) && e.target !== filterBtn) {
        filterMenu.classList.add('hidden');
    }
});

for (const [key, item] of Object.entries(filterItems)) {
    item.addEventListener('click', () => {
        currentFilter = key;
        updateFilterMenuIcons();
        filterMenu.classList.add('hidden');
        if (isConnected) {
            const term = els.searchInput.value.trim().toLowerCase();
            const toShow = term ? filterApps(appsList, term) : appsList;
            renderAppList(toShow);
        }
    });
}

for (const [key, item] of Object.entries(sortItems)) {
    item.addEventListener('click', () => {
        currentSort = key;
        updateFilterMenuIcons();
        filterMenu.classList.add('hidden');
        if (isConnected) {
            const term = els.searchInput.value.trim().toLowerCase();
            const toShow = term ? filterApps(appsList, term) : appsList;
            renderAppList(toShow);
        }
    });
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
        manuallyDisconnected = false;
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
    manuallyDisconnected = true;
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
    manuallyDisconnected = true;
    toggleConnectionIcon(false, false);

    clearAppList();

    els.dialogWirelessConnect.open = true;
}

async function executeDisconnectCommands() {
    try {
        await runADBcommand('disconnect');
        showSnackAlert('已中斷連線目前裝置');
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
            // Re-check devices in case new ones appeared during initialization
            getDevice();
        }, 2000);
    });

    // Setup USB Device Change Monitoring
    setupUSBDeviceMonitoring();

    // els.dialogWirelessConnect.open = true;
}

initApp();
