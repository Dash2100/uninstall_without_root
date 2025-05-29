const { app } = require("electron");

// === Element References ===
const appLoading = document.getElementById("app-loading");
const dialogWarning = document.querySelector(".dialog-warning");
const dialogDeleteApp = document.querySelector(".dialog-delete-app");
const dialogAppInfoTemplate = document.getElementById("app-card-template");
const appInfoDialogTemplate = document.getElementById("app-info-template");

const iconConnected = document.getElementById("icon-connected");
const iconDisconnected = document.getElementById("icon-disconnected");

const buttonApplistRefresh = document.getElementById("button-applist-refresh");

const appListContainer = document.getElementById("app-list-content");
const appListLoadingPlaceholder = document.getElementById("app-list-loading");
const appListConnectPlaceholder = document.getElementById("app-list-disconnected");

const searchInput = document.getElementById("search-input");

// === State ===
let isConnected = false;
let appsList = { apps: { user: {}, system: {} } };
let disabledApps = [];

// === UI Helpers ===
function toggleConnectionIcon(connected) {
    if (connected) {
        iconConnected.classList.remove("hidden");
        iconDisconnected.classList.add("hidden");
    } else {
        iconConnected.classList.add("hidden");
        iconDisconnected.classList.remove("hidden");
    }
}

function clearAppList() {
    appListContainer.innerHTML = "";
    appListContainer.style.display = "none";
}

function clearAppListPlaceholders() {
    appListLoadingPlaceholder.style.display = "none";
    appListConnectPlaceholder.style.display = "none";
    appListContainer.style.display = "block";
}

function showLoading() {
    appListContainer.style.display = "none";
    appListConnectPlaceholder.style.display = "none";
    appListLoadingPlaceholder.style.display = "flex";
}

// === Core Logic ===
async function getDevice() {
    isConnected = false;
    toggleConnectionIcon(false);
    try {
        const output = await runADBcommand("devices");
        if (!output.includes("List of devices attached")) {
            clearAppList();
            showSnackAlert("無法連接到設備");
            return;
        }
        const lines = output.trim().split("\n").slice(1).filter(Boolean);
        if (!lines.length) {
            showSnackAlert("目前沒有連接到設備");
            clearAppList();
            return;
        }
        const [id, status] = lines[0].trim().split("\t");
        if (status !== "device") {
            showSnackAlert(`連接到設備: ${id} 失敗，目前狀態: ${status}`);
            clearAppList();
            return;
        }
        isConnected = true;
        toggleConnectionIcon(true);
        showSnackAlert(`已連接到設備: ${id}`);
        await refreshAppList();
    } catch (err) {
        console.error('[adb] Get Device Error:', err);
        showSnackAlert("連接設備時發生錯誤");
        clearAppList();
    }
}

async function refreshAppList() {
    showLoading();
    try {
        disabledApps = await fetchDisabledApps();
        appsList = await fetchApps();
        const term = searchInput.value.trim().toLowerCase();
        const toShow = term ? filterApps(appsList, term) : appsList;
        renderAppList(toShow);
    } catch (err) {
        console.error('[adb] Refresh App List Error:', err);
        clearAppList();
        showSnackAlert("獲取應用程式列表時發生錯誤");
    }
}

async function fetchDisabledApps() {
    try {
        const res = await runADBcommand("shell pm list packages -d");
        return res.trim().split("\n").map(line => line.replace(/^package:/, "").trim());
    } catch (err) {
        console.error('[adb] Get Disabled Apps Error:', err);
        showSnackAlert("獲取「已停用的應用程式」時發生錯誤");
        return [];
    }
}

async function fetchApps() {
    const res = await runADBcommand("shell pm list packages -f");
    const lines = res.trim().split("\n");
    const apps = { user: {}, system: {} };
    lines.forEach(line => {
        const match = /package:(.+)=([^\s]+)/.exec(line);
        let apkPath = "", pkg = "";
        if (match) {
            apkPath = match[1];
            pkg = match[2];
        } else {
            pkg = line.replace('package:', '').trim();
        }
        const isUser = line.includes('/data/app/') || line.includes('/data/user/');
        const target = isUser ? apps.user : apps.system;
        target[pkg] = { package_name: pkg, app_path: apkPath };
    });
    return { apps };
}

function filterApps({ apps }, term) {
    const filtered = { apps: { user: {}, system: {} } };
    ['user', 'system'].forEach(type => {
        Object.values(apps[type]).forEach(app => {
            if (app.package_name.toLowerCase().includes(term)) {
                filtered.apps[type][app.package_name] = app;
            }
        });
    });
    return filtered;
}

