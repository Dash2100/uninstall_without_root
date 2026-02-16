// App info: detail view, dialog, system warning

async function viewAppInfo(pkg) {
    if (!isConnected) {
        showSnackAlert('設備未連接，無法查看應用程式信息');
        return;
    }

    try {
        if (useHelperMethod) {
            const app = (appsList.apps.user && appsList.apps.user[pkg]) ||
                        (appsList.apps.system && appsList.apps.system[pkg]);

            if (app) {
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
            const command = selectedDevice ? `-s ${selectedDevice} ${shellCmd}` : shellCmd;
            const res = await runADBcommand(command, 0);
            const info = JSON.parse(res.trim());
            showInfoDialog({
                packageName: info.packageName,
                label: info.label || info.packageName,
                version: `${info.versionName} (${info.versionCode})`,
                uid: info.uid,
                isSystem: info.isSystem,
                enabled: info.enabled,
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
            showInfoDialog({
                packageName: pkg,
                label: pkg,
                version: `${parsed.versionName} (${parsed.versionCode})`,
                uid: '',
                isSystem: false,
                enabled: !disabledApps.has(pkg),
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

function formatTimestamp(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleString();
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

    dialog.querySelectorAll('.app-info-row').forEach(row => {
        const val = row.querySelector('.app-info-value');
        if (val && !val.textContent.trim()) row.style.display = 'none';
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
    btns.enable.addEventListener('click', () => toggleAppState(appInfo.packageName, true, dialog, appInfo.isSystem));
    btns.disable.addEventListener('click', () => toggleAppState(appInfo.packageName, false, dialog, appInfo.isSystem));
    btns.extract.addEventListener('click', () => downloadAPK(appInfo.packageName, dialog));
    btns.delete.addEventListener('click', () => promptDelete(dialog, appInfo.packageName, appInfo.isSystem));
}

function showSystemWarning(pkg, callback) {
    const dialog = els.dialogSystemWarning;
    document.body.appendChild(dialog);

    const nameEl = document.getElementById('sys-warning-app-name');
    const confirmBtn = document.getElementById('confirm-sys-warning-btn');
    nameEl.textContent = pkg;
    confirmBtn.onclick = () => {
        dialog.open = false;
        callback();
    };
    dialog.open = true;
}
