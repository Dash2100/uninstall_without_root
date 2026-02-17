// App operations: enable, disable, delete, extract APK

async function toggleAppState(pkg, enable, dialog, isSystem = false) {
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
    if (!isConnected) {
        showSnackAlert('設備未連接，無法提取 APK');
        return;
    }

    const extractBtn = dialog.querySelector("mdui-button[icon='download']");
    extractBtn.loading = true;
    extractBtn.disabled = true;
    dialog.setAttribute('close-on-overlay-click', 'false');

    window.getConfig()
        .then(cfg => extractAPK(pkg, cfg.extract_path))
        .then(result => {
            if (isConnected) {
                if (result) {
                    const filePath = typeof result === 'string' ? result : null;
                    showSnackAlert(`應用程式 ${pkg} 已成功提取`, filePath ? {
                        actionText: '顯示檔案',
                        onAction: () => window.openFilePath(filePath)
                    } : {});
                } else {
                    showSnackAlert(`提取應用程式 ${pkg} 失敗`);
                }
            }
        })
        .catch(err => {
            console.error('Extract APK error:', err);
            if (isConnected) {
                showSnackAlert('錯誤：提取應用程式失敗');
            }
        })
        .finally(() => {
            extractBtn.loading = false;
            extractBtn.disabled = false;
            dialog.setAttribute('close-on-overlay-click', 'true');
        });
}
