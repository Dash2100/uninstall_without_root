// Execute an ADB command
async function runADBcommand(command) {
    console.log('[adb] ADB command:', command);
    appendToTerminal(`> ${command}`, 'command');
    try {
        const response = await window.executeAdbCommand(command);
        appendToTerminal(response || '(No output)', 'response');
        return response;
    } catch (error) {
        console.error('[adb] ADB error:', error);
        appendToTerminal(error.toString(), 'error');
        throw error;
    }
}

// Uninstall an app
async function deleteAPP(packageName, deleteData = false) {
    const baseCmd = `shell pm uninstall --user 0 ${deleteData ? '-k ' : ''}${packageName}`;
    const cmd = selectedDevice ? `-s ${selectedDevice} ${baseCmd}` : baseCmd;
    try {
        const response = await runADBcommand(cmd);
        const success = response.includes('Success');
        appendToTerminal(
            success
                ? `App ${packageName} uninstalled successfully.`
                : `Failed to uninstall app ${packageName}.`,
            success ? 'success' : 'error'
        );
        return success;
    } catch (error) {
        appendToTerminal(`Error uninstalling app ${packageName}: ${error}`, 'error');
        throw error;
    }
}

// Enable an app
async function enableAPP(packageName) {
    const baseCmd = `shell pm enable --user 0 ${packageName}`;
    const cmd = selectedDevice ? `-s ${selectedDevice} ${baseCmd}` : baseCmd;
    try {
        const response = await runADBcommand(cmd);
        const success = response.includes('new state: enabled');
        appendToTerminal(
            success
                ? `App ${packageName} enabled successfully.`
                : `Failed to enable app ${packageName}.`,
            success ? 'success' : 'error'
        );
        return success;
    } catch (error) {
        appendToTerminal(`Error enabling app ${packageName}: ${error}`, 'error');
        throw error;
    }
}

// Disable an app
async function disableAPP(packageName) {
    const baseCmd = `shell pm disable-user --user 0 ${packageName}`;
    const cmd = selectedDevice ? `-s ${selectedDevice} ${baseCmd}` : baseCmd;
    try {
        const response = await runADBcommand(cmd);
        const success = response.includes('new state: disabled');
        appendToTerminal(
            success
                ? `App ${packageName} disabled successfully.`
                : `Failed to disable app ${packageName}.`,
            success ? 'success' : 'error'
        );
        return success;
    } catch (error) {
        appendToTerminal(`Error disabling app ${packageName}: ${error}`, 'error');
        throw error;
    }
}

// Check APK status
async function checkAPK() {
    try {
        const response = await window.renameAndMoveApk();
        const resp = typeof response === 'string' ? JSON.parse(response) : response;
        if (resp.error) return 'error';
        return resp.state ? 'done' : 'not found';
    } catch {
        return 'error';
    }
}

// Poll for APK file
async function pullingCheckAPK(packageName, targetPath, maxRetries = 10, interval = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const exists = await window.checkFileExists(targetPath);
            if (exists) {
                appendToTerminal(`APK ${packageName} 已成功提取到 ${targetPath}`, 'success');
                return true;
            }
            appendToTerminal(`檢查 APK 中...（${attempt}/${maxRetries}）`, 'info');
            await new Promise((res) => setTimeout(res, interval));
        } catch (error) {
            appendToTerminal(`檢查文件存在時出錯: ${error}`, 'error');
            throw error;
        }
    }
    appendToTerminal(`提取 APK ${packageName} 超時`, 'error');
    throw new Error('提取超時');
}

// Extract and handle APK
async function extractAPK(packageName, extractPath) {
    const apkInfo =
        (appsList.apps.system && appsList.apps.system[packageName]) ||
        (appsList.apps.user && appsList.apps.user[packageName]);
    const apkPath = apkInfo && apkInfo.app_path;
    if (!apkPath) {
        appendToTerminal(`APK path for ${packageName} not found.`, 'error');
        throw new Error(`APK 路徑未找到`);
    }

    try {
        const tempPath = await window.getTempFolderPath();
        await window.formatTempFolder();
        const targetPath = `${tempPath}/${packageName}.apk`;

        appendToTerminal(`提取 APK 中: ${packageName}`, 'info');
        const pullCmd = selectedDevice
            ? `-s ${selectedDevice} pull "${apkPath}" "${targetPath}"`
            : `pull "${apkPath}" "${targetPath}"`;
        await runADBcommand(pullCmd);
        appendToTerminal(`開始檢查 APK 是否已提取...`, 'info');
        await pullingCheckAPK(packageName, targetPath);

        const response2 = await window.renameAndMoveApk();
        const resp2 = typeof response2 === 'string' ? JSON.parse(response2) : response2;
        if (resp2.error) {
            appendToTerminal(`移動 APK 時出錯`, 'error');
            throw new Error('移動 APK 時出錯');
        }

        appendToTerminal('APK 已成功提取並處理', 'success');
        return true;
    } catch (error) {
        appendToTerminal(`Error extracting APK ${packageName}: ${error}`, 'error');
        throw error;
    }
}