function renderAppList({ apps }) {
    clearAppListPlaceholders();
    appListContainer.innerHTML = '';
    const frag = document.createDocumentFragment();
    Object.values(apps.user).forEach(app => frag.appendChild(createAppCard(app, '使用者程式')));
    Object.values(apps.system).forEach(app => frag.appendChild(createAppCard(app, '系統程式')));
    appListContainer.appendChild(frag);
}

function createAppCard(app, type) {
    const tmpl = dialogAppInfoTemplate.innerHTML;
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
        const info = await runADBcommand(`shell dumpsys package ${pkg}`);
        const { versionName, versionCode, lastUpdateTime } = parseAppInfo(info);
        const enabled = !disabledApps.includes(pkg);
        showInfoDialog(pkg, versionName, versionCode, lastUpdateTime, enabled);
    } catch (err) {
        console.error('Get package info error:', err);
        showInfoDialog(pkg, '未知', '未知', '未知', false);
    }
}

function parseAppInfo(info) {
    const nameM = /versionName=([^\s]+)/.exec(info);
    const codeM = /versionCode=([^\s]+)/.exec(info);
    const timeM = /lastUpdateTime=([^\n]+)/.exec(info);
    return {
        versionName: nameM?.[1] || '未知',
        versionCode: codeM?.[1] || '未知',
        lastUpdateTime: timeM?.[1] || '未知'
    };
}

function showInfoDialog(pkg, vName, vCode, updated, enabled) {
    const content = appInfoDialogTemplate.innerHTML
        .replace(/{{app.packageName}}/g, pkg)
        .replace(/{{app.version}}/g, `${vName} (${vCode})`)
        .replace(/{{app.latestUpdate}}/g, updated)
        .replace(/{{app.isEnable}}/g, enabled ? '啟用中' : '已停用');
    const div = document.createElement('div');
    div.innerHTML = content;
    const dialog = div.querySelector('.dialog-appinfo');
    document.body.appendChild(dialog);
    setupDialogButtons(dialog, pkg, enabled);
    setTimeout(() => dialog.open = true, 1);
}

function setupDialogButtons(dialog, pkg, enabled) {
    const btnEnable = dialog.querySelector("mdui-button[icon='power_settings_new']");
    const btnDisable = dialog.querySelector("mdui-button[icon='power_off']");
    const btnExtract = dialog.querySelector("mdui-button[icon='download']");
    const btnDelete = dialog.querySelector("mdui-button[icon='delete']");

    btnEnable.disabled = enabled;
    btnDisable.disabled = !enabled;

    btnEnable.addEventListener('click', async () => toggleAppState(pkg, true, dialog));
    btnDisable.addEventListener('click', async () => toggleAppState(pkg, false, dialog));
    btnExtract.addEventListener('click', () => downloadAPK(pkg));
    btnDelete.addEventListener('click', () => promptDelete(dialog, pkg));
}

async function toggleAppState(pkg, enable, dialog) {
    const action = enable ? enableAPP : disableAPP;
    try {
        const ok = await action(pkg);
        showSnackAlert(`應用程式 ${pkg} ${enable ? '已啟用' : '已停用'}`);
        if (enable) disabledApps = disabledApps.filter(n => n !== pkg);
        else if (!disabledApps.includes(pkg)) disabledApps.push(pkg);
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
    dialogDeleteApp.open = true;
    document.getElementById('confirm-delete-btn').onclick = () => {
        uninstallApp(pkg);
        dialogDeleteApp.open = false;
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

function downloadAPK(pkg) {
    window.getConfig()
        .then(cfg => extractAPK(pkg, cfg.extrect_path))
        .then(ok => showSnackAlert(ok
            ? `應用程式 ${pkg} 已成功提取`
            : `提取應用程式 ${pkg} 失敗`)
        )
        .catch(err => {
            console.error('Extract APK error:', err);
            showSnackAlert('錯誤：提取應用程式失敗');
        });
}

// === Event Listeners ===
buttonApplistRefresh.addEventListener('click', () => {
    if (isConnected) refreshAppList();
});

searchInput.addEventListener('input', () => {
    if (!isConnected) return;
    const term = searchInput.value.trim().toLowerCase();
    const toShow = term ? filterApps(appsList, term) : appsList;
    renderAppList(toShow);
});

function confirmWarning() {
    dialogWarning.open = false;
    clearAppList();
    getDevice();
}

// === Init ===
function initApp() {
    appLoading.classList.remove('app-loading-showing');
    switchPage('appList');
    confirmWarning();
}

initApp();
